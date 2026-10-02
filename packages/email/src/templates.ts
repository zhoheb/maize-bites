import { CAMPUS_TIME_ZONE, type FoodEvent } from '@maize-bites/shared';
import type { EmailMessage } from './mailer.js';

type Content = Omit<EmailMessage, 'to'>;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const when = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const time = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

export function eventWhen(event: Pick<FoodEvent, 'startsAt' | 'endsAt'>): string {
  const start = when.format(new Date(event.startsAt));
  return event.endsAt ? `${start} – ${time.format(new Date(event.endsAt))}` : start;
}

export function eventWhere(event: Pick<FoodEvent, 'building' | 'room' | 'locationName'>): string {
  const place = event.building?.name ?? event.locationName ?? 'Location not listed';
  return event.room && event.building ? `${place}, ${event.room}` : place;
}

function audienceNote(event: Pick<FoodEvent, 'audience'>): string | null {
  if (event.audience === 'members') return 'Members only';
  if (event.audience === 'rsvp') return 'RSVP required';
  return null;
}

const MAIZE = '#ffcb05';
const BLUE = '#00274c';

function layout(body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="margin:0 0 16px;font-weight:800;font-size:18px;color:${BLUE}"><span style="color:${BLUE};background:${MAIZE};padding:2px 8px;border-radius:6px">Maize Bites</span></p>
${body}
<p style="margin:24px 0 0;font-size:12px;color:#64748b">${footer}</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:${BLUE};color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escapeHtml(label)}</a></p>`;
}

export function magicLinkEmail(url: string): Content {
  return {
    subject: 'Your Maize Bites sign-in link',
    text: `Sign in to Maize Bites:\n\n${url}\n\nThis link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
    html: layout(
      `<h1 style="font-size:20px;margin:0 0 8px">Sign in to Maize Bites</h1>
<p style="margin:0">Tap the button to finish signing in.</p>
${button(url, 'Sign in')}
<p style="margin:0;font-size:14px;color:#475569">This link works once and expires in 15 minutes.</p>`,
      "If you didn't ask for this, you can ignore it. Nobody can sign in without this link.",
    ),
  };
}

function eventBlock(event: FoodEvent, url: string): string {
  const note = audienceNote(event);
  const food = event.foodItems.length > 0 ? event.foodItems.join(', ') : 'Free food';
  return `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:12px 0">
<p style="margin:0;font-weight:700;color:${BLUE}"><a href="${escapeHtml(url)}" style="color:${BLUE}">${escapeHtml(event.title)}</a></p>
<p style="margin:4px 0 0;text-transform:capitalize">${escapeHtml(food)}</p>
<p style="margin:4px 0 0;color:#475569;font-size:14px">${escapeHtml(eventWhen(event))} · ${escapeHtml(eventWhere(event))}</p>
${note ? `<p style="margin:6px 0 0;font-size:13px;font-weight:600;color:#334155">${escapeHtml(note)}</p>` : ''}
</div>`;
}

function eventText(event: FoodEvent, url: string): string {
  const note = audienceNote(event);
  return [
    event.title,
    event.foodItems.length > 0 ? event.foodItems.join(', ') : 'Free food',
    `${eventWhen(event)} · ${eventWhere(event)}`,
    ...(note ? [note] : []),
    url,
  ].join('\n');
}

export interface LinkBuilder {
  event: (id: string) => string;
  /** Alert settings page, for the unsubscribe footer. */
  manage: string;
}

export function instantAlertEmail(event: FoodEvent, links: LinkBuilder): Content {
  const food = event.foodItems[0] ? ` (${event.foodItems.slice(0, 2).join(', ')})` : '';
  return {
    subject: `Free food: ${event.title}${food}`,
    text: `${eventText(event, links.event(event.id))}\n\nChange or stop alerts: ${links.manage}`,
    html: layout(
      `${eventBlock(event, links.event(event.id))}${button(links.event(event.id), 'See details')}`,
      `You're getting this because you turned on Maize Bites alerts. <a href="${escapeHtml(links.manage)}">Change or stop alerts</a>.`,
    ),
  };
}

export function digestEmail(events: FoodEvent[], dateLabel: string, links: LinkBuilder): Content {
  const count = `${events.length} free food event${events.length === 1 ? '' : 's'}`;
  return {
    subject: `Today on campus: ${count}`,
    text: `${count} for ${dateLabel}:\n\n${events.map((e) => eventText(e, links.event(e.id))).join('\n\n')}\n\nChange or stop alerts: ${links.manage}`,
    html: layout(
      `<h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(count)} today</h1>
<p style="margin:0;color:#475569">${escapeHtml(dateLabel)}</p>
${events.map((e) => eventBlock(e, links.event(e.id))).join('')}`,
      `Your Maize Bites morning digest. <a href="${escapeHtml(links.manage)}">Change or stop alerts</a>.`,
    ),
  };
}
