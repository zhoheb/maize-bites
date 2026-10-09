import {
  submissionRequestSchema,
  type Building,
  type SubmissionResponse,
} from '@maize-bites/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../api/account';
import { ApiRequestError } from '../api/client';
import { useBuildings, useSubmitTip } from '../api/crowd';
import { BuildingPicker } from '../components/BuildingPicker';
import { card, inputClass, primaryButton, secondaryButton } from '../components/forms';
import { EmptyState, ErrorState } from '../components/States';
import { fromCampusInput, toCampusInput } from '../lib/campus-time';

type Errors = Partial<Record<'title' | 'buildingId' | 'startsAt' | 'endsAt' | 'form', string>>;

const labelClass = 'block text-sm font-semibold text-slate-900';
const errorClass = 'mt-1.5 text-sm font-medium text-red-700';

function Done({ result, onAnother }: { result: SubmissionResponse; onAnother: () => void }) {
  return (
    <div role="status" className={card}>
      <h1 className="text-2xl font-extrabold text-michigan-blue">
        {result.status === 'approved' ? 'Your tip is live' : 'Thanks for the tip'}
      </h1>
      <p className="mt-3 text-slate-700">
        {result.status === 'approved'
          ? 'It was published right away because your earlier tips checked out.'
          : 'A moderator will look at it before it shows up. After three approved tips, yours publish right away.'}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {result.eventId && (
          <Link to={`/events/${result.eventId}`} className={primaryButton}>
            See it
          </Link>
        )}
        <button type="button" className={secondaryButton} onClick={onAnother}>
          Share another
        </button>
      </div>
    </div>
  );
}

export function SubmitPage() {
  const me = useMe();
  const signedIn = me.isSuccess && me.data !== null;
  const buildings = useBuildings(signedIn);
  const submit = useSubmitTip();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [building, setBuilding] = useState<Building | null>(null);
  const [room, setRoom] = useState('');
  const [startsAt, setStartsAt] = useState(() => toCampusInput(new Date()));
  const [endsAt, setEndsAt] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<SubmissionResponse | null>(null);

  if (me.isPending) return <p className="mx-auto max-w-xl px-4 py-10 text-slate-600">Loading…</p>;
  if (!signedIn) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <EmptyState
          title="Sign in to share free food"
          action={{ label: 'Sign in', to: '/sign-in' }}
        >
          Tips come from people with a UMich email, so everyone can trust what's listed.
        </EmptyState>
      </div>
    );
  }
  if (result) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <Done
          result={result}
          onAnother={() => {
            setResult(null);
            setTitle('');
            setDescription('');
            setRoom('');
            setEndsAt('');
            setStartsAt(toCampusInput(new Date()));
          }}
        />
      </div>
    );
  }

  const onSubmit = () => {
    const parsed = submissionRequestSchema.safeParse({
      title,
      description,
      buildingId: building?.id ?? '',
      room,
      startsAt: fromCampusInput(startsAt) ?? '',
      endsAt: endsAt === '' ? null : fromCampusInput(endsAt),
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'title' || field === 'buildingId' || field === 'endsAt')
          next[field] ??= issue.message;
        else if (field === 'startsAt') next.startsAt ??= 'Pick a start time';
      }
      setErrors(next);
      return;
    }
    setErrors({});
    submit.mutate(parsed.data, {
      onSuccess: setResult,
      onError: (error) => {
        setErrors({
          form:
            error instanceof ApiRequestError && error.status < 500
              ? error.message
              : "Couldn't send your tip. Try again.",
        });
      },
    });
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <form
        noValidate
        className={card}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <h1 className="text-2xl font-extrabold text-michigan-blue">Share free food</h1>
        <p className="mt-2 text-slate-700">
          Spotted leftovers or an event feeding people? Tell everyone where.
        </p>

        <label htmlFor="tip-title" className={`${labelClass} mt-5`}>
          What is it?
        </label>
        <input
          id="tip-title"
          type="text"
          maxLength={200}
          placeholder="Leftover pizza from a talk"
          className={`${inputClass} mt-1.5`}
          value={title}
          aria-invalid={errors.title !== undefined}
          aria-describedby={errors.title ? 'tip-title-error' : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
        {errors.title && (
          <p id="tip-title-error" role="alert" className={errorClass}>
            {errors.title}
          </p>
        )}

        <label htmlFor="tip-building" className={`${labelClass} mt-5`}>
          Building
        </label>
        <div className="mt-1.5">
          <BuildingPicker
            inputId="tip-building"
            buildings={buildings.data ?? []}
            value={building}
            onChange={setBuilding}
            invalid={errors.buildingId !== undefined}
            describedBy={errors.buildingId ? 'tip-building-error' : undefined}
          />
        </div>
        {errors.buildingId && (
          <p id="tip-building-error" role="alert" className={errorClass}>
            {errors.buildingId}
          </p>
        )}
        {buildings.isError && (
          <div className="mt-2">
            <ErrorState
              message="Couldn't load the building list."
              onRetry={() => void buildings.refetch()}
            />
          </div>
        )}

        <label htmlFor="tip-room" className={`${labelClass} mt-5`}>
          Room or spot <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="tip-room"
          type="text"
          maxLength={100}
          placeholder="2nd floor lounge"
          className={`${inputClass} mt-1.5`}
          value={room}
          onChange={(e) => {
            setRoom(e.target.value);
          }}
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tip-starts" className={labelClass}>
              Starts <span className="font-normal text-slate-500">(Ann Arbor time)</span>
            </label>
            <input
              id="tip-starts"
              type="datetime-local"
              className={`${inputClass} mt-1.5`}
              value={startsAt}
              aria-invalid={errors.startsAt !== undefined}
              aria-describedby={errors.startsAt ? 'tip-starts-error' : undefined}
              onChange={(e) => {
                setStartsAt(e.target.value);
              }}
            />
            {errors.startsAt && (
              <p id="tip-starts-error" role="alert" className={errorClass}>
                {errors.startsAt}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="tip-ends" className={labelClass}>
              Ends <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="tip-ends"
              type="datetime-local"
              className={`${inputClass} mt-1.5`}
              value={endsAt}
              aria-invalid={errors.endsAt !== undefined}
              aria-describedby={errors.endsAt ? 'tip-ends-error' : undefined}
              onChange={(e) => {
                setEndsAt(e.target.value);
              }}
            />
            {errors.endsAt && (
              <p id="tip-ends-error" role="alert" className={errorClass}>
                {errors.endsAt}
              </p>
            )}
          </div>
        </div>

        <label htmlFor="tip-description" className={`${labelClass} mt-5`}>
          Details <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <textarea
          id="tip-description"
          rows={3}
          maxLength={2000}
          placeholder="What food, how much, any dietary notes"
          className={`${inputClass} mt-1.5`}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />

        {errors.form && (
          <p role="alert" className={`${errorClass} mt-4`}>
            {errors.form}
          </p>
        )}
        <button
          type="submit"
          className={`${primaryButton} mt-5 w-full`}
          disabled={submit.isPending}
        >
          {submit.isPending ? 'Sending…' : 'Share it'}
        </button>
      </form>
    </div>
  );
}
