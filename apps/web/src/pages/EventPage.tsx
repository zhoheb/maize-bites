import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { EventDetails } from '../components/EventDetails';
import { ShareButton } from '../components/ShareButton';
import { eventUrl } from '../lib/format';
import { buttonClass } from '../components/ui/button-class';

export function EventPage() {
  const { id = '' } = useParams();
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between">
        <Link to="/" className={buttonClass({ variant: 'ghost', size: 'sm' }, '-ml-3')}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          All free food
        </Link>
        <ShareButton title="Free food on Maize Bites" url={eventUrl(id)} />
      </div>
      <div className="mt-3 rounded-card border border-line bg-card p-5 shadow-card sm:p-7">
        <EventDetails id={id} titleId="event-title" headingLevel={1} />
      </div>
    </div>
  );
}
