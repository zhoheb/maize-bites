import { umichEmailSchema } from '@maize-bites/shared';
import { useState } from 'react';
import { ApiRequestError } from '../api/client';
import { requestMagicLink } from '../api/account';
import { card, inputClass, primaryButton, secondaryButton } from '../components/forms';

type State =
  { step: 'form'; error: string | null } | { step: 'sending' } | { step: 'sent'; email: string };

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ step: 'form', error: null });

  async function submit() {
    const parsed = umichEmailSchema.safeParse(email);
    if (!parsed.success) {
      setState({ step: 'form', error: 'Enter your @umich.edu email address.' });
      return;
    }
    setState({ step: 'sending' });
    try {
      await requestMagicLink(parsed.data);
      setState({ step: 'sent', email: parsed.data });
    } catch (error) {
      const message =
        error instanceof ApiRequestError && error.code === 'rate_limited'
          ? 'Too many sign-in emails. Wait a few minutes and try again.'
          : error instanceof ApiRequestError && error.status === 400
            ? 'Enter your @umich.edu email address.'
            : "We couldn't send the email. Try again in a moment.";
      setState({ step: 'form', error: message });
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className={card}>
        {state.step === 'sent' ? (
          <div role="status">
            <h1 className="text-2xl font-bold text-ink">Check your email</h1>
            <p className="mt-3 text-ink-2">
              We sent a sign-in link to <strong>{state.email}</strong>. It works once and expires in
              15 minutes.
            </p>
            <p className="mt-2 text-sm text-ink-2">
              Open it on this device to stay signed in here.
            </p>
            <button
              type="button"
              className={`${secondaryButton} mt-5`}
              onClick={() => {
                setState({ step: 'form', error: null });
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h1 className="text-2xl font-bold text-ink">Sign in</h1>
            <p className="mt-2 text-ink-2">
              Get free-food alerts. No password: we'll email you a link.
            </p>
            <label htmlFor="email" className="mt-5 block text-sm font-semibold text-ink">
              UMich email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="uniqname@umich.edu"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              aria-invalid={state.step === 'form' && state.error !== null}
              aria-describedby={state.step === 'form' && state.error ? 'email-error' : 'email-hint'}
              className={`${inputClass} mt-1.5`}
            />
            {state.step === 'form' && state.error ? (
              <p id="email-error" role="alert" className="mt-2 text-sm font-medium text-warn">
                {state.error}
              </p>
            ) : (
              <p id="email-hint" className="mt-2 text-sm text-ink-2">
                Only @umich.edu addresses can sign in.
              </p>
            )}
            <button
              type="submit"
              className={`${primaryButton} mt-5 w-full`}
              disabled={state.step === 'sending'}
            >
              {state.step === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
