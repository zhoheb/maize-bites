import { CAMPUS_TIME_ZONE, wallTimeOf } from '@maize-bites/shared';
import type { Tab } from './filters';

export interface EmptyCopy {
  title: string;
  hint: string;
  /** The tab worth trying next, if any. */
  next: { tab: Tab; label: string } | null;
}

/**
 * What to say when a tab has nothing: plainly, with a nudge based on the campus time of day.
 * The hints describe when listings tend to cluster (around lunch, and from five into the
 * evening); they are a rule of thumb, not a forecast.
 */
export function emptyCopy(tab: Tab, now: Date): EmptyCopy {
  if (tab === 'week') {
    return {
      title: 'No free food found this week yet.',
      hint: 'New listings arrive every hour. Alerts will tell you the moment one does.',
      next: null,
    };
  }
  if (tab === 'today') {
    return {
      title: 'No more free food today.',
      hint: "Tomorrow's lineup is usually posted by now.",
      next: { tab: 'week', label: 'See this week' },
    };
  }
  const { hour, minute } = wallTimeOf(now, CAMPUS_TIME_ZONE);
  const t = hour + minute / 60;
  const hint =
    t < 11
      ? 'Lunch rush usually starts around 11:30.'
      : t < 16.5
        ? 'Things usually pick up again around 5, when evening meetings start.'
        : t < 21
          ? 'Evening events wind down around 9.'
          : "It's late. Most events are done for the day.";
  return {
    title: 'No free food right now.',
    hint,
    next: { tab: 'today', label: 'See later today' },
  };
}
