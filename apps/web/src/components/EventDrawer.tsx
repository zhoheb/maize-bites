import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { EventDetails } from './EventDetails';

/**
 * Event details over the Home page. A native modal <dialog> gives us focus containment, Esc to
 * close, and focus returning to the card that opened it.
 */
export function EventDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="drawer-title"
      onClose={onClose}
      onClick={(e) => {
        // Clicking the backdrop (the dialog element itself, outside the panel) closes it.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-lg bg-white p-0 shadow-2xl backdrop:bg-michigan-blue/40 sm:rounded-l-2xl"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <Link
            to={`/events/${id}`}
            className="rounded px-2 py-1 text-sm font-medium text-michigan-blue underline underline-offset-2 focus-visible:outline-3 focus-visible:outline-michigan-blue"
          >
            Open full page
          </Link>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close event details"
            className="inline-flex size-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 focus-visible:outline-3 focus-visible:outline-michigan-blue"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5 fill-none stroke-current stroke-2"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <EventDetails id={id} titleId="drawer-title" />
        </div>
      </div>
    </dialog>
  );
}
