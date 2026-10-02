import { describe, expect, it } from 'vitest';
import { fakeMessage, mockAnthropic, verdictJson } from '../test/anthropic-mock.js';
import { loadLabeledFile, type LabeledItem } from './labeled.js';
import { runEval } from './run-eval.js';

describe('eval/labeled.json', () => {
  it('parses, has 20 unlabeled starter items from the fixture, and unique ids', () => {
    const file = loadLabeledFile();
    expect(file.items).toHaveLength(20);
    expect(
      file.items.every((i) => i.label.has_free_food === null && i.label.audience === null),
    ).toBe(true);
    expect(new Set(file.items.map((i) => i.id)).size).toBe(20);
  });
});

function item(
  id: string,
  title: string,
  actual: boolean | null,
  description: string | null = null,
): LabeledItem {
  return {
    id,
    event: {
      title,
      description,
      locationName: null,
      room: null,
      startsAt: '2026-10-01T16:00:00.000Z',
      endsAt: null,
      tags: [],
      sponsor: null,
      cost: null,
    },
    label: { has_free_food: actual, audience: null },
    notes: '',
  };
}

const items = [
  item('a', 'Free pizza social', true, 'Free pizza for all'),
  item('b', 'Pizza history lecture', false, 'A talk about pizza'),
  item('c', 'Career fair', true, 'Recruiters from 50 companies'), // food not mentioned: rules miss it
  item('d', 'Algebra seminar', false),
  item('e', 'Unlabeled', null, 'Free pizza'),
];

describe('runEval', () => {
  it('scores rules-only without calling the LLM', async () => {
    const report = await runEval(items, { createMessage: null, maxCalls: 10 });

    expect(report).toMatchObject({
      totalItems: 5,
      labeled: 4,
      combined: null,
      llmCalls: 0,
      estimatedCostUsd: 0,
    });
    expect(report.rules).toMatchObject({ tp: 1, fp: 1, fn: 1, tn: 1, precision: 0.5, recall: 0.5 });
  });

  it('scores rules + LLM, calling the LLM only for rules candidates', async () => {
    const create = mockAnthropic(
      fakeMessage(verdictJson({ evidence: 'Free pizza' })),
      fakeMessage(
        verdictJson({
          has_free_food: false,
          confidence: 0.95,
          evidence: 'A talk about pizza',
          meal_type: null,
        }),
      ),
    );

    const report = await runEval(items, { createMessage: create, maxCalls: 10 });

    expect(create).toHaveBeenCalledTimes(2);
    expect(report.combined).toMatchObject({
      tp: 1,
      fp: 0,
      fn: 1,
      tn: 2,
      precision: 1,
      recall: 0.5,
    });
    expect(report).toMatchObject({
      llmCalls: 2,
      inputTokens: 2000,
      outputTokens: 200,
      llmFailures: 0,
    });
    expect(report.estimatedCostUsd).toBeCloseTo(0.003, 10);
  });

  it('treats review-band confidence as not published and counts it', async () => {
    const create = mockAnthropic(
      fakeMessage(verdictJson({ confidence: 0.55, evidence: 'Free pizza' })),
      fakeMessage(
        verdictJson({ has_free_food: false, evidence: '', meal_type: null, food_items: [] }),
      ),
    );

    const report = await runEval(items, { createMessage: create, maxCalls: 10 });

    expect(report.reviewBand).toBe(1);
    expect(report.combined).toMatchObject({ tp: 0, fn: 2 });
  });

  it('respects the call cap', async () => {
    const create = mockAnthropic(fakeMessage(verdictJson({ evidence: 'Free pizza' })));
    const report = await runEval(items, { createMessage: create, maxCalls: 1 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(report.deferred).toBe(1);
  });
});
