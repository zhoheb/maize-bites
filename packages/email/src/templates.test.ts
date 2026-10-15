import type { FoodEvent } from '@maize-bites/shared';
import { describe, expect, it, vi } from 'vitest';
import { createMailer } from './mailer.js';
import { digestEmail, escapeHtml, instantAlertEmail, magicLinkEmail } from './templates.js';

const event: FoodEvent = {
  id: '6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11',
  source: 'happening',
  title: 'Pizza <b>& boba</b>',
  description: null,
  startsAt: '2026-10-01T16:00:00.000Z',
  endsAt: '2026-10-01T17:30:00.000Z',
  locationName: 'BBB 1670',
  room: '1670',
  building: {
    id: '0b0e8f3a-2c1d-4e5f-8a9b-1c2d3e4f5a6b',
    name: 'Bob and Betty Beyster Building',
    campus: 'north',
  },
  lat: null,
  lng: null,
  url: null,
  sponsor: null,
  foodItems: ['pizza', 'boba'],
  mealType: 'snacks',
  dietary: [],
  audience: 'members',
  audienceEvidence: 'members only',
  likelyGone: false,
};
const links = {
  event: (id: string) => `https://maizebites.app/events/${id}`,
  manage: 'https://maizebites.app/alerts',
};
const normalize = (s: string) => s.replace(/\u202f/g, ' ');

describe('templates', () => {
  it('escapes HTML', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('magic link email contains the link in text and html', () => {
    const m = magicLinkEmail('https://maizebites.app/auth/verify?token=abc');
    expect(m.text).toContain('https://maizebites.app/auth/verify?token=abc');
    expect(m.html).toContain('href="https://maizebites.app/auth/verify?token=abc"');
    expect(m.text).toMatch(/expires in 15 minutes/);
  });

  it('instant alert has event details, Ann Arbor time, audience note, and a manage link', () => {
    const m = instantAlertEmail(event, links);
    expect(m.subject).toBe('Free food: Pizza <b>& boba</b> (pizza, boba)');
    expect(normalize(m.text)).toContain(
      'Thu, Oct 1, 12:00 PM – 1:30 PM · Bob and Betty Beyster Building, 1670',
    );
    expect(m.text).toContain('Members only');
    expect(m.text).toContain('https://maizebites.app/alerts');
    expect(m.html).toContain('Pizza &lt;b&gt;&amp; boba&lt;/b&gt;');
    expect(m.html).not.toContain('<b>&');
  });

  it('digest lists every event', () => {
    const m = digestEmail(
      [event, { ...event, id: 'x', title: 'Bagels' }],
      'Thursday, October 1',
      links,
    );
    expect(m.subject).toBe('Today on campus: 2 free food events');
    expect(m.text).toContain('Bagels');
    expect(m.html.match(/border-radius:12px/g)).toHaveLength(2);
  });
});

describe('createMailer', () => {
  it('logs instead of sending when no API key is configured', async () => {
    const logger = { info: vi.fn() };
    await createMailer({ from: 'x@y.z', logger }).send({
      to: 'a@umich.edu',
      subject: 'Hi',
      text: 'link',
      html: '',
    });
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[email:dev] to=a@umich.edu'));
  });
});
