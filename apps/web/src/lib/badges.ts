import type { FoodEvent } from '@maize-bites/shared';

export type ExceptionBadge = 'gone' | 'members' | 'rsvp';

/**
 * Badges are for what differs from the default. An event open to everyone (or with no stated
 * audience) gets none, so "Open to all" never repeats down the list.
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
