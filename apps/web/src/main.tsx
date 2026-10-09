import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { shouldRetry } from './api/queries';
import { AppShell } from './components/AppShell';
import { AboutPage } from './pages/AboutPage';
import { AdminPage } from './pages/AdminPage';
import { AlertsPage } from './pages/AlertsPage';
import { EventPage } from './pages/EventPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SignInPage } from './pages/SignInPage';
import { SubmitPage } from './pages/SubmitPage';
import { VerifyPage } from './pages/VerifyPage';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: shouldRetry } },
});

registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="events/:id" element={<EventPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="submit" element={<SubmitPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="sign-in" element={<SignInPage />} />
            <Route path="auth/verify" element={<VerifyPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
