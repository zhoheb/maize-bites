import type { FoodEvent } from '@maize-bites/shared';

export type ExceptionBadge = 'gone' | 'members' | 'rsvp';

/**
 * Badges are for stated restrictions only: "Members only" and "RSVP required". An event open to
 * everyone, or one whose listing doesn't say (unknown), gets none, so the list never promises
 * an event is open; the drawer says what we know and quotes the listing.
 */
export function exceptionBadges(
  event: Pick<FoodEvent, 'audience' | 'likelyGone'>,
): ExceptionBadge[] {
  const badges: ExceptionBadge[] = [];
  if (event.likelyGone) badges.push('gone');
  if (event.audience === 'members') badges.push('members');
  if (event.audience === 'rsvp') badges.push('rsvp');
  return badges;
}

export const EXCEPTION_LABELS: Record<ExceptionBadge, string> = {
  gone: 'Likely over',
  members: 'Members only',
  rsvp: 'RSVP required',
};
