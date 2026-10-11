import { Maximize2 } from 'lucide-react';
import { Link } from 'react-router';
import { eventUrl } from '../lib/format';
import { EventDetails } from './EventDetails';
import { ShareButton } from './ShareButton';
import { buttonClass } from './ui/button-class';
import { Drawer } from './ui/Drawer';

/** Event details over the Home page: a right-side drawer, or a full-height sheet on phones. */
export function EventDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <Drawer
      title="Event details"
      onClose={onClose}
      actions={
        <>
          <ShareButton title="Free food on Maize Bites" url={eventUrl(id)} />
          <Link
            to={`/events/${id}`}
            className={buttonClass({ variant: 'ghost', size: 'sm' }, 'mr-auto')}
          >
            <Maximize2 aria-hidden="true" className="size-4" />
            Full page
          </Link>
        </>
      }
    >
      <EventDetails id={id} titleId="drawer-title" />
    </Drawer>
  );
}
