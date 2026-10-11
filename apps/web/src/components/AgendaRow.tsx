import { ChevronRight, Footprints } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router';
import { foodIconKind } from '../lib/food-icons';
import { foodText, formatLocation } from '../lib/format';
import { MEAL_LABELS } from '../lib/labels';
import { railTime } from '../lib/status';
import { DietLabels, ExceptionBadges } from './EventBits';
import type { EventCardProps } from './NowCard';
import { cx } from './ui/cx';
import { MealTile } from './ui/MealTile';
import { Skeleton } from './ui/Skeleton';

/**
 * The default, compact row for everything later: a time rail, a meal tile, the title with food
 * and place beneath, and exceptions on the right. Rows sit together in one panel per section,
 * separated by hairlines. The time appears once, in the rail; the section header gives the day.
 */
export const AgendaRow = memo(function AgendaRow({
  event,
  href,
  selected = false,
  highlighted = false,
  flash = false,
  distance = null,
  onHover,
}: EventCardProps) {
  const titleId = `event-${event.id}-title`;
  const time = railTime(event);
  const location = formatLocation(event);
  const food = foodText(event, MEAL_LABELS);
  const gone = event.likelyGone;
  const enter = () => onHover?.(event.id);
  const leave = () => onHover?.(null);

  return (
    <article
      aria-labelledby={titleId}
      data-event-id={event.id}
      data-card="row"
      data-highlighted={highlighted || undefined}
      data-likely-over={gone || undefined}
      onMouseEnter={enter}
      onMouseLeave={leave}
      className={cx(
        'group relative flex min-h-[4.25rem] items-center gap-3 py-2 pr-7 pl-4 transition-colors',
        'focus-within:z-[1] focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-focus',
        selected
          ? 'bg-maize-soft shadow-[inset_3px_0_0_var(--maize)]'
          : highlighted
            ? 'bg-sunken'
            : 'hover:bg-sunken/60',
        flash && 'animate-flash',
      )}
    >
      <p className="tabular w-[4.25rem] shrink-0 leading-none whitespace-nowrap">
        <span className="sr-only">Time: </span>
        <time dateTime={event.startsAt} className="block">
          <span className={cx('text-[0.9375rem] font-semibold', gone ? 'text-ink-2' : 'text-ink')}>
            {time.clock}
          </span>{' '}
          <span className="text-[0.6875rem] font-medium text-ink-3">{time.period}</span>
        </time>
        {time.end && (
          <span className="mt-1 block text-xs text-ink-3">
            <span aria-hidden="true">–</span>
            <span className="sr-only">to </span>
            {time.end}
          </span>
        )}
      </p>

      <MealTile kind={foodIconKind(event)} muted={gone} />

      <div className="min-w-0 flex-1">
        {/* The title takes what room there is; an exception badge sits at its right. */}
        <div className="flex items-center gap-2">
          <h3
            id={titleId}
            className={cx(
              'min-w-0 flex-1 truncate text-base leading-[1.375rem] font-semibold',
              gone ? 'text-ink-2' : 'text-ink',
            )}
          >
            <Link
              to={href}
              title={event.title}
              onFocus={enter}
              onBlur={leave}
              aria-current={selected ? 'true' : undefined}
              className="outline-none after:absolute after:inset-0"
            >
              {event.title}
            </Link>
          </h3>
          <ExceptionBadges event={event} short className="shrink-0 flex-nowrap" />
        </div>
        {/* One line: food, then place, then what fits of the dietary labels and walk time. */}
        <div className="flex items-center gap-2.5 text-sm leading-5">
          <p className="min-w-0 truncate">
            {food && (
              <span className="font-medium text-ink-2">
                <span className="sr-only">Food: </span>
                {food}
              </span>
            )}
            {food && location && (
              <span aria-hidden="true" className="text-ink-3">
                {' · '}
              </span>
            )}
            {location && (
              <span className="text-ink-3">
                <span className="sr-only">Location: </span>
                {location}
              </span>
            )}
          </p>
          <DietLabels tags={event.dietary} max={2} className="shrink-0 flex-nowrap" />
          {distance && (
            <span className="tabular inline-flex shrink-0 items-center gap-1 text-xs text-ink-3">
              <Footprints aria-hidden="true" className="size-3" strokeWidth={1.75} />
              {distance}
            </span>
          )}
        </div>
      </div>

      <ChevronRight
        aria-hidden="true"
        className="absolute top-1/2 right-1.5 size-4 -translate-y-1/2 text-ink-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        strokeWidth={1.75}
      />
    </article>
  );
});

/** The same height as an AgendaRow, so nothing moves when the data arrives. */
export function AgendaRowSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-h-[4.25rem] items-center gap-3 py-2 pr-7 pl-4">
      <div className="w-[4.25rem] shrink-0 space-y-1.5">
        <Skeleton className="h-4 w-11" />
        <Skeleton className="h-3 w-8" />
      </div>
      <Skeleton className="size-10 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-[1.125rem] w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
    </div>
  );
}
