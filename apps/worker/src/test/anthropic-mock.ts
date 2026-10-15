import type Anthropic from '@anthropic-ai/sdk';
import { vi } from 'vitest';
import type { CreateMessage, LlmVerdict } from '../classifier/llm.js';

/** A minimal Messages API response. Only the fields the classifier reads are meaningful. */
export function fakeMessage(
  text: string,
  overrides: {
    stop_reason?: Anthropic.StopReason;
    input_tokens?: number;
    output_tokens?: number;
  } = {},
): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5',
    content: text === '' ? [] : [{ type: 'text', text, citations: null }],
    stop_reason: overrides.stop_reason ?? 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: overrides.input_tokens ?? 1000,
      output_tokens: overrides.output_tokens ?? 100,
    },
  } as unknown as Anthropic.Message;
}

export function verdictJson(overrides: Partial<LlmVerdict> = {}): string {
  const verdict: LlmVerdict = {
    has_free_food: true,
    confidence: 0.92,
    food_items: ['Pizza'],
    meal_type: 'dinner',
    dietary: [],
    audience: 'rsvp',
    audience_evidence: 'RSVP on MaizePages',
    evidence: 'free pizza',
    ...overrides,
  };
  return JSON.stringify(verdict);
}

/** A mocked Anthropic `messages.create` that replies with each response in turn. */
export function mockAnthropic(...responses: (Anthropic.Message | Error)[]) {
  return vi.fn<CreateMessage>(() => {
    const next = responses.shift();
    if (next === undefined) return Promise.reject(new Error('unexpected extra Anthropic request'));
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
}
