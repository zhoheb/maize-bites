import type { FoodEvent } from '@maize-bites/shared';
import { Footprints } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router';
import { foodIconKind } from '../lib/food-icons';
import { foodText, formatLocation } from '../lib/format';
import { MEAL_LABELS } from '../lib/labels';
import { formatClockRange, timeStatus } from '../lib/status';
import { useNow } from '../hooks/useNow';
import { DietLabels, ExceptionBadges } from './EventBits';
import { EventCountdown, EventProgress, EventStatusPill } from './EventStatus';
import { cx } from './ui/cx';
import { MealTile } from './ui/MealTile';
import { Skeleton } from './ui/Skeleton';

export interface EventCardProps {
  event: FoodEvent;
  /** Where the card links (opens the details on Home). */
  href: string;
  /** Its details are open. */
  selected?: boolean;
  /** Its map pin is hovered, or it is the current card for keyboard navigation. */
  highlighted?: boolean;
  /** Its pin was just picked on the map: a brief wash of colour to catch the eye. */
  flash?: boolean;
  /** "4 min walk", once the user has asked for "Near me". */
  distance?: string | null;
  onHover?: (id: string | null) => void;
  /** A fixed time, for tests. Defaults to the shared clock. */
  now?: Date;
}

/** The accent bar down the left edge: green while live, amber before, grey when likely over. */
function AccentBar({ event, now: fixed }: { event: FoodEvent; now?: Date | undefined }) {
  const clock = useNow();
  const live = timeStatus(event, fixed ?? clock) === 'now';
  return (
    <span
      aria-hidden="true"
      className={cx(
        'absolute inset-y-0 left-0 w-1',
        event.likelyGone ? 'bg-over' : live ? 'bg-now' : 'bg-soon',
      )}
    />
  );
}

/**
 * The prominent card, for events happening now or about to start. Read top to bottom: status
 * and time left, what it is, the food, how far through it is, where. The whole card is one
 * link (one tab stop).
 */
export const NowCard = memo(function NowCard({
  event,
  href,
  selected = false,
  highlighted = false,
  flash = false,
  distance = null,
  onHover,
  now,
}: EventCardProps) {
  const titleId = `event-${event.id}-title`;
  const location = formatLocation(event);
  const food = foodText(event, MEAL_LABELS);
  const gone = event.likelyGone;
  const enter = () => onHover?.(event.id);
  const leave = () => onHover?.(null);

  return (
    <article
      aria-labelledby={titleId}
      data-event-id={event.id}
      data-card="now"
      data-highlighted={highlighted || undefined}
      data-likely-over={gone || undefined}
      onMouseEnter={enter}
      onMouseLeave={leave}
      className={cx(
        'relative overflow-hidden rounded-card border py-2.5 pr-4 pl-5 transition-[transform,box-shadow,border-color] duration-150',
        'hover:-translate-y-px hover:shadow-lift',
        'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
        // Likely over: flattened and greyed with tokens, not faded, so its text keeps contrast.
        gone ? 'bg-sunken' : 'bg-card shadow-card',
        selected
          ? 'border-maize ring-2 ring-maize'
          : highlighted
            ? '-translate-y-px border-line-strong shadow-lift'
            : 'border-line',
        flash && 'animate-flash',
      )}
    >
      <AccentBar event={event} now={now} />

      <div className="flex items-center justify-between gap-3">
        <EventStatusPill event={event} now={now} muted={gone} />
        <EventCountdown event={event} now={now} className="text-[0.8125rem] text-ink-2" />
      </div>

      <h3
        id={titleId}
        className={cx(
          'mt-1.5 line-clamp-2 text-[1.0625rem] leading-[1.375rem] font-semibold text-balance',
          gone ? 'text-ink-2' : 'text-ink',
        )}
      >
        <Link
          to={href}
          onFocus={enter}
          onBlur={leave}
          aria-current={selected ? 'true' : undefined}
          className="outline-none after:absolute after:inset-0"
        >
          {event.title}
        </Link>
      </h3>

      {(food ?? event.dietary.length > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {food && (
            <p
              className={cx(
                'flex items-center gap-2 text-[0.9375rem] leading-5 font-medium',
                gone ? 'text-ink-2' : 'text-ink',
              )}
            >
              <MealTile kind={foodIconKind(event)} size="sm" muted={gone} />
              <span>
                <span className="sr-only">Food: </span>
                {food}
              </span>
            </p>
          )}
          <DietLabels tags={event.dietary} />
        </div>
      )}

      <div className="mt-2.5 empty:hidden">
        <EventProgress event={event} now={now} muted={gone} />
      </div>

      {/* One line of where and when. The time appears here and nowhere else on the card. */}
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[0.8125rem] leading-[1.125rem] text-ink-2">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="tabular shrink-0 text-ink-3">
            <span className="sr-only">Time: </span>
            <time dateTime={event.startsAt}>{formatClockRange(event)}</time>
          </span>
          <span aria-hidden="true" className="text-ink-3">
            ·
          </span>
          <span className="truncate">
            <span className="sr-only">Location: </span>
            {location ?? 'Location not given'}
          </span>
          {distance && (
            <span className="tabular inline-flex shrink-0 items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-xs text-ink-2">
              <Footprints aria-hidden="true" className="size-3" strokeWidth={1.75} />
              {distance}
            </span>
          )}
        </p>
        <ExceptionBadges event={event} className="shrink-0 flex-nowrap" />
      </div>
    </article>
  );
});

/** The same outer size as a NowCard, so nothing moves when the data arrives. */
export function NowCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-card border border-line bg-card py-2.5 pr-4 pl-5 shadow-card"
    >
      <Skeleton className="h-6 w-32 rounded-full" />
      <Skeleton className="mt-1.5 h-[1.375rem] w-3/4" />
      <Skeleton className="mt-1 h-5 w-2/5" />
      <Skeleton className="mt-2.5 h-[3px] w-full" />
      <Skeleton className="mt-1.5 h-[1.125rem] w-3/5" />
    </div>
  );
}
