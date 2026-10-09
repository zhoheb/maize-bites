import { PUBLISH_CONFIDENCE, REVIEW_CONFIDENCE } from '@maize-bites/shared';
import {
  callBudget,
  classifyWithLlm,
  estimateCostUsd,
  type CreateMessage,
  type LlmOutcome,
} from '../classifier/llm.js';
import { mapWithConcurrency } from '../classifier/pool.js';
import { decideRulesMode } from '../classifier/rules-mode.js';
import { prefilter } from '../classifier/rules.js';
import { LLM_CONCURRENCY } from '../classifier/classify-events.js';
import { toClassifierInput, type LabeledItem } from './labeled.js';
import { binaryMetrics, type BinaryMetrics } from './metrics.js';

export interface EvalRow {
  item: LabeledItem;
  actual: boolean;
  rulesCandidate: boolean;
  /** What CLASSIFIER_MODE=rules would publish: the strict rules-mode decider's verdict. */
  rulesModePublished: boolean;
  /** Absent when the LLM stage didn't run for this item (not a candidate, or rules-only). */
  llm?: LlmOutcome | { status: 'error'; message: string };
  /** Final publish decision under rules + LLM. */
  published: boolean;
}

export interface EvalReport {
  totalItems: number;
  labeled: number;
  rules: BinaryMetrics;
  /** CLASSIFIER_MODE=rules: the strict decider alone, no LLM. */
  rulesMode: BinaryMetrics;
  /** null in rules-only mode. */
  combined: BinaryMetrics | null;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  reviewBand: number;
  llmFailures: number;
  deferred: number;
  rows: EvalRow[];
}

/**
 * Scores the prefilter (candidate = positive), rules mode (the strict decider's verdict), and
 * rules + LLM (the publish rule: LLM says free
 * food with confidence >= PUBLISH_CONFIDENCE) against hand labels.
 */
export async function runEval(
  items: readonly LabeledItem[],
  options: { createMessage: CreateMessage | null; maxCalls: number },
): Promise<EvalReport> {
  const labeled = items.filter(
    (i): i is LabeledItem & { label: { has_free_food: boolean } } => i.label.has_free_food !== null,
  );
  const budget = callBudget(options.maxCalls);

  const rows = await mapWithConcurrency(
    labeled,
    LLM_CONCURRENCY,
    async (item): Promise<EvalRow> => {
      const input = toClassifierInput(item);
      const rulesCandidate = prefilter(input).candidate;
      const base = {
        item,
        actual: item.label.has_free_food,
        rulesCandidate,
        rulesModePublished: decideRulesMode(input).hasFreeFood,
      };
      if (!rulesCandidate || !options.createMessage) return { ...base, published: false };
      try {
        const llm = await classifyWithLlm(options.createMessage, input, budget);
        const published =
          llm.status === 'ok' &&
          llm.verdict.has_free_food &&
          llm.verdict.confidence >= PUBLISH_CONFIDENCE;
        return { ...base, llm, published };
      } catch (error) {
        return {
          ...base,
          llm: { status: 'error', message: error instanceof Error ? error.message : String(error) },
          published: false,
        };
      }
    },
  );

  let llmCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let reviewBand = 0;
  let llmFailures = 0;
  let deferred = 0;
  for (const row of rows) {
    if (!row.llm) continue;
    if (row.llm.status === 'error' || row.llm.status === 'invalid') llmFailures += 1;
    if (row.llm.status === 'deferred') deferred += 1;
    if (row.llm.status === 'error') continue;
    llmCalls += row.llm.usage.calls;
    inputTokens += row.llm.usage.inputTokens;
    outputTokens += row.llm.usage.outputTokens;
    if (row.llm.status === 'ok') {
      const { has_free_food, confidence } = row.llm.verdict;
      if (has_free_food && confidence >= REVIEW_CONFIDENCE && confidence < PUBLISH_CONFIDENCE)
        reviewBand += 1;
    }
  }

  return {
    totalItems: items.length,
    labeled: labeled.length,
    rules: binaryMetrics(rows.map((r) => ({ predicted: r.rulesCandidate, actual: r.actual }))),
    rulesMode: binaryMetrics(
      rows.map((r) => ({ predicted: r.rulesModePublished, actual: r.actual })),
    ),
    combined: options.createMessage
      ? binaryMetrics(rows.map((r) => ({ predicted: r.published, actual: r.actual })))
      : null,
    llmCalls,
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateCostUsd({ inputTokens, outputTokens }),
    reviewBand,
    llmFailures,
    deferred,
    rows,
  };
}
