import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * A small uppercase label that heads a section. In the list it sticks to the top on a solid
 * background the full width of the column, so cards pass under it cleanly.
 */
export function SectionHeader({
  id,
  as: Tag = 'h2',
  hint,
  count,
  live = false,
  className,
  children,
}: {
  id?: string | undefined;
  as?: 'h2' | 'h3';
  /** Extra words beside the label, in normal case ("Sun, Oct 11"). */
  hint?: string | null | undefined;
  count?: number | undefined;
  /** A green dot, for "Happening now". */
  live?: boolean;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Tag
      id={id}
      className={cx(
        'flex items-center gap-2 text-[0.8125rem] leading-4 font-semibold tracking-[0.08em] text-ink-3 uppercase',
        className,
      )}
    >
      {live && <span aria-hidden="true" className="size-2 rounded-full bg-now" />}
      <span className={live ? 'text-now-ink' : undefined}>{children}</span>
      {hint && <span className="font-medium tracking-normal normal-case">· {hint}</span>}
      {count !== undefined && (
        <span className="tabular ml-auto font-medium tracking-normal">{count}</span>
      )}
    </Tag>
  );
}
