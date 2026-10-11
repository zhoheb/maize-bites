import type { FoodEvent } from '@maize-bites/shared';
import { useNow } from '../hooks/useNow';
import { statusPill } from '../lib/status';
import { Pill, type PillTone } from './ui/Pill';

/**
 * When the event is, relative to now: "Happening now · ends in 25 min", "Starts in 40 min",
 * "Today 5:30 PM". It reads the shared clock itself, so it ticks without its card re-rendering.
 */
export function StatusPill({
  event,
  now: fixedNow,
  muted = false,
}: {
  event: Pick<FoodEvent, 'startsAt' | 'endsAt'>;
  /** A fixed time, for tests. Defaults to the shared clock. */
  now?: Date | undefined;
  /** Likely over: the pill keeps its words but loses its colour. */
  muted?: boolean;
}) {
  const clock = useNow();
  const pill = statusPill(event, fixedNow ?? clock);
  const tone: PillTone =
    muted || pill.status === 'ended'
      ? 'muted'
      : pill.endingSoon
        ? 'warn'
        : pill.status === 'now'
          ? 'now'
          : pill.status === 'soon'
            ? 'soon'
            : 'neutral';
  return (
    <Pill tone={tone} dot={pill.status === 'now' && !muted}>
      <time dateTime={event.startsAt}>{pill.text}</time>
    </Pill>
  );
}
