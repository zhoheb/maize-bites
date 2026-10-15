import type { EventDetail } from '@maize-bites/shared';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SIGNED_OUT, mockApi, renderApp } from '../test/api-mock';
import { makeDetail } from '../test/fixtures';
import { EventDetails } from './EventDetails';

afterEach(() => {
  vi.unstubAllGlobals();
});

const show = async (overrides: Partial<EventDetail>) => {
  const event = makeDetail(overrides);
  mockApi({ 'GET /api/me': SIGNED_OUT, [`GET /api/events/${event.id}`]: event });
  renderApp(<EventDetails id={event.id} titleId="t" />);
  const heading = await screen.findByRole('heading', { name: "Who it's for" });
  return heading.parentElement?.textContent ?? '';
};

describe("event details: who it's for", () => {
  it('open: says so and quotes the listing', async () => {
    const text = await show({ audience: 'open', audienceEvidence: 'all students welcome' });
    expect(text).toContain('Open to everyone.');
    expect(text).toContain('Listing says: “all students welcome”');
  });

  it('members: explains and quotes the listing', async () => {
    const text = await show({ audience: 'members', audienceEvidence: 'for members only' });
    expect(text).toContain('Only for a specific group');
    expect(text).toContain('Listing says: “for members only”');
  });

  it('rsvp: explains and quotes the listing', async () => {
    const text = await show({ audience: 'rsvp', audienceEvidence: 'RSVP by Friday' });
    expect(text).toContain('You need to RSVP or register first.');
    expect(text).toContain('Listing says: “RSVP by Friday”');
  });

  it("a reviewer's verdict is labeled as ours, not the listing's", async () => {
    const text = await show({
      audience: 'open',
      audienceEvidence: 'Asked the host',
      classification: {
        method: 'manual',
        confidence: 1,
        evidence: null,
        classifiedAt: '2026-10-01T15:00:00.000Z',
      },
    });
    expect(text).toContain('Our review: “Asked the host”');
  });

  it('unknown: says the listing is silent and links to it in a new tab', async () => {
    const text = await show({ audience: 'unknown', audienceEvidence: null });
    expect(text).toContain("The listing doesn't say who can attend.");
    expect(text).not.toContain('Open to everyone');
    const link = screen.getByRole('link', { name: /Check the event listing before you go/ });
    expect(link.getAttribute('href')).toBe('https://events.umich.edu/event/1');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('unknown without a listing link: asks people to check with the host', async () => {
    const text = await show({ audience: 'unknown', audienceEvidence: null, url: null });
    expect(text).toContain('Check with the host before you go.');
  });
});
