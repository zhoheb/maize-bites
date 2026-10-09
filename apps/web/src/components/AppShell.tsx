import { NavLink, Outlet } from 'react-router';
import { useMe } from '../api/account';

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-maize',
    isActive ? 'bg-white/10 text-maize' : 'text-white/90 hover:text-white',
  ].join(' ');

export function AppShell() {
  const me = useMe();
  const signedIn = me.isSuccess && me.data !== null;
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-maize px-4 py-2 font-semibold text-michigan-blue focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="bg-michigan-blue">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <NavLink
            to="/"
            className="flex items-center gap-2 rounded-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-maize"
          >
            <img src="/icons/favicon.svg" alt="" width="32" height="32" className="size-8" />
            <span className="text-lg font-extrabold tracking-tight text-maize">Maize Bites</span>
          </NavLink>
          <nav aria-label="Main">
            <ul className="flex items-center gap-1">
              <li>
                <NavLink to="/" end className={navClass}>
                  Free food
                </NavLink>
              </li>
              <li>
                <NavLink to="/alerts" className={navClass}>
                  Alerts
                </NavLink>
              </li>
              <li>
                <NavLink to="/about" className={navClass}>
                  About
                </NavLink>
              </li>
              {!signedIn && me.isSuccess && (
                <li className="hidden sm:block">
                  <NavLink to="/sign-in" className={navClass}>
                    Sign in
                  </NavLink>
                </li>
              )}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-slate-600">
          Event data from Happening @ Michigan and Maize Pages. Not affiliated with the University
          of Michigan.
        </div>
      </footer>
    </div>
  );
}
