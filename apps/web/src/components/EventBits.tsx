import type { DietaryTag, FoodEvent } from '@maize-bites/shared';
import { Leaf, MilkOff, NutOff, WheatOff, type LucideIcon } from 'lucide-react';
import { EXCEPTION_LABELS, exceptionBadges, type ExceptionBadge } from '../lib/badges';
import { DIETARY_LABELS, DIETARY_SHORT } from '../lib/labels';
import { Badge, type BadgeTone } from './ui/Badge';
import { cx } from './ui/cx';

// Small pieces shared by the cards, the map popover and the details.

const DIETARY_ICONS: Partial<Record<DietaryTag, LucideIcon>> = {
  vegetarian: Leaf,
  vegan: Leaf,
  gluten_free: WheatOff,
  dairy_free: MilkOff,
  nut_free: NutOff,
};

/**
 * Dietary tags as quiet text labels with small icons: information, not controls, so no borders
 * or fills. Compact on cards ("Veg", "GF") with the full name for screen readers.
 */
export function DietLabels({
  tags,
  long = false,
  max,
  className,
}: {
  tags: readonly DietaryTag[];
  long?: boolean;
  /** Show at most this many, then "+N" (with the rest named for screen readers). */
  max?: number;
  className?: string | undefined;
}) {
  if (tags.length === 0) return null;
  const shown = max === undefined ? tags : tags.slice(0, max);
  const hidden = tags.slice(shown.length);
  return (
    <ul
      aria-label="Dietary"
      className={cx('flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-ink-3', className)}
    >
      {shown.map((tag) => {
        const Icon = DIETARY_ICONS[tag];
        return (
          <li key={tag} className="inline-flex items-center gap-1">
            {Icon && <Icon aria-hidden="true" className="size-3" strokeWidth={1.75} />}
            {long ? (
              DIETARY_LABELS[tag]
            ) : (
              <>
                <span aria-hidden="true">{DIETARY_SHORT[tag]}</span>
                <span className="sr-only">{DIETARY_LABELS[tag]}</span>
              </>
            )}
          </li>
        );
      })}
      {hidden.length > 0 && (
        <li>
          <span aria-hidden="true">+{hidden.length}</span>
          <span className="sr-only">{hidden.map((tag) => DIETARY_LABELS[tag]).join(', ')}</span>
        </li>
      )}
    </ul>
  );
}

const BADGE_TONES: Record<ExceptionBadge, BadgeTone> = {
  gone: 'muted',
  members: 'members',
  rsvp: 'rsvp',
};

/** Badges for what differs from the default. Renders nothing for an ordinary open event. */
export function ExceptionBadges({
  event,
  short = false,
  className,
}: {
  event: Pick<FoodEvent, 'audience' | 'likelyGone'>;
  /** "RSVP" instead of "RSVP required", where space is tight. */
  short?: boolean;
  className?: string | undefined;
}) {
  const badges = exceptionBadges(event);
  if (badges.length === 0) return null;
  return (
    <ul aria-label="Good to know" className={cx('flex flex-wrap gap-1.5', className)}>
      {badges.map((badge) => (
        <li key={badge} className="flex">
          <Badge tone={BADGE_TONES[badge]}>
            {short && badge === 'rsvp' ? (
              <>
                RSVP<span className="sr-only"> required</span>
              </>
            ) : (
              EXCEPTION_LABELS[badge]
            )}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
