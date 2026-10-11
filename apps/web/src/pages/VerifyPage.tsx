import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { accountKeys, verifyMagicLink } from '../api/account';
import { card, primaryButton } from '../components/forms';

/**
 * Landing page for the emailed link. It calls the API from JavaScript (rather than the email
 * linking straight to the API) so link scanners that prefetch URLs can't use up the token.
 */
export function VerifyPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const client = useQueryClient();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: never verify twice (StrictMode runs effects twice in dev).
    if (started.current) return;
    started.current = true;
    verifyMagicLink(token).then(
      async (user) => {
        // The header's /api/me request may still be in flight from before the cookie existed;
        // cancel it so its 401 can't overwrite the signed-in user.
        await client.cancelQueries({ queryKey: accountKeys.me });
        client.setQueryData(accountKeys.me, user);
        await navigate('/alerts', { replace: true });
      },
      () => {
        setFailed(true);
      },
    );
  }, [token, client, navigate]);

  return (
    <div className="mx-auto max-w-[35rem] px-4 py-10">
      <div className={card} role={failed ? 'alert' : 'status'}>
        {failed ? (
          <>
            <h1 className="text-2xl font-semibold text-ink">That link didn't work</h1>
            <p className="mt-3 text-ink-2">Sign-in links work once and expire after 15 minutes.</p>
            <Link to="/sign-in" className={`${primaryButton} mt-5`}>
              Send a new link
            </Link>
          </>
        ) : (
          <p className="text-ink-2">Signing you in…</p>
        )}
      </div>
    </div>
  );
}
