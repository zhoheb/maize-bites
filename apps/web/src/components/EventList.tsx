import { AnimatePresence, motion } from 'motion/react';
import type { EventGroup } from '../lib/grouping';
import { EventCard } from './EventCard';
import { cx } from './ui/cx';

/**
 * The events under sticky time headers: Happening now, Starting soon, Later today, then each
 * day. Cards are memoized and read the clock themselves, so a tick doesn't redraw the list.
 */
export function EventList({
  groups,
  hrefFor,
  selectedId,
  highlightedId,
  distances,
  onHover,
  stickyClass = 'top-0',
}: {
  groups: readonly EventGroup[];
  hrefFor: (id: string) => string;
  selectedId: string | null;
  highlightedId: string | null;
  /** Walking distance by event id, once "Near me" is on. */
  distances?: ReadonlyMap<string, string> | undefined;
  onHover: (id: string | null) => void;
  /** Where group headers stick: below the site header when the page itself scrolls. */
  stickyClass?: string;
}) {
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const headingId = `group-${group.key}`;
        return (
          <section key={group.key} aria-labelledby={headingId}>
            <h2
              id={headingId}
              className={cx(
                'sticky z-10 -mx-1 flex items-center gap-2 bg-page/90 px-1 py-2 font-sans text-xs font-semibold tracking-wider text-ink-2 uppercase backdrop-blur',
                stickyClass,
              )}
            >
              {group.key === 'now' && (
                <span aria-hidden="true" className="size-2 rounded-full bg-now-dot" />
              )}
              <span className={group.key === 'now' ? 'text-now' : undefined}>{group.label}</span>
              {group.hint && (
                <span className="font-medium tracking-normal text-ink-3 normal-case">
                  · {group.hint}
                </span>
              )}
              <span className="tabular ml-auto font-medium text-ink-3">{group.events.length}</span>
            </h2>
            <ul className="mt-1 space-y-3">
              <AnimatePresence initial={false}>
                {group.events.map((event) => (
                  <motion.li
                    key={event.id}
                    layout="position"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    <EventCard
                      event={event}
                      href={hrefFor(event.id)}
                      selected={event.id === selectedId}
                      highlighted={event.id === highlightedId}
                      distance={distances?.get(event.id) ?? null}
                      onHover={onHover}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        );
      })}
    </div>
  );
}
