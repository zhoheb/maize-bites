import type { DietaryTag, FoodEvent } from '@maize-bites/shared';
import {
  Clock,
  Footprints,
  Leaf,
  MapPin,
  MilkOff,
  NutOff,
  WheatOff,
  type LucideIcon,
} from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router';
import { EXCEPTION_LABELS, exceptionBadges, type ExceptionBadge } from '../lib/badges';
import { foodIconKind } from '../lib/food-icons';
import { formatFood, formatLocation } from '../lib/format';
import { CAMPUS_LABELS, DIETARY_LABELS, DIETARY_SHORT, MEAL_LABELS } from '../lib/labels';
import { formatClockRange } from '../lib/status';
import { MealIcon } from './MealIcon';
import { StatusPill } from './StatusPill';
import { Badge, type BadgeTone } from './ui/Badge';
import { cx } from './ui/cx';
import { Skeleton } from './ui/Skeleton';

export interface EventCardProps {
  event: FoodEvent;
  /** Where the card links (opens the drawer on Home). */
  href: string;
  /** Its details are open. */
  selected?: boolean;
  /** Its map pin is hovered, or it is the current card for keyboard navigation. */
  highlighted?: boolean;
  /** "4 min walk", once the user has asked for "Near me". */
  distance?: string | null;
  onHover?: (id: string | null) => void;
  /** A fixed time, for tests. Defaults to the shared clock. */
  now?: Date;
}

const DIETARY_ICONS: Partial<Record<DietaryTag, LucideIcon>> = {
  vegetarian: Leaf,
  vegan: Leaf,
  gluten_free: WheatOff,
  dairy_free: MilkOff,
  nut_free: NutOff,
};

const BADGE_TONES: Record<ExceptionBadge, BadgeTone> = {
  gone: 'warn',
  members: 'amber',
  rsvp: 'info',
};

export function DietaryChips({
  tags,
  long = false,
}: {
  tags: readonly DietaryTag[];
  long?: boolean;
}) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Dietary" className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const Icon = DIETARY_ICONS[tag];
        return (
          <li key={tag}>
            <Badge>
              {Icon && <Icon aria-hidden="true" className="size-3" />}
              {long ? (
                DIETARY_LABELS[tag]
              ) : (
                <>
                  <span aria-hidden="true">{DIETARY_SHORT[tag]}</span>
                  <span className="sr-only">{DIETARY_LABELS[tag]}</span>
                </>
              )}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

/** The food line: an icon and what's on offer. Null when the listing named neither food nor meal. */
export function FoodLine({
  event,
  muted = false,
  className,
}: {
  event: Pick<FoodEvent, 'foodItems' | 'mealType'>;
  /** Grey instead of the food colour, for an event that is likely over. */
  muted?: boolean;
  className?: string;
}) {
  // Only what the classifier extracted. No meal is ever guessed from the time of day.
  const text =
    event.foodItems.length > 0
      ? formatFood(event.foodItems)
      : event.mealType
        ? MEAL_LABELS[event.mealType]
        : null;
  if (text === null) return null;
  return (
    <p
      className={cx(
        'flex items-start gap-2 font-semibold',
        muted ? 'text-ink-2' : 'text-food',
        className,
      )}
    >
      <MealIcon kind={foodIconKind(event)} className="mt-[0.15em] size-[1.1em] shrink-0" />
      <span>
        <span className="sr-only">Food: </span>
        {text}
      </span>
    </p>
  );
}

/**
 * One event, read top to bottom in order of urgency: when, what it is, the food, where. The
 * whole card is a single link (one tab stop). Hover and focus sync with the map.
 */
export const EventCard = memo(function EventCard({
  event,
  href,
  selected = false,
  highlighted = false,
  distance = null,
  onHover,
  now,
}: EventCardProps) {
  const titleId = `event-${event.id}-title`;
  const location = formatLocation(event);
  const badges = exceptionBadges(event);
  const enter = () => onHover?.(event.id);
  const leave = () => onHover?.(null);

  return (
    <article
      aria-labelledby={titleId}
      data-event-id={event.id}
      data-highlighted={highlighted || undefined}
      data-likely-over={event.likelyGone || undefined}
      onMouseEnter={enter}
      onMouseLeave={leave}
      className={cx(
        'relative scroll-mt-14 rounded-card border p-4 transition-[transform,box-shadow,border-color] duration-150',
        'hover:-translate-y-0.5 hover:shadow-lift',
        'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
        // Likely over: still listed, visibly set back. Flattened and greyed with tokens rather
        // than faded with opacity, which would drop its text below AA contrast.
        event.likelyGone ? 'bg-sunken shadow-none' : 'bg-surface shadow-card',
        selected
          ? 'border-ink ring-2 ring-maize'
          : highlighted
            ? '-translate-y-0.5 border-line-strong shadow-lift ring-2 ring-maize/70'
            : 'border-line',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <StatusPill event={event} now={now} muted={event.likelyGone} />
        {distance && (
          <span className="tabular inline-flex items-center gap-1 text-xs font-medium text-ink-2">
            <Footprints aria-hidden="true" className="size-3.5" />
            {distance}
          </span>
        )}
      </div>

      <h3
        id={titleId}
        className={cx(
          'mt-2.5 line-clamp-2 font-sans text-[1.0625rem] leading-snug font-semibold',
          event.likelyGone ? 'text-ink-2' : 'text-ink',
        )}
      >
        <Link
          to={href}
          onFocus={enter}
          onBlur={leave}
          aria-current={selected ? 'true' : undefined}
          className="outline-none after:absolute after:inset-0 after:rounded-card"
        >
          {event.title}
        </Link>
      </h3>

      <FoodLine
        event={event}
        muted={event.likelyGone}
        className="mt-1.5 text-[0.9375rem] leading-snug"
      />

      {event.dietary.length > 0 && (
        <div className="mt-2">
          <DietaryChips tags={event.dietary} />
        </div>
      )}

      <dl className="tabular mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
        {location && (
          <div className="flex min-w-0 items-center gap-1.5">
            <dt>
              <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
              <span className="sr-only">Location</span>
            </dt>
            <dd className="truncate">
              {location}
              {event.building && (
                <span className="text-ink-3"> · {CAMPUS_LABELS[event.building.campus]}</span>
              )}
            </dd>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <dt>
            <Clock aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
            <span className="sr-only">Time</span>
          </dt>
          <dd>{formatClockRange(event)}</dd>
        </div>
      </dl>

      {badges.length > 0 && (
        <ul aria-label="Good to know" className="mt-3 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <li key={badge}>
              <Badge tone={BADGE_TONES[badge]}>{EXCEPTION_LABELS[badge]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
});

/** Same outer size as a typical card, so the list doesn't jump when data arrives. */
export function EventCardSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-card border border-line bg-surface p-4 shadow-card">
      <Skeleton className="h-6 w-40 rounded-full" />
      <Skeleton className="mt-3 h-5 w-3/4" />
      <Skeleton className="mt-2.5 h-4 w-1/2" />
      <Skeleton className="mt-4 h-4 w-2/3" />
    </div>
  );
}
