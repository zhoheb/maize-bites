// Browser Web Push helpers. Kept free of React so the support logic is easy to test.

export type PushSupport =
  | { kind: 'supported' }
  /** iOS/iPadOS Safari supports push only for Home Screen web apps. */
  | { kind: 'ios-needs-install' }
  | { kind: 'unsupported' };

export function detectPushSupport(env: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  userAgent: string;
  standalone: boolean;
}): PushSupport {
  const ua = env.userAgent;
  // iPadOS reports as "Macintosh" but keeps "Mobile".
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && ua.includes('Mobile'));
  if (isIos && !env.standalone) return { kind: 'ios-needs-install' };
  if (env.hasServiceWorker && env.hasPushManager && env.hasNotification)
    return { kind: 'supported' };
  return { kind: 'unsupported' };
}

export function browserPushSupport(): PushSupport {
  return detectPushSupport({
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  });
}

/** VAPID keys are base64url; PushManager wants the raw bytes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** Asks for permission (only call from a click), subscribes, and returns the subscription JSON. */
export async function subscribeToPush(publicKey: string): Promise<PushSubscriptionJSON> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'denied' : 'dismissed');
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }));
  return subscription.toJSON();
}
