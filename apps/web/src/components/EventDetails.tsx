import type { Audience, ClassificationMethod, EventDetail, EventSource } from '@maize-bites/shared';
import {
  CalendarPlus,
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  Radio,
  ScrollText,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { ApiRequestError } from '../api/client';
import { icsUrl } from '../api/events';
import { useEventDetail } from '../api/queries';
import { foodIconKind } from '../lib/food-icons';
import {
  directionsUrl,
  foodText,
  formatLocation,
  formatTimeRange,
  isApplePlatform,
} from '../lib/format';
import { CAMPUS_LABELS, MEAL_LABELS } from '../lib/labels';
import { DietLabels, ExceptionBadges } from './EventBits';
import { EventCountdown, EventProgress, EventStatusPill } from './EventStatus';
import { MapBoundary } from './MapBoundary';
import { ReportButtons } from './ReportButtons';
import { EmptyState, ErrorState } from './States';
import { buttonClass } from './ui/button-class';
import { cx } from './ui/cx';
import { MealTile } from './ui/MealTile';
import { SectionHeader } from './ui/SectionHeader';
import { Skeleton } from './ui/Skeleton';

const MiniMap = lazy(() => import('./MiniMap'));

const METHOD_LABELS: Record<ClassificationMethod, string> = {
  llm: 'Our AI classifier read the listing',
  rules: 'Keyword rules matched the listing',
  manual: 'A person checked this listing',
};

const SOURCE_LABELS: Record<EventSource, string> = {
  happening: 'Happening @ Michigan',
  maizepages: 'Maize Pages',
  submission: 'A community tip',
};

const AUDIENCE_TEXT: Record<Exclude<Audience, 'unknown'>, string> = {
  open: 'Open to everyone.',
  members:
    "Only for a specific group (members, a program, or invitees). Please don't crash it for the food.",
  rsvp: 'You need to RSVP or register first. Check the listing for how.',
};

/**
 * Who it's for. We state an audience only when the listing does, and quote it; otherwise we
 * say we don't know and point to the listing.
 */
function AudienceInfo({
  event,
}: {
  event: Pick<EventDetail, 'audience' | 'audienceEvidence' | 'url' | 'classification'>;
}) {
  if (event.audience === 'unknown')
    return (
      <p>
        The listing doesn't say who can attend.{' '}
        {event.url ? (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            Check the event listing before you go →
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          'Check with the host before you go.'
        )}
      </p>
    );
  const reviewed = event.classification?.method === 'manual';
  return (
    <>
      <p>{AUDIENCE_TEXT[event.audience]}</p>
      {event.audienceEvidence && (
        <p className="text-xs text-ink-2">
          {reviewed ? 'Our review: ' : 'Listing says: '}“{event.audienceEvidence}”
        </p>
      )}
    </>
  );
}

function DetailsSkeleton() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Loading event…</span>
      <Skeleton className="h-6 w-44 rounded-full" />
      <Skeleton className="h-8 w-11/12" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="mt-6 h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-[1.125rem_1fr] gap-x-3 border-t border-line py-4">
      <Icon aria-hidden="true" className="mt-px size-[1.125rem] text-ink-3" strokeWidth={1.75} />
      <div className="min-w-0">
        <SectionHeader as="h3">{title}</SectionHeader>
        <div className="mt-2 space-y-2.5 text-sm leading-5 text-ink">{children}</div>
      </div>
    </section>
  );
}

