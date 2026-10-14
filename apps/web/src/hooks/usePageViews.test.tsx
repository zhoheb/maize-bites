import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePageViews } from './usePageViews';

/** jsdom's Blob has no text(); FileReader works. */
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsText(blob);
  });

function Shell() {
  usePageViews();
  return (
    <nav>
      <Link to="/about">About</Link>
      <Link to="/?tab=week">Week</Link>
      <Link to="/?event=abc">Event</Link>
      <Link to="/admin">Admin</Link>
    </nav>
  );
}

const sendBeacon = vi.fn((_url: string, _body: Blob) => true);
const paths = async () =>
  Promise.all(
    sendBeacon.mock.calls.map(
      async ([, body]) => (JSON.parse(await readBlob(body)) as { path: string }).path,
    ),
  );

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="*" element={<Shell />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sendBeacon.mockClear();
  vi.stubGlobal('navigator', { sendBeacon, doNotTrack: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePageViews', () => {
  it('sends one beacon per page, on route changes too, but not for filters or admin pages', async () => {
    const user = userEvent.setup();
    const view = renderAt('/');
    await user.click(view.getByText('About'));
    await user.click(view.getByText('Week')); // back to Home: a page
    await user.click(view.getByText('Event')); // the drawer: a page
    await user.click(view.getByText('Admin')); // never sent
    expect(await paths()).toEqual(['/', '/about', '/?tab=week', '/?event=abc']);
    view.unmount();
  });

  it('sends nothing with Do Not Track on', () => {
    vi.stubGlobal('navigator', { sendBeacon, doNotTrack: '1' });
    renderAt('/about').unmount();
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
