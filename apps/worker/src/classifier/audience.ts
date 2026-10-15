import type { Audience } from '@maize-bites/shared';
import { AUDIENCE_RULES, type AudienceRules } from './rules-config.js';
import { compile } from './rules.js';

// Who an event is for, from the listing's own words. Precision first: open, members, or rsvp
// only when a phrase says so, otherwise unknown. When several match, members beats rsvp beats
// open ("Open to the public; RSVP required" is rsvp; a restricted event that also needs an
// RSVP is members).

export interface AudienceVerdict {
  audience: Audience;
  /** The listing's words around the matched phrase, on one line. Null when unknown. */
  evidence: string | null;
}

export interface CompiledAudienceRules {
  open: RegExp[];
  members: RegExp[];
  notMembers: RegExp[];
  rsvp: RegExp[];
  notRsvp: RegExp[];
  contextWords: number;
}

const patterns = (phrases: readonly string[]) => compile(phrases).map((p) => p.pattern);

export function compileAudienceRules(rules: AudienceRules = AUDIENCE_RULES): CompiledAudienceRules {
  return {
    open: patterns(rules.openPhrases),
    members: [...patterns(rules.membersPhrases), ...rules.membersPatterns],
    notMembers: patterns(rules.notMembersPhrases),
    rsvp: patterns(rules.rsvpPhrases),
    notRsvp: patterns(rules.notRsvpPhrases),
    contextWords: rules.evidenceContextWords,
  };
}

const DEFAULT_COMPILED = compileAudienceRules();

interface Span {
  index: number;
  end: number;
}

function spans(list: readonly RegExp[], text: string): Span[] {
  const found: Span[] = [];
  for (const pattern of list)
    for (const m of text.matchAll(new RegExp(pattern.source, 'gi')))
      found.push({ index: m.index, end: m.index + m[0].length });
  return found.sort((a, b) => a.index - b.index || b.end - a.end);
}

/** Replaces each match with spaces of the same length, so positions in the text don't move. */
function blank(text: string, list: readonly RegExp[]): string {
  let out = text;
  for (const { index, end } of spans(list, text))
    out = out.slice(0, index) + ' '.repeat(end - index) + out.slice(end);
  return out;
}

/** Sentence-ish breaks evidence never crosses: ". " "! " "? " a newline, or a semicolon. */
const BREAK = /[.!?](?=\s|$)|[\n;•|]/g;

/**
 * The matched span plus up to `words` words of the listing on each side, within the same
 * sentence, with whitespace collapsed. Every word is copied from the listing.
 */
export function evidenceAround(text: string, span: Span, words: number): string {
  let from = 0;
  let to = text.length;
  for (const m of text.matchAll(BREAK)) {
    if (m.index < span.index) from = m.index + 1;
    else if (m.index >= span.end) {
      to = m.index;
      break;
    }
  }
  // Widen to whole words ("pre-register" for a match on "register").
  let start = span.index;
  while (start > from && !/\s/.test(text.charAt(start - 1))) start -= 1;
  let end = span.end;
  while (end < to && !/\s/.test(text.charAt(end))) end += 1;
  const before = text.slice(from, start).split(/\s+/).filter(Boolean);
  const after = text.slice(end, to).split(/\s+/).filter(Boolean);
  return [
    ...before.slice(Math.max(0, before.length - words)),
    text.slice(start, end),
    ...after.slice(0, words),
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Audience from a listing's title and description. */
export function detectAudience(
  listing: { title: string; description: string | null },
  rules: CompiledAudienceRules = DEFAULT_COMPILED,
): AudienceVerdict {
  const text = `${listing.title}\n${listing.description ?? ''}`;
  const first = (list: readonly RegExp[], within: string) => spans(list, within)[0];

  const members = first(rules.members, blank(text, rules.notMembers));
  if (members)
    return { audience: 'members', evidence: evidenceAround(text, members, rules.contextWords) };
  const rsvp = first(rules.rsvp, blank(text, rules.notRsvp));
  if (rsvp) return { audience: 'rsvp', evidence: evidenceAround(text, rsvp, rules.contextWords) };
  const open = first(rules.open, text);
  if (open) return { audience: 'open', evidence: evidenceAround(text, open, rules.contextWords) };
  return { audience: 'unknown', evidence: null };
}
