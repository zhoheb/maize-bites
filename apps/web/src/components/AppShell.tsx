import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Menu, Moon, Sun } from 'lucide-react';
import { Suspense } from 'react';
import { NavLink, Outlet, useMatch } from 'react-router';
import { useMe } from '../api/account';
import { useTheme } from '../hooks/useTheme';
import { Logo } from './Logo';
import { SiteCredit } from './SiteCredit';
import { buttonClass, iconButtonClass } from './ui/button-class';
import { cx } from './ui/cx';

// The current page: ink text with a maize underline sitting on the header's bottom edge.
const navClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'relative flex h-14 items-center px-3 text-sm transition-colors',
    isActive
      ? 'font-semibold text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-maize'
      : 'font-medium text-ink-2 hover:text-ink',
  );

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={iconButtonClass({ variant: 'secondary' })}
    >
      {dark ? (
        <Sun aria-hidden="true" className="size-[1.125rem]" strokeWidth={1.75} />
      ) : (
        <Moon aria-hidden="true" className="size-[1.125rem]" strokeWidth={1.75} />
      )}
    </button>
  );
}

export function AppShell() {
  const me = useMe();
  const signedIn = me.isSuccess && me.data !== null;
  // Home lays itself out to the viewport and shows the credit at the end of its list.
  const isHome = useMatch('/') !== null;
  const links = [
    { to: '/', label: 'Free food', end: true },
    { to: '/alerts', label: 'Alerts' },
    { to: '/submit', label: 'Share' },
    { to: '/about', label: 'About' },
    ...(me.data?.isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <>
      <div className="flex min-h-dvh flex-col bg-page text-ink">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-maize px-4 py-2 font-semibold text-maize-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-30 h-14 border-b border-line bg-panel">
          <div className="flex h-full items-center gap-2 px-4 lg:px-6">
            <NavLink to="/" className="flex items-center gap-2 rounded-full pr-2">
              <Logo className="size-7" />
              <span className="font-display text-lg font-bold tracking-[-0.02em] text-ink">
                Maize Bites
              </span>
            </NavLink>

            <nav aria-label="Main" className="ml-5 hidden md:block">
              <ul className="flex items-center">
                {links.map((link) => (
                  <li key={link.to}>
                    <NavLink to={link.to} end={link.end ?? false} className={navClass}>
                      {link.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              {!signedIn && me.isSuccess && (
                <NavLink
                  to="/sign-in"
                  className={buttonClass(
                    { variant: 'secondary', size: 'sm' },
                    'hidden sm:inline-flex',
                  )}
                >
                  Sign in
                </NavLink>
              )}
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger
                  aria-label="Menu"
                  className={iconButtonClass({ variant: 'secondary' }, 'md:hidden')}
                >
                  <Menu aria-hidden="true" className="size-[1.125rem]" strokeWidth={1.75} />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={6}
                    className="z-50 min-w-48 rounded-card border border-line bg-raised p-1.5 text-ink shadow-lift"
                  >
                    {[
                      ...links,
                      ...(!signedIn && me.isSuccess ? [{ to: '/sign-in', label: 'Sign in' }] : []),
                    ].map((link) => (
                      <DropdownMenu.Item key={link.to} asChild>
                        <NavLink
                          to={link.to}
                          end={'end' in link}
                          className={({ isActive }) =>
                            cx(
                              'flex min-h-11 items-center rounded-lg px-3 text-sm outline-none data-highlighted:bg-sunken',
                              isActive ? 'font-semibold' : 'font-medium',
                            )
                          }
                        >
                          {link.label}
                        </NavLink>
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          {/* Pages other than Home load on demand; hold their place quietly while they do. */}
          <Suspense fallback={<div className="min-h-dvh" />}>
            <Outlet />
          </Suspense>
        </main>
        {!isHome && (
          <footer className="border-t border-line">
            <SiteCredit className="mx-auto max-w-5xl px-4 py-5" />
          </footer>
        )}
      </div>
    </>
  );
}
