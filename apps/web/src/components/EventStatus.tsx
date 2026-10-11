import type { FoodEvent } from '@maize-bites/shared';
import { useNow } from '../hooks/useNow';
import { CLOSING_FRACTION, progress, statusPill } from '../lib/status';
import { ProgressBar } from './ui/ProgressBar';
import { StatusPill, type StatusTone } from './ui/StatusPill';

// The parts of a card that change as time passes. Each reads the shared clock itself, so a
// tick re-renders these few nodes and nothing around them.

type Timed = Pick<FoodEvent, 'startsAt' | 'endsAt'>;

interface Props {
  event: Timed;
  /** A fixed time, for tests. Defaults to the shared clock. */
  now?: Date | undefined;
  /** Likely over: keeps its words, loses its colour and motion. */
  muted?: boolean;
}

/** "Happening now" (with a live dot), "Starts in 12 min", "Today 5:30 PM", "Ended". */
export function EventStatusPill({ event, now: fixed, muted = false }: Props) {
  const clock = useNow();
  const pill = statusPill(event, fixed ?? clock);
  const tone: StatusTone =
    muted || pill.status === 'ended'
      ? 'muted'
      : pill.status === 'now'
        ? 'now'
        : pill.status === 'soon'
          ? 'soon'
          : 'neutral';
  return (
    <StatusPill tone={tone} live={pill.status === 'now' && !muted}>
      {/* Re-keyed on change so the new text fades in rather than snapping. */}
      <span key={pill.text} className="animate-fade">
        {pill.text}
      </span>
    </StatusPill>
  );
}

/** For a live event, "ends in 25 min". Renders nothing otherwise. */
export function EventCountdown({ event, now: fixed, className }: Props & { className?: string }) {
  const clock = useNow();
  const { countdown } = statusPill(event, fixed ?? clock);
  if (countdown === null) return null;
  return (
    <span key={countdown} className={`tabular animate-fade ${className ?? ''}`}>
      {countdown}
    </span>
  );
}

/** For a live event, a thin bar of how far through it is; amber in its closing stretch. */
export function EventProgress({ event, now: fixed, muted = false }: Props) {
  const clock = useNow();
  const now = fixed ?? clock;
  if (statusPill(event, now).status !== 'now') return null;
  const value = progress(event, now);
  return (
    <ProgressBar
      value={value}
      tone={muted ? 'over' : value >= CLOSING_FRACTION ? 'soon' : 'now'}
      label="Time elapsed"
    />
  );
}
