import { useEffect, useState } from 'react';
import { usePushPublicKey } from '../api/account';
import { sendJson } from '../api/mutations';
import { browserPushSupport, currentPushSubscription, subscribeToPush } from '../lib/push';
import { secondaryButton } from './forms';

type Status = 'checking' | 'off' | 'on' | 'working' | 'denied' | 'error';

/** Explains, then asks for notification permission only when the user clicks. */
export function PushSetup({ onChange }: { onChange: (enabled: boolean) => void }) {
  const support = browserPushSupport();
  const key = usePushPublicKey();
  const [status, setStatus] = useState<Status>(() =>
    support.kind === 'supported' && Notification.permission === 'denied' ? 'denied' : 'checking',
  );

  useEffect(() => {
    if (support.kind !== 'supported' || Notification.permission === 'denied') return;
    currentPushSubscription().then(
      (sub) => {
        setStatus(sub ? 'on' : 'off');
      },
      () => {
        setStatus('off');
      },
    );
  }, [support.kind]);

  if (support.kind === 'ios-needs-install') {
    return (
      <p className="text-sm text-slate-700">
        On iPhone and iPad, push alerts work once Maize Bites is on your Home Screen: tap{' '}
        <strong>Share</strong>, then <strong>Add to Home Screen</strong>, and open it from there.
      </p>
    );
  }
  if (support.kind === 'unsupported') {
    return (
      <p className="text-sm text-slate-700">
        This browser doesn't support push notifications. Use email alerts instead.
      </p>
    );
  }
  if (key.isSuccess && key.data === null) {
    return (
      <p className="text-sm text-slate-700">
        Push notifications aren't available yet. Use email alerts for now.
      </p>
    );
  }
  if (status === 'denied') {
    return (
      <p className="text-sm text-slate-700">
        Notifications are blocked for this site. To turn them on, allow notifications in your
        browser's site settings, then reload this page.
      </p>
    );
  }

  async function enable() {
    if (!key.data) return;
    setStatus('working');
    try {
      const sub = await subscribeToPush(key.data);
      await sendJson('POST', '/api/me/push', sub);
      setStatus('on');
      onChange(true);
    } catch (error) {
      setStatus(
        error instanceof Error && error.message === 'denied'
          ? 'denied'
          : error instanceof Error && error.message === 'dismissed'
            ? 'off'
            : 'error',
      );
    }
  }

  async function disable() {
    setStatus('working');
    try {
      const sub = await currentPushSubscription();
      if (sub) {
        await sendJson('DELETE', '/api/me/push', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setStatus('off');
      onChange(false);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="space-y-2 text-sm text-slate-700">
      {status === 'on' ? (
        <>
          <p>
            <strong className="text-michigan-blue">Push is on for this device.</strong> Other
            devices need to be turned on separately.
          </p>
          <button type="button" className={secondaryButton} onClick={() => void disable()}>
            Turn off on this device
          </button>
        </>
      ) : (
        <>
          <p>
            Get a notification on this device when free food matching your filters is posted. Your
            browser will ask for permission next; you can turn it off any time.
          </p>
          <button
            type="button"
            className={secondaryButton}
            disabled={status === 'working' || status === 'checking' || !key.data}
            onClick={() => void enable()}
          >
            {status === 'working' ? 'Turning on…' : 'Turn on push for this device'}
          </button>
          {status === 'error' && (
            <p role="alert" className="font-medium text-red-700">
              Something went wrong turning on push. Try again.
            </p>
          )}
        </>
      )}
    </div>
  );
}
