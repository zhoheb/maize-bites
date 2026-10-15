import type { Audience, ClassificationMethod } from './enums.js';

/**
 * Who an event is for, as shown. A machine verdict of open, members, or rsvp counts only with
 * the listing's words behind it; without them (or with no verdict) it is unknown. A manual
 * verdict stands as the reviewer set it.
 */
export function effectiveAudience(
  c: {
    method: ClassificationMethod;
    audience: Audience | null;
    audienceEvidence: string | null;
  } | null,
): { audience: Audience; audienceEvidence: string | null } {
  if (!c?.audience || c.audience === 'unknown')
    return { audience: 'unknown', audienceEvidence: null };
  if (c.method !== 'manual' && !c.audienceEvidence)
    return { audience: 'unknown', audienceEvidence: null };
  return { audience: c.audience, audienceEvidence: c.audienceEvidence };
}

/**
 * One line on who an event is for, for alert emails, push, and calendar files. "Open" is
 * claimed only when the listing said so (audience is open only with evidence); unknown points
 * people to the listing instead of guessing.
 */
export function audienceNote(audience: Audience): string {
  switch (audience) {
    case 'members':
      return 'Members only';
    case 'rsvp':
      return 'RSVP required';
    case 'open':
      return 'Open to everyone';
    case 'unknown':
      return 'Check the listing for who can attend';
  }
}
