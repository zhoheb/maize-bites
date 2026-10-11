import {
  CAMPUSES,
  DEFAULT_ALERT_PREFERENCES,
  DIETARY_TAGS,
  type AlertPreferencesInput,
  type Channel,
} from '@maize-bites/shared';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAlertPreferences, useMe, useSaveAlertPreferences, useSignOut } from '../api/account';
import { Chip } from '../components/ui/Chip';
import { card, inputClass, primaryButton, secondaryButton } from '../components/forms';
import { PushSetup } from '../components/PushSetup';
import { toggle } from '../lib/filters';
import { CAMPUS_LABELS, DIETARY_LABELS } from '../lib/labels';

function Fieldset({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <legend className="float-left mb-1 w-full text-base font-bold text-ink">{legend}</legend>
      {hint && <p className="clear-left mb-3 text-sm text-ink-2">{hint}</p>}
      <div className="clear-left">{children}</div>
    </fieldset>
  );
}

function withChannel(
  prefs: AlertPreferencesInput,
  channel: Channel,
  on: boolean,
): AlertPreferencesInput {
  const channels = on
    ? [...new Set([...prefs.channels, channel])]
    : prefs.channels.filter((c) => c !== channel);
  return { ...prefs, channels };
}

export function AlertsPage() {
  const me = useMe();
  const user = me.data ?? null;
  const saved = useAlertPreferences(user !== null);

  if (me.isPending || (user !== null && saved.isPending)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10" role="status">
        <span className="sr-only">Loading your alert settings…</span>
        <div aria-hidden="true" className="h-64 rounded-card bg-line motion-safe:animate-pulse" />
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className={card}>
          <h1 className="text-2xl font-bold text-ink">Free food alerts</h1>
          <p className="mt-3 text-ink-2">
            Get an email or a push notification when free food you'd want shows up: your campus,
            your diet, open events only. Or a single 7:30 AM digest.
          </p>
          <Link to="/sign-in" className={`${primaryButton} mt-5`}>
            Sign in with your UMich email
          </Link>
        </div>
      </div>
    );
  }

  // Initialized once per user from the loaded preferences; saving updates the cache without
  // remounting (which would drop the "Saved" message).
  return (
    <AlertsForm
      key={user.email}
      email={user.email}
      initial={saved.data ?? DEFAULT_ALERT_PREFERENCES}
    />
  );
}

