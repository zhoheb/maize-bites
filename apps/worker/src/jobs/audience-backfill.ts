import {
  listLiveEventsWithActiveClassification,
  listPublishedEvents,
  setMachineAudience,
  toFoodEvent,
  type Database,
  type EventCursor,
  type PublishedEvent,
} from '@maize-bites/db';
import { AUDIENCES, type Audience } from '@maize-bites/shared';
import { detectAudience } from '../classifier/audience.js';
import type { Logger } from '../scheduler.js';

export type AudienceCounts = Record<Audience, number>;

export interface AudienceSample {
  title: string;
  evidence: string | null;
  url: string | null;
}

export interface AudienceBackfillResult {
  /** Published current and upcoming events, by the audience the site showed before. */
  before: AudienceCounts;
  /** The same, after (in a dry run, what it would be). */
  after: AudienceCounts;
  /** Machine verdicts whose audience or evidence changed (or would). */
  changed: number;
  /** Live events whose active verdict is manual: left as the reviewer set it. */
  keptManual: number;
  /** Up to `samplesPerAudience` published events per audience, after. */
  samples: Record<Audience, AudienceSample[]>;
}

const emptyCounts = (): AudienceCounts =>
  Object.fromEntries(AUDIENCES.map((a) => [a, 0])) as AudienceCounts;

async function allPublished(db: Database, now: Date): Promise<PublishedEvent[]> {
  const items: PublishedEvent[] = [];
  let after: EventCursor | undefined;
  for (;;) {
    const page = await listPublishedEvents(db, { from: now, after, limit: 500 });
    items.push(...page.items);
    if (!page.nextCursor) return items;
    after = page.nextCursor;
  }
}

/**
 * Reapplies the audience rules (AUDIENCE_RULES) to the active verdict of every current and
 * upcoming event: open, members, or rsvp only with the listing's words, otherwise unknown.
 * Manual verdicts are kept. LLM verdicts are rewritten too, since few of their audiences carry
 * a checked quote. `before` counts what the old site showed (a stored audience without
 * evidence, or none, read at face value, with null as unknown).
 */
export async function backfillAudience({
  db,
  now,
  logger,
  dryRun = false,
  samplesPerAudience = 10,
}: {
  db: Database;
  now: Date;
  logger: Logger;
  dryRun?: boolean;
  samplesPerAudience?: number;
}): Promise<AudienceBackfillResult> {
  const before = emptyCounts();
  const publishedBefore = await allPublished(db, now);
  for (const { classification } of publishedBefore)
    before[classification?.audience ?? 'unknown'] += 1;

  // In a dry run, the new audience per classification id, applied when counting "after".
  const planned = new Map<string, { audience: Audience; audienceEvidence: string | null }>();
  let changed = 0;
  let keptManual = 0;
  for (const { event, classification } of await listLiveEventsWithActiveClassification(db, now)) {
    if (!classification) continue;
    if (classification.method === 'manual') {
      keptManual += 1;
      continue;
    }
    const { audience, evidence } = detectAudience(event);
    if (classification.audience === audience && classification.audienceEvidence === evidence)
      continue;
    changed += 1;
    const next = { audience, audienceEvidence: evidence };
    if (dryRun) planned.set(classification.id, next);
    else await setMachineAudience(db, classification.id, next);
  }

  const after = emptyCounts();
  const samples = Object.fromEntries(AUDIENCES.map((a) => [a, []])) as unknown as Record<
    Audience,
    AudienceSample[]
  >;
  const publishedAfter = dryRun ? publishedBefore : await allPublished(db, now);
  for (const item of publishedAfter) {
    const plan = item.classification && planned.get(item.classification.id);
    const shown = toFoodEvent(
      plan && item.classification
        ? { ...item, classification: { ...item.classification, ...plan } }
        : item,
    );
    after[shown.audience] += 1;
    if (samples[shown.audience].length < samplesPerAudience)
      samples[shown.audience].push({
        title: shown.title,
        evidence: shown.audienceEvidence,
        url: shown.url,
      });
  }

  const fmt = (c: AudienceCounts) => AUDIENCES.map((a) => `${a} ${c[a]}`).join(' / ');
  logger.info(
    `[audience] ${dryRun ? 'dry run: would change' : 'changed'} ${changed} verdict(s), kept ${keptManual} manual; ` +
      `published before: ${fmt(before)}; after: ${fmt(after)}`,
  );
  return { before, after, changed, keptManual, samples };
}
