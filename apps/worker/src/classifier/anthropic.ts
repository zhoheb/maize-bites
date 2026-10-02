import Anthropic from '@anthropic-ai/sdk';
import type { CreateMessage } from './llm.js';

/** Production CreateMessage backed by the Anthropic SDK (which retries 429/5xx twice itself). */
export function anthropicCreateMessage(apiKey: string): CreateMessage {
  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 2 });
  return (params) => client.messages.create(params);
}