function AlertsForm({ email, initial }: { email: string; initial: AlertPreferencesInput }) {
  const save = useSaveAlertPreferences();
  const signOut = useSignOut();
  const [draft, setDraft] = useState<AlertPreferencesInput>(initial);
  const [message, setMessage] = useState<string | null>(null);

  async function persist(next: AlertPreferencesInput, note: string) {
    setMessage(null);
    try {
      await save.mutateAsync(next);
      setMessage(note);
    } catch {
      setMessage("Couldn't save. Check your connection and try again.");
    }
  }

  function submit() {
    void persist(
      draft,
      draft.channels.length === 0 ? 'Saved. Alerts are off.' : 'Saved. Your alerts are updated.',
    );
  }

  const quietOn = draft.quietHours !== null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Alerts</h1>
          <p className="mt-1 text-sm text-ink-2">Signed in as {email}</p>
        </div>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            signOut.mutate();
          }}
        >
          Sign out
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`${card} mt-5 space-y-5`}
      >
        <Fieldset legend="How should we reach you?">
          <label className="flex items-center gap-3 text-ink">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={draft.channels.includes('email')}
              onChange={(e) => {
                setDraft(withChannel(draft, 'email', e.target.checked));
              }}
            />
            Email <span className="text-sm text-ink-3">({email})</span>
          </label>
          <div className="mt-4 rounded-xl bg-sunken p-4">
            <p className="mb-2 font-semibold text-ink">Push notifications</p>
            <PushSetup
              onChange={(enabled) => {
                const next = withChannel(draft, 'push', enabled);
                setDraft(next);
                void persist(
                  next,
                  enabled ? 'Push alerts are on.' : 'Push is off for this device.',
                );
              }}
            />
          </div>
        </Fieldset>

        <Fieldset legend="When">
          <div className="space-y-2">
            {(
              [
                ['instant', 'As soon as it’s posted', 'Best for grabbing food before it’s gone.'],
                ['digest', 'Morning digest at 7:30 AM', 'One message with the day’s free food.'],
              ] as const
            ).map(([mode, label, hint]) => (
              <label key={mode} className="flex items-start gap-3 rounded-lg p-2 hover:bg-sunken">
                <input
                  type="radio"
                  name="mode"
                  className="mt-1 size-4 accent-primary"
                  checked={draft.mode === mode}
                  onChange={() => {
                    setDraft({ ...draft, mode });
                  }}
                />
                <span>
                  <span className="font-medium text-ink">{label}</span>
                  <span className="block text-sm text-ink-2">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Fieldset>

        <Fieldset legend="Only tell me about" hint="Leave a group empty to include everything.">
          <div role="group" aria-label="Campuses" className="flex flex-wrap gap-2">
            {CAMPUSES.map((c) => (
              <Chip
                key={c}
                pressed={draft.campuses.includes(c)}
                onClick={() => {
                  setDraft({ ...draft, campuses: toggle(draft.campuses, c) });
                }}
              >
                {CAMPUS_LABELS[c]}
              </Chip>
            ))}
          </div>
          <div role="group" aria-label="Dietary needs" className="mt-3 flex flex-wrap gap-2">
            {DIETARY_TAGS.map((d) => (
              <Chip
                key={d}
                pressed={draft.dietary.includes(d)}
                onClick={() => {
                  setDraft({ ...draft, dietary: toggle(draft.dietary, d) });
                }}
              >
                {DIETARY_LABELS[d]}
              </Chip>
            ))}
          </div>
          <div className="mt-3">
            <Chip
              pressed={draft.openOnly}
              onClick={() => {
                setDraft({ ...draft, openOnly: !draft.openOnly });
              }}
            >
              Open to all only
            </Chip>
          </div>
        </Fieldset>

        <Fieldset
          legend="Quiet hours"
          hint="No instant alerts during this time. Anything posted then is sent when it ends (if the event is still on)."
        >
          <label className="flex items-center gap-3 text-ink">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={quietOn}
              onChange={(e) => {
                setDraft({
                  ...draft,
                  quietHours: e.target.checked ? { start: '22:00', end: '08:00' } : null,
                });
              }}
            />
            Pause alerts overnight
          </label>
          {draft.quietHours && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="quiet-start" className="block text-sm font-medium text-ink">
                  From
                </label>
                <input
                  id="quiet-start"
                  type="time"
                  className={`${inputClass} mt-1 w-36`}
                  value={draft.quietHours.start}
                  onChange={(e) => {
                    setDraft({
                      ...draft,
                      quietHours: { start: e.target.value, end: draft.quietHours?.end ?? '08:00' },
                    });
                  }}
                />
              </div>
              <div>
                <label htmlFor="quiet-end" className="block text-sm font-medium text-ink">
                  Until
                </label>
                <input
                  id="quiet-end"
                  type="time"
                  className={`${inputClass} mt-1 w-36`}
                  value={draft.quietHours.end}
                  onChange={(e) => {
                    setDraft({
                      ...draft,
                      quietHours: {
                        start: draft.quietHours?.start ?? '22:00',
                        end: e.target.value,
                      },
                    });
                  }}
                />
              </div>
              <p className="pb-2 text-sm text-ink-2">Ann Arbor time</p>
            </div>
          )}
        </Fieldset>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <button type="submit" className={primaryButton} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save alert settings'}
          </button>
          <p role="status" className="text-sm font-medium text-ink-2">
            {message}
          </p>
        </div>
      </form>
    </div>
  );
}
