import Anthropic from '@anthropic-ai/sdk';
import {
  flagForReview,
  listEventsNeedingRules,
  listLlmCandidates,
  recordClassification,
  type ClassifierMode,
  type Database,
} from '@maize-bites/db';
import type { EventSource } from '@maize-bites/shared';
import type { Logger } from '../scheduler.js';
import { classifierInputFromEvent } from './input.js';
import { callBudget, classifyWithLlm, estimateCostUsd, type CreateMessage } from './llm.js';
import { mapWithConcurrency } from './pool.js';
import { decideRulesMode } from './rules-mode.js';
import { prefilter } from './rules.js';

/** Max LLM requests in flight. */
export const LLM_CONCURRENCY = 3;
/**
 * Rules verdicts are stored so each content version is prefiltered once. A candidate is stored
 * as a free-food verdict with confidence below the review band: hidden until the LLM rules.
 */
export const RULES_CANDIDATE_CONFIDENCE = 0.3;
export const RULES_NEGATIVE_CONFIDENCE = 0.9;

export interface LlmDeps {
  createMessage: CreateMessage;
  /** Hard cap on API requests per run, retries included. */
  maxCalls: number;
}

export interface ClassifyDeps {
  db: Database;
  logger: Logger;
  now: Date;
  /** Null when ANTHROPIC_API_KEY is unset: rules still run, candidates wait. */
  llm: LlmDeps | null;
  /**
   * "llm" (default): rules prefilter, then the LLM decides. "rules": the strict rules-mode
   * decider is the final judge, its positives are published, and `llm` is never used.
   */
  mode?: ClassifierMode;
}

