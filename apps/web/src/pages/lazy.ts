import { lazy } from 'react';

// Home is the page nearly everyone lands on, so it ships in the first bundle. The rest load
// when visited.
export const AboutPage = lazy(() => import('./AboutPage').then((m) => ({ default: m.AboutPage })));
export const AdminPage = lazy(() => import('./AdminPage').then((m) => ({ default: m.AdminPage })));
export const AlertsPage = lazy(() =>
  import('./AlertsPage').then((m) => ({ default: m.AlertsPage })),
);
export const EventPage = lazy(() => import('./EventPage').then((m) => ({ default: m.EventPage })));
export const NotFoundPage = lazy(() =>
  import('./NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);
export const SignInPage = lazy(() =>
  import('./SignInPage').then((m) => ({ default: m.SignInPage })),
);
export const SubmitPage = lazy(() =>
  import('./SubmitPage').then((m) => ({ default: m.SubmitPage })),
);
export const VerifyPage = lazy(() =>
  import('./VerifyPage').then((m) => ({ default: m.VerifyPage })),
);
