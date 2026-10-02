import { Link, useParams } from 'react-router';
import { EventDetails } from '../components/EventDetails';

export function EventPage() {
  const { id = '' } = useParams();
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 rounded text-sm font-medium text-michigan-blue underline underline-offset-2 focus-visible:outline-3 focus-visible:outline-michigan-blue"
      >
        <span aria-hidden="true">←</span> All free food
      </Link>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <EventDetails id={id} titleId="event-title" headingLevel={1} />
      </div>
    </div>
  );
}
