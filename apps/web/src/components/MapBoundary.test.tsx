import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapBoundary } from './MapBoundary';

function BrokenMap(): never {
  throw new Error('WebGL2 is required to display this map.');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MapBoundary', () => {
  it('shows a note instead of the map when it fails, and leaves the rest of the page alone', () => {
    // React logs the caught error; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <main>
        <ul aria-label="Events">
          <li>Pizza at the Dude</li>
        </ul>
        <MapBoundary>
          <BrokenMap />
        </MapBoundary>
      </main>,
    );

    expect(screen.getByRole('status').textContent).toContain(
      "The map can't be shown in this browser.",
    );
    expect(screen.getByText('Pizza at the Dude')).toBeTruthy();
  });

  it('renders the map when nothing goes wrong', () => {
    render(
      <MapBoundary>
        <div>map</div>
      </MapBoundary>,
    );
    expect(screen.getByText('map')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
