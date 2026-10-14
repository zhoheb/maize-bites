import { useEffect } from 'react';
import { useLocation } from 'react-router';
import {
  externalReferrer,
  pageKey,
  pageViewFor,
  prefersNoTracking,
  sendPageView,
} from '../lib/analytics';

// Module state, not a ref: StrictMode runs effects twice, and a page shown twice is one view.
let lastKey: string | null = null;
let firstView = true;

/** Sends one page view beacon per page shown, including client-side route changes. */
export function usePageViews(): void {
  const { pathname, search } = useLocation();
  const key = pageKey(pathname, search);
  useEffect(() => {
    if (key === lastKey) return;
    lastKey = key;
    if (prefersNoTracking(navigator)) return;
    // Only the page a visit lands on has a meaningful referrer; later ones are in-app.
    const referrer = firstView
      ? externalReferrer(document.referrer, window.location.hostname)
      : null;
    firstView = false;
    const view = pageViewFor({ pathname, search }, referrer, window.innerWidth);
    if (view) sendPageView(view);
    // `search` is read for the path sent, but only `key` decides whether this is a new page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
