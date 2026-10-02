import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { fakeMessage, mockAnthropic, verdictJson } from '../test/anthropic-mock.js';
import type { ClassifierInput } from './input.js';
import {
  LLM_MODEL,
  SYSTEM_PROMPT,
  buildUserMessage,
  callBudget,
  classifyWithLlm,
  estimateCostUsd,
  toClassification,
} from './llm.js';

const input: ClassifierInput = {
  title: 'CS Club Kickoff',
  description:
    'Come meet the board! Free pizza and “bubble tea” for everyone.\nRSVP on MaizePages.',
  locationName: 'Bob and Betty Beyster Building',
  room: '1670',
  startsAt: new Date('2026-10-01T22:00:00Z'),
  endsAt: new Date('2026-10-01T23:30:00Z'),
  tags: ['Food', 'Student Org'],
  sponsor: 'CS Club',
  cost: null,
};

const budget = () => callBudget(10);

describe('request', () => {
  it('calls claude-haiku-4-5 with the system prompt, the event, and a JSON schema output format', async () => {
    const create = mockAnthropic(fakeMessage(verdictJson()));
    await classifyWithLlm(create, input, budget());

    const params = create.mock.calls[0]?.[0];
    expect(params).toMatchObject({ model: LLM_MODEL, system: SYSTEM_PROMPT, temperature: 0 });
    expect(params?.messages).toEqual([{ role: 'user', content: buildUserMessage(input) }]);
    expect(params?.output_config?.format).toMatchObject({ type: 'json_schema' });
    expect(Object.keys(params?.output_config?.format?.schema['properties'] as object)).toEqual([
      'has_free_food',
      'confidence',
      'food_items',
      'meal_type',
      'dietary',
      'audience',
      'needs_rsvp',
      'evidence',
    ]);
  });

  it('renders the event in Ann Arbor time with every field the model needs', () => {
    // Intl may put U+202F (narrow no-break space) before AM/PM.
    expect(buildUserMessage(input).replace(/\u202f/g, ' ')).toBe(
      [
        '<event>',
        'Title: CS Club Kickoff',
        'When: Thu, Oct 1, 2026, 6:00 PM to Thu, Oct 1, 2026, 7:30 PM (Ann Arbor time)',
        'Where: Bob and Betty Beyster Building, 1670',
        'Sponsor: CS Club',
        'Tags: Food, Student Org',
        'Cost: not listed',
        'Description:',
        input.description,
        '</event>',
      ].join('\n'),
    );
  });
});

describe('parsing', () => {
  it('returns the verdict and a classification row on valid JSON', async () => {
    const create = mockAnthropic(
      fakeMessage(verdictJson({ dietary: ['Vegetarian', 'gluten-free', 'paleo'] })),
    );

    const outcome = await classifyWithLlm(create, input, budget());

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.usage).toEqual({ calls: 1, inputTokens: 1000, outputTokens: 100 });
    expect(outcome.classification).toEqual({
      method: 'llm',
      model: 'claude-haiku-4-5',
      hasFreeFood: true,
      confidence: 0.92,
      foodItems: ['pizza'],
      mealType: 'dinner',
      dietary: ['vegetarian', 'gluten_free'],
      audience: 'open',
      evidence: 'free pizza',
    });
  });

  it('accepts evidence with different case, whitespace, and curly quotes', async () => {
    const create = mockAnthropic(
      fakeMessage(verdictJson({ evidence: 'FREE PIZZA and "bubble   tea"' })),
    );
    expect((await classifyWithLlm(create, input, budget())).status).toBe('ok');
  });
});

