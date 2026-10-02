/// <reference lib="webworker" />
// Service worker: precaches the app shell so the PWA installs and opens offline.
// API responses are deliberately not cached; stale free-food listings would mislead.
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Client-side routes (/events/:id, /about) load the shell; never intercept the API.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }),
);

self.addEventListener('install', () => {
  void self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Web Push ────────────────────────────────────────────────────────────────
// Payload shape: pushPayloadSchema in @maize-bites/shared ({ title, body, url, tag }).

interface Payload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

function readPayload(data: PushMessageData | null): Payload {
  const fallback: Payload = {
    title: 'Maize Bites',
    body: 'Free food nearby',
    url: '/',
    tag: 'maize-bites',
  };
  try {
    const raw = data?.json() as Partial<Payload> | undefined;
    return {
      title: typeof raw?.title === 'string' ? raw.title : fallback.title,
      body: typeof raw?.body === 'string' ? raw.body : fallback.body,
      // Only same-origin paths; never open an arbitrary URL from a push.
      url:
        typeof raw?.url === 'string' && raw.url.startsWith('/') && !raw.url.startsWith('//')
          ? raw.url
          : fallback.url,
      tag: typeof raw?.tag === 'string' ? raw.tag : fallback.tag,
    };
  } catch {
    return fallback;
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event.data);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data as { url?: string } | null)?.url ?? '/';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate(target);
        await existing.focus();
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
