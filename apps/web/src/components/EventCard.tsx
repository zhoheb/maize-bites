import type { FoodEvent } from '@maize-bites/shared';
import { Link } from 'react-router';
import { formatLocation, formatTimeRange } from '../lib/format';
import { AudienceBadge } from './Badge';
import { Countdown } from './Countdown';

export interface EventCardProps {
  event: FoodEvent;
  now: Date;
  /** Where the card links (opens the drawer on Home). */
  href: string;
  selected?: boolean;
  /** Highlighted because the matching map marker is hovered. */
  highlighted?: boolean;
  onHover?: (id: string | null) => void;
}

/** One event. The whole card is a single link (one tab stop); hover and focus sync with the map. */
export function EventCard({
  event,
  now,
  href,
  selected = false,
  highlighted = false,
  onHover,
}: EventCardProps) {
  const titleId = `event-${event.id}-title`;
  const location = formatLocation(event);
  const enter = () => onHover?.(event.id);
  const leave = () => onHover?.(null);

  return (
    <article
      aria-labelledby={titleId}
      onMouseEnter={enter}
      onMouseLeave={leave}
      data-highlighted={highlighted || undefined}
      className={[
        'relative rounded-xl border bg-white p-4 shadow-sm transition-shadow',
        'focus-within:ring-2 focus-within:ring-michigan-blue focus-within:ring-offset-2',
        selected ? 'border-michigan-blue ring-2 ring-michigan-blue' : 'border-slate-200',
        highlighted && !selected ? 'border-michigan-blue/60 shadow-md' : 'hover:shadow-md',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={titleId} className="text-base font-semibold leading-snug text-michigan-blue">
          <Link
            to={href}
            onFocus={enter}
            onBlur={leave}
            aria-current={selected ? 'true' : undefined}
            className="outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {event.title}
          </Link>
        </h3>
        <AudienceBadge audience={event.audience} />
      </div>

      {event.foodItems.length > 0 && (
        <p className="mt-1 text-sm font-medium capitalize text-slate-800">
          <span className="sr-only">Food: </span>
          {event.foodItems.join(', ')}
        </p>
      )}

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
        <Countdown event={event} now={now} />
        <time dateTime={event.startsAt}>{formatTimeRange(event)}</time>
      </p>

      {location && (
        <p className="mt-1 text-sm text-slate-600">
          <span className="sr-only">Location: </span>
          {location}
        </p>
      )}
    </article>
  );
}

export function EventCardSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="h-4 w-3/4 rounded bg-slate-200 motion-safe:animate-pulse" />
      <div className="mt-3 h-3 w-1/3 rounded bg-slate-200 motion-safe:animate-pulse" />
      <div className="mt-3 h-3 w-1/2 rounded bg-slate-100 motion-safe:animate-pulse" />
    </div>
  );
}
