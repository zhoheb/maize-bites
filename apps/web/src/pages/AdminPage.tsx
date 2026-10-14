import {
  AUDIENCES,
  MEAL_TYPES,
  type AdminMetricsResponse,
  type Building,
  type OverrideRequest,
  type ReviewQueueResponse,
} from '@maize-bites/shared';
import { useState, type ReactNode } from 'react';
import { useMe } from '../api/account';
import {
  useAddAlias,
  useAdminMetrics,
  useOverrideEvent,
  useReviewQueue,
  useReviewSubmission,
} from '../api/admin';
import { useBuildings } from '../api/crowd';
import { AnalyticsPanel } from '../components/AnalyticsPanel';
import { Badge } from '../components/ui/Badge';
import { card, inputClass, primaryButton, secondaryButton } from '../components/forms';
import { EmptyState, ErrorState } from '../components/States';
import { formatRelative, formatTimeRange } from '../lib/format';
import { AUDIENCE_LABELS, MEAL_LABELS } from '../lib/labels';

const SOURCE_LABELS: Record<string, string> = {
  happening: 'Happening @ Michigan',
  maizepages: 'Maize Pages',
  submission: 'Community tip',
};

const OUTCOME_LABELS: Record<keyof AdminMetricsResponse['classifier']['outcomes'], string> = {
  published: 'Published',
  review: 'Waiting for review',
  pending_llm: 'Waiting for the classifier',
  rejected_rules: 'No food keywords',
  rejected_llm: 'Classifier said no',
  hidden_by_admin: 'Hidden by an admin',
  unclassified: 'Not classified yet',
};

