import { Component, type ReactNode } from 'react';

/**
 * Keeps a map that can't start from taking the page down with it. MapLibre throws while
 * mounting when the browser has no WebGL2 (old hardware, some privacy settings, remote
 * desktops), and an uncaught render error unmounts the whole app. The list still works
 * without the map, so show a note in its place.
 */
export class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="status"
        className="flex h-full items-center justify-center border border-dashed border-line-strong bg-surface px-6 text-center"
      >
        <p className="text-sm text-ink-2">
          <span className="block font-semibold text-ink">
            The map can't be shown in this browser.
          </span>
          Every event is still in the list, with its building and room.
        </p>
      </div>
    );
  }
}
