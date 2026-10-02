import type { ClassificationMethod } from '@maize-bites/shared';
import { ApiRequestError } from '../api/client';
import { icsUrl } from '../api/events';
import { useEventDetail } from '../api/queries';
import { useNow } from '../hooks/useNow';
import { directionsUrl, formatLocation, formatTimeRange } from '../lib/format';
import { DIETARY_LABELS, MEAL_LABELS } from '../lib/labels';
import { AudienceBadge, Badge } from './Badge';
import { Countdown } from './Countdown';
import { EmptyState, ErrorState } from './States';

const METHOD_LABELS: Record<ClassificationMethod, string> = {
  llm: 'Found by our AI classifier',
  rules: 'Matched by keyword rules',
  manual: 'Checked by a person',
};

const actionClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-michigan-blue';

function DetailsSkeleton() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">Loading event…</span>
      {[80, 40, 60, 90, 70].map((w) => (
        <div
          key={w}
          aria-hidden="true"
          className="h-4 rounded bg-slate-200 motion-safe:animate-pulse"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
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
  const now = useNow();

  if (query.isPending) return <DetailsSkeleton />;
  if (query.isError) {
    if (
      query.error instanceof ApiRequestError &&
      (query.error.status === 404 || query.error.status === 400)
    ) {
      return (
        <EmptyState
          title="This event isn't listed anymore"
          action={{ label: 'See free food now', to: '/' }}
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
  const directions = directionsUrl(event);

  return (
    <article className={event.likelyGone ? 'opacity-90' : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <AudienceBadge audience={event.audience} />
        {event.mealType && <Badge tone="blue">{MEAL_LABELS[event.mealType]}</Badge>}
        {event.likelyGone && <Badge tone="warn">Food may be gone</Badge>}
      </div>
      <Heading id={titleId} className="mt-2 text-2xl font-bold leading-tight text-michigan-blue">
        {event.title}
      </Heading>

      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <Countdown event={event} now={now} />
        <time dateTime={event.startsAt}>{formatTimeRange(event)}</time>
      </p>
      {location && <p className="mt-1 text-sm text-slate-700">{location}</p>}

      {event.likelyGone && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {event.reportCounts.food_gone} people reported the food is gone.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={icsUrl(event.id)}
          download
          className={`${actionClass} bg-michigan-blue text-white hover:bg-michigan-blue/90`}
        >
          Add to calendar
        </a>
        {directions && (
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className={`${actionClass} bg-maize text-michigan-blue hover:brightness-95`}
          >
            Directions<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${actionClass} border border-slate-300 bg-white text-michigan-blue hover:bg-slate-50`}
          >
            Source listing<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>

      <dl className="mt-6 space-y-4 text-sm">
        {event.foodItems.length > 0 && (
          <div>
            <dt className="font-semibold text-slate-900">Food</dt>
            <dd className="mt-1 capitalize text-slate-700">{event.foodItems.join(', ')}</dd>
          </div>
        )}
        {event.dietary.length > 0 && (
          <div>
            <dt className="font-semibold text-slate-900">Dietary</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {event.dietary.map((d) => (
                <Badge key={d}>{DIETARY_LABELS[d]}</Badge>
              ))}
            </dd>
          </div>
        )}
        {event.sponsor && (
          <div>
            <dt className="font-semibold text-slate-900">Hosted by</dt>
            <dd className="mt-1 text-slate-700">{event.sponsor}</dd>
          </div>
        )}
        <div>
          <dt className="font-semibold text-slate-900">Why it's listed</dt>
          <dd className="mt-1 text-slate-700">
            {event.classification ? (
              <>
                {METHOD_LABELS[event.classification.method]}
                {event.classification.evidence && <> from “{event.classification.evidence}”</>}.
              </>
            ) : (
              'Shared by a community member.'
            )}
          </dd>
        </div>
      </dl>

      {event.description && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-900">About this event</h3>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">
            {event.description}
          </p>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Dietary details come from the listing and our classifier and may be incomplete. Confirm with
        the host if you have allergies.
      </p>
    </article>
  );
}