function Panel({ title, children }: { title: string; children: ReactNode }) {
  const id = `admin-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={card}>
      <h2 id={id} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

type QueueEvent = ReviewQueueResponse['events'][number];

function EventReview({ item }: { item: QueueEvent }) {
  const override = useOverrideEvent();
  const [foodItems, setFoodItems] = useState(item.classification?.foodItems.join(', ') ?? '');
  const [mealType, setMealType] = useState(item.classification?.mealType ?? '');
  const [audience, setAudience] = useState(item.classification?.audience ?? '');
  const { event, classification, flag } = item;

  const send = (action: OverrideRequest['action']) => {
    override.mutate({
      eventId: event.id,
      action,
      foodItems: foodItems
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean),
      mealType: MEAL_TYPES.find((m) => m === mealType) ?? null,
      audience: AUDIENCES.find((a) => a === audience) ?? null,
    });
  };

  return (
    <li className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{SOURCE_LABELS[event.source] ?? event.source}</Badge>
        {flag && <Badge tone="danger">Classifier failed</Badge>}
        {classification && (
          <Badge>
            {classification.method} {Math.round(classification.confidence * 100)}%
          </Badge>
        )}
      </div>
      <h3 className="mt-1 font-semibold text-ink">{event.title}</h3>
      <p className="text-sm text-ink-2">
        <time dateTime={event.startsAt}>{formatTimeRange(event)}</time>
        {event.locationName && <> · {event.locationName}</>}
      </p>
      {classification?.evidence && (
        <p className="mt-1 text-sm text-ink-2">Evidence: “{classification.evidence}”</p>
      )}
      {flag && <p className="mt-1 text-sm text-members">{flag.detail ?? flag.reason}</p>}
      {event.url && (
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-sm font-semibold text-ink underline"
        >
          Source listing<span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Edit details</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium text-ink">
            Food (comma-separated)
            <input
              type="text"
              className={`${inputClass} mt-1`}
              value={foodItems}
              onChange={(e) => {
                setFoodItems(e.target.value);
              }}
            />
          </label>
          <label className="text-sm font-medium text-ink">
            Meal
            <select
              className={`${inputClass} mt-1`}
              value={mealType}
              onChange={(e) => {
                setMealType(e.target.value);
              }}
            >
              <option value="">Unknown</option>
              {MEAL_TYPES.map((m) => (
                <option key={m} value={m}>
                  {MEAL_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-ink">
            Who can come
            <select
              className={`${inputClass} mt-1`}
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value);
              }}
            >
              <option value="">Unknown</option>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={override.isPending}
          aria-label={`Show ${event.title}`}
          onClick={() => {
            send('show');
          }}
        >
          Show
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={override.isPending}
          aria-label={`Hide ${event.title}`}
          onClick={() => {
            send('hide');
          }}
        >
          Hide
        </button>
      </div>
      {override.isError && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          Couldn't save that. Try again.
        </p>
      )}
    </li>
  );
}

function TipReview({ tip }: { tip: ReviewQueueResponse['submissions'][number] }) {
  const review = useReviewSubmission();
  return (
    <li className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <h3 className="font-semibold text-ink">{tip.title}</h3>
      <p className="text-sm text-ink-2">
        <time dateTime={tip.startsAt}>{formatTimeRange(tip)}</time> · {tip.locationName}
        {tip.room && <> · {tip.room}</>}
      </p>
      {tip.description && <p className="mt-1 text-sm text-ink-2">{tip.description}</p>}
      <p className="mt-1 text-xs text-ink-3">
        From {tip.submitter.email} ({tip.submitter.trustLevel} approved so far)
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButton}
          disabled={review.isPending}
          aria-label={`Approve ${tip.title}`}
          onClick={() => {
            review.mutate({ id: tip.id, action: 'approve' });
          }}
        >
          Approve
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={review.isPending}
          aria-label={`Reject ${tip.title}`}
          onClick={() => {
            review.mutate({ id: tip.id, action: 'reject' });
          }}
        >
          Reject
        </button>
      </div>
      {review.isError && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          Couldn't save that. Try again.
        </p>
      )}
    </li>
  );
}

/** Force any event shown or hidden by its id or its page link. */
function OverrideById() {
  const override = useOverrideEvent();
  const [value, setValue] = useState('');
  const id = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(value)?.[0];
  return (
    <form
      className="mt-4 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <label htmlFor="override-id" className="block text-sm font-semibold text-ink">
        Override any event
      </label>
      <input
        id="override-id"
        type="text"
        placeholder="Paste an event link or id"
        className={`${inputClass} mt-1.5`}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {(['show', 'hide'] as const).map((action) => (
          <button
            key={action}
            type="button"
            className={secondaryButton}
            disabled={!id || override.isPending}
            onClick={() => {
              if (id) override.mutate({ eventId: id, action });
            }}
          >
            {action === 'show' ? 'Show it' : 'Hide it'}
          </button>
        ))}
      </div>
      <p role="status" className="mt-2 text-sm text-ink-2">
        {override.isSuccess && 'Saved.'}
        {override.isError && "Couldn't find or change that event."}
      </p>
    </form>
  );
}

function MissRow({
  miss,
  buildings,
}: {
  miss: AdminMetricsResponse['locationMisses'][number];
  buildings: readonly Building[];
}) {
  const addAlias = useAddAlias();
  const [buildingId, setBuildingId] = useState('');
  return (
    <li className="flex flex-wrap items-center gap-2 border-t border-line py-2 first:border-t-0">
      <span className="min-w-0 flex-1 text-sm text-ink">
        <span className="font-medium">{miss.locationName}</span>
        <span className="text-ink-3"> · seen {miss.seenCount}×</span>
      </span>
      <select
        aria-label={`Building for ${miss.locationName}`}
        className="min-h-10 max-w-44 rounded-lg border border-line-strong bg-card px-2 text-sm"
        value={buildingId}
        onChange={(e) => {
          setBuildingId(e.target.value);
        }}
      >
        <option value="">Is this…</option>
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={secondaryButton}
        disabled={buildingId === '' || addAlias.isPending || addAlias.isSuccess}
        onClick={() => {
          addAlias.mutate({ buildingId, alias: miss.locationName });
        }}
      >
        {addAlias.isSuccess ? 'Added' : 'Add alias'}
      </button>
    </li>
  );
}

export function AdminPage() {
  const me = useMe();
  const isAdmin = me.isSuccess && me.data?.isAdmin === true;
  const queue = useReviewQueue(isAdmin);
  const metrics = useAdminMetrics(isAdmin);
  const buildings = useBuildings(isAdmin);
  const now = new Date();

  if (me.isPending) return <p className="mx-auto max-w-3xl px-4 py-10 text-ink-2">Loading…</p>;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-[35rem] px-4 py-10">
        <EmptyState
          title="Admins only"
          actions={[{ label: 'Back to free food', to: '/', primary: true }]}
        >
          This page is for the people who review listings.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <h1 className="text-2xl font-semibold text-ink">Admin</h1>

      <AnalyticsPanel />

      <Panel title="Review queue">
        {queue.isPending && <p className="text-sm text-ink-2">Loading…</p>}
        {queue.isError && (
          <ErrorState message="Couldn't load the queue." onRetry={() => void queue.refetch()} />
        )}
        {queue.data && (
          <>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-3">
              Tips ({queue.data.submissions.length})
            </h3>
            {queue.data.submissions.length === 0 ? (
              <p className="mt-1 text-sm text-ink-2">No tips waiting.</p>
            ) : (
              <ul className="mt-2">
                {queue.data.submissions.map((tip) => (
                  <TipReview key={tip.id} tip={tip} />
                ))}
              </ul>
            )}
            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-ink-3">
              Events ({queue.data.events.length})
            </h3>
            {queue.data.events.length === 0 ? (
              <p className="mt-1 text-sm text-ink-2">No events need a look.</p>
            ) : (
              <ul className="mt-2">
                {queue.data.events.map((item) => (
                  <EventReview key={item.event.id} item={item} />
                ))}
              </ul>
            )}
          </>
        )}
        <OverrideById />
      </Panel>

      {metrics.isError && (
        <ErrorState message="Couldn't load the metrics." onRetry={() => void metrics.refetch()} />
      )}
      {metrics.data && (
        <>
          <Panel title="Ingestion">
            {metrics.data.sources.length === 0 ? (
              <p className="text-sm text-ink-2">No ingestion runs yet.</p>
            ) : (
              <ul className="space-y-3">
                {metrics.data.sources.map((s) => {
                  const healthy = s.lastError === null && s.lastSuccessAt !== null;
                  return (
                    <li key={s.source}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">
                          {SOURCE_LABELS[s.source] ?? s.source}
                        </span>
                        <Badge tone={healthy ? 'ok' : 'danger'}>
                          {healthy ? 'Healthy' : 'Failing'}
                        </Badge>
                      </div>
                      <p className="text-sm text-ink-2">
                        Last success:{' '}
                        {s.lastSuccessAt ? formatRelative(new Date(s.lastSuccessAt), now) : 'never'}{' '}
                        · {s.recentComplete} of {s.recentRuns} recent runs completed
                      </p>
                      {s.lastError && (
                        <p className="mt-1 break-words text-sm text-members">{s.lastError}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Classifier">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {Object.entries(OUTCOME_LABELS).map(([key, label]) => (
                <div key={key}>
                  <dt className="text-ink-2">{label}</dt>
                  <dd className="text-lg font-semibold text-ink">
                    {metrics.data.classifier.outcomes[key as keyof typeof OUTCOME_LABELS]}
                  </dd>
                </div>
              ))}
              <div>
                <dt className="text-ink-2">LLM verdicts this week</dt>
                <dd className="text-lg font-semibold text-ink">
                  {metrics.data.classifier.llmClassifications}
                </dd>
              </div>
              <div>
                <dt className="text-ink-2">Alerts sent / failed</dt>
                <dd className="text-lg font-semibold text-ink">
                  {metrics.data.classifier.alerts.sent} / {metrics.data.classifier.alerts.failed}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Location misses">
            {metrics.data.locationMisses.length === 0 ? (
              <p className="text-sm text-ink-2">Every location matched a building.</p>
            ) : (
              <ul>
                {metrics.data.locationMisses.slice(0, 25).map((miss) => (
                  <MissRow key={miss.id} miss={miss} buildings={buildings.data ?? []} />
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
