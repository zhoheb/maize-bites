import type { FoodEvent } from '@maize-bites/shared';
import type { CSSProperties } from 'react';
import type { EventGroup } from '../lib/grouping';
import { isUrgent } from '../lib/status';
import { AgendaRow, AgendaRowSkeleton } from './AgendaRow';
import { NowCard, NowCardSkeleton, type EventCardProps } from './NowCard';
import { cx } from './ui/cx';
import { SectionHeader } from './ui/SectionHeader';

/** How many rows rise in on arrival; the rest are simply there. */
const ANIMATED = 8;
const STAGGER_MS = 30;

/**
 * Section headers stick on a solid background the full width of the column, so rows pass under
 * them cleanly. The colour is whatever surface the list sits on (the page, or the phone sheet).
 */
const HEADER = 'sticky z-10 -mx-4 bg-(--list-bg,var(--bg)) px-4 pt-3 pb-1.5 lg:-mx-5 lg:px-5';

/**
 * The agenda: events under sticky time headers (Happening now, Starting soon, Later today,
 * then each day). Urgent events get the prominent NowCard; everything else is a compact row in
 * one panel per section. Cards are memoized and read the clock themselves, so a tick doesn't
 * redraw the list.
 */
export function EventList({
  groups,
  now,
  hrefFor,
  selectedId,
  highlightedId,
  flashId,
  distances,
  onHover,
  stickyClass = 'top-0',
}: {
  groups: readonly EventGroup[];
  /** Decides which events are urgent enough for the prominent card. */
  now: Date;
  hrefFor: (id: string) => string;
  selectedId: string | null;
  highlightedId: string | null;
  /** The event whose pin was just picked on the map. */
  flashId?: string | null;
  /** Walking distance by event id, once "Near me" is on. */
  distances?: ReadonlyMap<string, string> | undefined;
  onHover: (id: string | null) => void;
  /** Where group headers stick: below the site header when the page itself scrolls. */
  stickyClass?: string;
}) {
  let position = 0;
  /** The card's props, and the entrance delay for the first few (later ones have none). */
  const card = (event: FoodEvent): { props: EventCardProps; delay: CSSProperties | undefined } => {
    const index = position++;
    return {
      props: {
        event,
        href: hrefFor(event.id),
        selected: event.id === selectedId,
        highlighted: event.id === highlightedId,
        flash: event.id === flashId,
        distance: distances?.get(event.id) ?? null,
        onHover,
      },
      delay: index < ANIMATED ? { animationDelay: `${index * STAGGER_MS}ms` } : undefined,
    };
  };

  return (
    <div className="pb-2">
      {groups.map((group) => {
        const headingId = `group-${group.key}`;
        // Likely over is the opposite of urgent: it gets a quiet row, even while still live.
        const prominent = (e: FoodEvent) => isUrgent(e, now) && !e.likelyGone;
        const urgent = group.events.filter(prominent);
        const rest = group.events.filter((e) => !prominent(e));
        return (
          <section key={group.key} aria-labelledby={headingId}>
            <SectionHeader
              id={headingId}
              hint={group.hint}
              count={group.events.length}
              live={group.key === 'now'}
              className={cx(HEADER, stickyClass)}
            >
              {group.label}
            </SectionHeader>
            {urgent.length > 0 && (
              <ul className="space-y-2">
                {urgent.map((event) => {
                  const { props, delay } = card(event);
                  return (
                    <li key={event.id} className="animate-enter" style={delay}>
                      <NowCard {...props} />
                    </li>
                  );
                })}
              </ul>
            )}
            {rest.length > 0 && (
              <ul
                className={cx(
                  'divide-y divide-line overflow-hidden rounded-card border border-line bg-card shadow-card',
                  urgent.length > 0 && 'mt-2',
                )}
              >
                {rest.map((event) => {
                  const { props, delay } = card(event);
                  return (
                    // The browser skips laying out rows that are off screen.
                    <li
                      key={event.id}
                      className="animate-enter [contain-intrinsic-size:auto_4.25rem] [content-visibility:auto]"
                      style={delay}
                    >
                      <AgendaRow {...props} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** What the list looks like while loading: one prominent card, then a panel of rows. */
export function EventListSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading events…</span>
      <div aria-hidden="true" className="pt-3 pb-2">
        <div className="skeleton h-4 w-32" />
      </div>
      <NowCardSkeleton />
      <div aria-hidden="true" className="pt-5 pb-2">
        <div className="skeleton h-4 w-24" />
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-card shadow-card">
        {Array.from({ length: 6 }, (_, i) => (
          <AgendaRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