/** Full event details. `titleId` lets a dialog or page label itself with the heading. */
export function EventDetails({
  id,
  titleId,
  headingLevel = 2,
}: {
  id: string;
  titleId: string;
  headingLevel?: 1 | 2;
}) {
  const query = useEventDetail(id);

  if (query.isPending) return <DetailsSkeleton />;
  if (query.isError) {
    if (
      query.error instanceof ApiRequestError &&
      (query.error.status === 404 || query.error.status === 400)
    ) {
      return (
        <EmptyState
          title="This event isn't listed anymore"
          actions={[{ label: 'See free food now', to: '/', primary: true }]}
        >
          It may have been removed from the source feed or hidden after review.
        </EmptyState>
      );
    }
    return <ErrorState message="Couldn't load this event." onRetry={() => void query.refetch()} />;
  }

  const event = query.data;
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const location = formatLocation(event);
  const directions = directionsUrl(event, isApplePlatform());
  const food = foodText(event, MEAL_LABELS);
  const foodLine = food && (
    <p className="flex items-center gap-2 font-medium text-ink">
      <MealTile kind={foodIconKind(event)} size="sm" muted={event.likelyGone} />
      <span>
        <span className="sr-only">Food: </span>
        {food}
      </span>
    </p>
  );

  return (
    <article>
      <div className="flex flex-wrap items-center gap-2">
        <EventStatusPill event={event} muted={event.likelyGone} />
        <EventCountdown event={event} className="text-[0.8125rem] text-ink-2" />
        <ExceptionBadges event={event} className="ml-auto" />
      </div>
      <Heading
        id={titleId}
        className={cx(
          'mt-3 text-[1.375rem] leading-7 font-semibold text-balance',
          event.likelyGone ? 'text-ink-2' : 'text-ink',
        )}
      >
        {event.title}
      </Heading>
      {foodLine && <div className="mt-2 text-base">{foodLine}</div>}
      <div className="mt-3 empty:hidden">
        <EventProgress event={event} muted={event.likelyGone} />
      </div>

      {event.likelyGone && (
        <p className="mt-4 rounded-card bg-sunken px-3.5 py-2.5 text-sm font-medium text-ink-2">
          {event.reportCounts.food_gone} people reported the food is gone.
        </p>
      )}

      <div className="mt-5">
        <Section icon={Clock} title="When">
          <p className="tabular">
            <time dateTime={event.startsAt}>{formatTimeRange(event)}</time>
          </p>
          <a
            href={icsUrl(event.id)}
            download
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            <CalendarPlus aria-hidden="true" className="size-4" />
            Add to calendar
          </a>
        </Section>

        <Section icon={MapPin} title="Where">
          {location ? (
            <p>
              {location}
              {event.building && (
                <span className="text-ink-2"> · {CAMPUS_LABELS[event.building.campus]} Campus</span>
              )}
            </p>
          ) : (
            <p className="text-ink-2">The listing doesn't give a location.</p>
          )}
          {event.lat !== null && event.lng !== null && (
            <div className="h-32 overflow-hidden rounded-card border border-line">
              <MapBoundary>
                <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
                  <MiniMap
                    at={{ lat: event.lat, lng: event.lng }}
                    label={`Map showing ${location ?? 'the event location'}`}
                  />
                </Suspense>
              </MapBoundary>
            </div>
          )}
          {directions && (
            <a
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: 'primary', size: 'sm' })}
            >
              <Navigation aria-hidden="true" className="size-4" />
              Directions<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </Section>

        <Section icon={Users} title="Who it's for">
          <AudienceInfo event={event} />
          {event.sponsor && <p className="text-sm text-ink-2">Hosted by {event.sponsor}</p>}
        </Section>

        <Section icon={Utensils} title="What's there">
          {foodLine ?? (
            <p className="text-ink-2">The listing mentions free food without saying what.</p>
          )}
          <DietLabels tags={event.dietary} long className="text-[0.8125rem]" />
          <p className="text-xs text-ink-3">
            Dietary details come from the listing and may be incomplete. Confirm with the host if
            you have allergies.
          </p>
        </Section>

        <Section icon={Radio} title="Live reports">
          <ReportButtons event={event} />
        </Section>

        {event.description && (
          <Section icon={ScrollText} title="About this event">
            <p className="text-sm leading-relaxed whitespace-pre-line text-ink-2">
              {event.description}
            </p>
          </Section>
        )}

        <Section icon={ExternalLink} title="Source">
          <p>
            {event.url ? (
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2"
              >
                {SOURCE_LABELS[event.source]}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              SOURCE_LABELS[event.source]
            )}
          </p>
          <p className="text-sm text-ink-2">
            {event.classification ? (
              <>
                {METHOD_LABELS[event.classification.method]}
                {event.classification.evidence && <>: “{event.classification.evidence}”</>}.{' '}
                {event.classification.method !== 'manual' &&
                  'Detected automatically; may be wrong.'}
              </>
            ) : (
              'Shared by a community member and not yet checked.'
            )}
          </p>
        </Section>
      </div>
    </article>
  );
}
