import { describe, expect, it } from 'vitest';
import type { Audience } from './enums.js';
import { audienceNote, effectiveAudience } from './audience.js';

describe('audienceNote', () => {
  it('states a restriction, open only as stated, and otherwise sends people to the listing', () => {
    expect(audienceNote('members')).toBe('Members only');
    expect(audienceNote('rsvp')).toBe('RSVP required');
    expect(audienceNote('open')).toBe('Open to everyone');
    expect(audienceNote('unknown')).toBe('Check the listing for who can attend');
  });
});

describe('effectiveAudience', () => {
  const row = (
    method: 'rules' | 'llm' | 'manual',
    audience: Audience | null,
    evidence: string | null,
  ) => ({
    method,
    audience,
    audienceEvidence: evidence,
  });

  it('keeps a machine audience only with evidence', () => {
    expect(effectiveAudience(row('llm', 'open', 'all are welcome'))).toEqual({
      audience: 'open',
      audienceEvidence: 'all are welcome',
    });
    expect(effectiveAudience(row('llm', 'open', null))).toEqual({
      audience: 'unknown',
      audienceEvidence: null,
    });
    expect(effectiveAudience(row('rules', 'members', ''))).toEqual({
      audience: 'unknown',
      audienceEvidence: null,
    });
  });

  it('reads no verdict, or a prefilter row without an audience, as unknown', () => {
    expect(effectiveAudience(null)).toEqual({ audience: 'unknown', audienceEvidence: null });
    expect(effectiveAudience(row('rules', null, null)).audience).toBe('unknown');
  });

  it('lets a manual verdict stand without evidence', () => {
    expect(effectiveAudience(row('manual', 'open', null))).toEqual({
      audience: 'open',
      audienceEvidence: null,
    });
  });
});