describe('retry once, then flag', () => {
  it.each([
    ['non-JSON text', fakeMessage('Sure! Here is the JSON: {...}'), /not valid JSON/],
    ['schema mismatch', fakeMessage(verdictJson({ confidence: 1.4 })), /schema mismatch/],
    ['missing field', fakeMessage('{"has_free_food": true}'), /schema mismatch/],
    [
      'evidence not in listing',
      fakeMessage(verdictJson({ evidence: 'free tacos' })),
      /not an exact phrase/,
    ],
    ['empty evidence on a yes', fakeMessage(verdictJson({ evidence: '' })), /evidence is empty/],
    [
      'truncated output',
      fakeMessage('{"has_free_food": tr', { stop_reason: 'max_tokens' }),
      /stop_reason was max_tokens/,
    ],
    ['refusal', fakeMessage('', { stop_reason: 'refusal' }), /stop_reason was refusal/],
  ])('%s: retries with the problem spelled out, then succeeds', async (_name, bad, problem) => {
    const create = mockAnthropic(bad, fakeMessage(verdictJson()));

    const outcome = await classifyWithLlm(create, input, budget());

    expect(outcome.status).toBe('ok');
    expect(outcome.usage.calls).toBe(2);
    const retry = create.mock.calls[1]?.[0].messages ?? [];
    const correction = retry.at(-1);
    expect(correction?.role).toBe('user');
    expect(correction?.content).toMatch(problem);
    expect(correction?.content).toMatch(/Reply again with only the corrected JSON object/);
  });

  it('shows the model its previous output on retry (when there was any)', async () => {
    const create = mockAnthropic(fakeMessage('not json'), fakeMessage(verdictJson()));
    await classifyWithLlm(create, input, budget());

    expect(create.mock.calls[1]?.[0].messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(create.mock.calls[1]?.[0].messages[1]?.content).toBe('not json');
  });

  it('returns invalid after two bad responses, without a third call', async () => {
    const create = mockAnthropic(
      fakeMessage('nope'),
      fakeMessage(verdictJson({ evidence: 'made up' })),
    );

    const outcome = await classifyWithLlm(create, input, budget());

    expect(create).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({
      status: 'invalid',
      problem: expect.stringMatching(/not an exact phrase/) as unknown,
      usage: { calls: 2, inputTokens: 2000, outputTokens: 200 },
    });
  });

  it('allows empty evidence on a no', async () => {
    const create = mockAnthropic(
      fakeMessage(
        verdictJson({ has_free_food: false, evidence: '', food_items: [], meal_type: null }),
      ),
    );
    const outcome = await classifyWithLlm(create, input, budget());
    expect(outcome.status).toBe('ok');
  });
});

describe('API errors and budget', () => {
  it('propagates API errors instead of flagging (they are transient or config problems)', async () => {
    const error = new Anthropic.InternalServerError(500, undefined, 'boom', new Headers());
    const create = mockAnthropic(error);
    await expect(classifyWithLlm(create, input, budget())).rejects.toBe(error);
  });

  it('defers without calling when the budget is spent', async () => {
    const create = mockAnthropic();
    const outcome = await classifyWithLlm(create, input, callBudget(0));
    expect(outcome).toEqual({
      status: 'deferred',
      usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('counts retries against the budget', async () => {
    const b = callBudget(1);
    const create = mockAnthropic(fakeMessage('nope'));
    const outcome = await classifyWithLlm(create, input, b);
    expect(outcome.status).toBe('deferred');
    expect(b.used()).toBe(1);
  });
});

describe('toClassification', () => {
  const base = JSON.parse(verdictJson()) as Parameters<typeof toClassification>[0];

  it.each([
    [{ audience: 'unknown' as const, needs_rsvp: false }, null],
    [{ audience: 'open' as const, needs_rsvp: true }, 'rsvp'],
    [{ audience: 'members' as const, needs_rsvp: true }, 'members'],
    [{ audience: 'rsvp' as const, needs_rsvp: false }, 'rsvp'],
  ])('maps %j to audience %j', (fields, audience) => {
    expect(toClassification({ ...base, ...fields }).audience).toBe(audience);
  });

  it('drops meal_type when there is no free food', () => {
    expect(toClassification({ ...base, has_free_food: false }).mealType).toBeNull();
  });
});

describe('estimateCostUsd', () => {
  it('uses claude-haiku-4-5 list prices ($1 in / $5 out per MTok)', () => {
    expect(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 0 })).toBe(1);
    expect(estimateCostUsd({ inputTokens: 2_000, outputTokens: 200 })).toBeCloseTo(0.003, 10);
  });
});