export interface ClassifyStats {
  /** Verdicts stored (rules + LLM), by the event's source. */
  bySource: Partial<Record<EventSource, number>>;
  rulesClassified: number;
  rulesCandidates: number;
  /** Rules mode only: verdicts of free food, which are published as they stand. */
  rulesPublished: number;
  llmPending: number;
  llmCalls: number;
  llmClassified: number;
  flagged: number;
  deferred: number;
  llmErrors: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

/**
 * Rules mode: one final verdict per content version, straight from the rules. A positive is
 * stored above the publish threshold; everything else well below the review band.
 */
async function classifyInRulesMode(
  { db, logger, now }: Pick<ClassifyDeps, 'db' | 'logger' | 'now'>,
  stats: ClassifyStats,
): Promise<ClassifyStats> {
  for (const event of await listEventsNeedingRules(db, now, 'rules')) {
    const verdict = decideRulesMode(classifierInputFromEvent(event));
    // An approved tip is free food by a person's say-so; the rules only add the details.
    const isTip = event.source === 'submission';
    const hasFreeFood = isTip || verdict.hasFreeFood;
    await recordClassification(db, {
      eventId: event.id,
      contentHash: event.contentHash,
      method: 'rules',
      rulesMode: true,
      model: null,
      hasFreeFood,
      confidence: verdict.hasFreeFood
        ? verdict.confidence
        : isTip
          ? RULES_MODE_TIP_CONFIDENCE
          : verdict.confidence,
      foodItems: verdict.foodItems,
      mealType: verdict.mealType,
      dietary: verdict.dietary,
      audience: verdict.audience,
      audienceEvidence: verdict.audienceEvidence,
      evidence: verdict.hasFreeFood || !isTip ? verdict.evidence : 'community tip',
    });
    stats.rulesClassified += 1;
    stats.bySource[event.source] = (stats.bySource[event.source] ?? 0) + 1;
    if (hasFreeFood) stats.rulesPublished += 1;
  }
  logger.info(
    `[classify] rules mode: ${stats.rulesClassified} classified, ${stats.rulesPublished} published, ` +
      `${stats.rulesClassified - stats.rulesPublished} not free food; no LLM calls`,
  );
  return stats;
}

/** A tip the rules found no free-food statement in is still a person's report of free food. */
const RULES_MODE_TIP_CONFIDENCE = 0.75;

/** Stage 1 for new content, then stage 2 for candidates that still need an LLM verdict. */
export async function classifyPendingEvents({
  db,
  logger,
  now,
  llm,
  mode = 'llm',
}: ClassifyDeps): Promise<ClassifyStats> {
  const stats: ClassifyStats = {
    bySource: {},
    rulesClassified: 0,
    rulesCandidates: 0,
    rulesPublished: 0,
    llmPending: 0,
    llmCalls: 0,
    llmClassified: 0,
    flagged: 0,
    deferred: 0,
    llmErrors: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  };
  if (mode === 'rules') return classifyInRulesMode({ db, logger, now }, stats);

  for (const event of await listEventsNeedingRules(db, now)) {
    // Approved tips are free food by a person's say-so; skip the prefilter so the LLM extracts details.
    const verdict =
      event.source === 'submission'
        ? { candidate: true, matches: ['community tip'], excludedBy: null }
        : prefilter(event);
    await recordClassification(db, {
      eventId: event.id,
      contentHash: event.contentHash,
      method: 'rules',
      model: null,
      hasFreeFood: verdict.candidate,
      confidence: verdict.candidate ? RULES_CANDIDATE_CONFIDENCE : RULES_NEGATIVE_CONFIDENCE,
      evidence: (verdict.excludedBy ?? verdict.matches.join(', ')) || null,
    });
    stats.rulesClassified += 1;
    stats.bySource[event.source] = (stats.bySource[event.source] ?? 0) + 1;
    if (verdict.candidate) stats.rulesCandidates += 1;
  }

  const pending = await listLlmCandidates(db, now);
  stats.llmPending = pending.length;
  if (!llm) {
    if (pending.length > 0)
      logger.warn(
        `[classify] ANTHROPIC_API_KEY not set; ${pending.length} candidate(s) waiting for the LLM`,
      );
    return stats;
  }

  const budget = callBudget(llm.maxCalls);
  await mapWithConcurrency(pending, LLM_CONCURRENCY, async (event) => {
    try {
      const outcome = await classifyWithLlm(
        llm.createMessage,
        classifierInputFromEvent(event),
        budget,
      );
      stats.llmCalls += outcome.usage.calls;
      stats.inputTokens += outcome.usage.inputTokens;
      stats.outputTokens += outcome.usage.outputTokens;

      if (outcome.status === 'ok') {
        await recordClassification(db, {
          ...outcome.classification,
          eventId: event.id,
          contentHash: event.contentHash,
        });
        stats.llmClassified += 1;
        stats.bySource[event.source] = (stats.bySource[event.source] ?? 0) + 1;
      } else if (outcome.status === 'invalid') {
        await flagForReview(db, {
          eventId: event.id,
          contentHash: event.contentHash,
          reason: 'llm_invalid_output',
          detail: `${outcome.problem}\n---\n${outcome.lastOutput.slice(0, 2000)}`,
        });
        stats.flagged += 1;
        logger.warn(`[classify] ${event.id} flagged for review: ${outcome.problem}`);
      } else {
        stats.deferred += 1;
      }
    } catch (error) {
      stats.llmErrors += 1;
      // Retrying a bad key or permissions failure just burns the budget on errors.
      if (
        error instanceof Anthropic.AuthenticationError ||
        error instanceof Anthropic.PermissionDeniedError
      )
        budget.exhaust();
      logger.error(`[classify] LLM request failed for ${event.id}`, error);
    }
  });

  stats.estimatedCostUsd = estimateCostUsd(stats);
  if (stats.deferred > 0)
    logger.warn(
      `[classify] hit the ${llm.maxCalls}-call cap; ${stats.deferred} candidate(s) deferred to the next run`,
    );
  logger.info(
    `[classify] rules ${stats.rulesClassified} (${stats.rulesCandidates} candidates), llm ${stats.llmClassified} classified / ` +
      `${stats.flagged} flagged / ${stats.deferred} deferred / ${stats.llmErrors} errors, ${stats.llmCalls} calls ≈ $${stats.estimatedCostUsd.toFixed(4)}`,
  );
  return stats;
}
