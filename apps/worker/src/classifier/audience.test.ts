import type { Audience } from '@maize-bites/shared';
import { describe, expect, it } from 'vitest';
import { detectAudience, evidenceAround } from './audience.js';

const detect = (title: string, description: string | null = null) =>
  detectAudience({ title, description });

describe('detectAudience', () => {
  // [title, description, audience, evidence]
  it.each<[string, string | null, Audience, string | null]>([
    // ── open: only an explicit statement ──────────────────────────────────────────────────
    ['Fall social', 'Pizza and games. Open to all!', 'open', 'Open to all'],
    [
      'Lecture',
      'Free and open to the public. Reception to follow.',
      'open',
      'Free and open to the public',
    ],
    [
      'Study break',
      'All students welcome — cookies provided',
      'open',
      'All students welcome — cookies provided',
    ],
    [
      'Open mic',
      'Everyone is welcome to perform or watch',
      'open',
      'Everyone is welcome to perform or watch',
    ],
    [
      'Drop-in lunch',
      'No registration required, just stop by',
      'open',
      'No registration required, just stop by',
    ],
    [
      'Book club',
      'All are welcome, no reading needed',
      'open',
      'All are welcome, no reading needed',
    ],
    // "open to all U-M students" is everyone this site serves.
    ['Career fair', 'Open to all U-M students', 'open', 'Open to all U-M students'],
    [
      'Chapter meeting',
      'Members and non-members are welcome',
      'open',
      'Members and non-members are welcome',
    ],
    // ── unknown: no statement either way ──────────────────────────────────────────────────
    ['Pizza social', 'Join us for pizza and board games!', 'unknown', null],
    ['Seminar', null, 'unknown', null],
    // "Open house" names the event; it says nothing about who may come.
    ['Department open house', 'Tour the labs. Refreshments served.', 'unknown', null],
    ['Open House at the Ross School', 'Coffee and bagels', 'unknown', null],
    // Decision: "members and friends welcome" neither restricts to members nor opens the door
    // to anyone, so it is unknown and people check the listing.
    ['Spring picnic', 'Members and friends welcome', 'unknown', null],
    ['Talk', 'Members of the community may find this interesting', 'unknown', null],
    // "no tickets required" isn't an RSVP, and isn't a statement that anyone may come either.
    ['Concert', 'Free - no tickets required', 'unknown', null],
    ['Workshop', 'No RSVP needed. Snacks provided.', 'unknown', null],
    // ── members ───────────────────────────────────────────────────────────────────────────
    ['SWE GBM', 'Free dinner for members only', 'members', 'Free dinner for members only'],
    ['Lab lunch', 'Lunch for lab members', 'members', 'Lunch for lab members'],
    ['Gala', 'This is an invite-only event.', 'members', 'This is an invite-only event'],
    ['Retreat', 'Attendance by invitation', 'members', 'Attendance by invitation'],
    [
      'Info session',
      'For Ross BBA students only. Lunch provided.',
      'members',
      'For Ross BBA students only',
    ],
    ['Appreciation lunch', 'Staff only', 'members', 'Staff only'],
    ['Holiday party', 'Employees only, please', 'members', 'Employees only, please'],
    [
      'Mixer',
      'Free for members, $5 for non-members',
      'members',
      'Free for members, $5 for non-members',
    ],
    ['Social', 'Open to all SWE members', 'members', 'Open to all SWE members'],
    [
      'Town hall',
      'Open to all engineering students',
      'members',
      'Open to all engineering students',
    ],
    // ── rsvp ──────────────────────────────────────────────────────────────────────────────
    [
      'Panel',
      'Lunch provided. RSVP by Friday at the link below.',
      'rsvp',
      'RSVP by Friday at the link',
    ],
    ['Workshop', 'Please register here: bit.ly/x', 'rsvp', 'Please register here: bit.ly/x'],
    ['Networking', 'Pre-register to save your seat', 'rsvp', 'Pre-register to save your seat'],
    ['Dinner', 'Registration required', 'rsvp', 'Registration required'],
    ['Gala', 'Get tickets on Eventbrite', 'rsvp', 'Get tickets on Eventbrite'],
    ['Hack night', 'Sign up on the form', 'rsvp', 'Sign up on the form'],
    // ── priority: members > rsvp > open ───────────────────────────────────────────────────
    ['Talk', 'Open to the public; RSVP required', 'rsvp', 'RSVP required'],
    ['Chapter dinner', 'Members only. Register for free pizza.', 'members', 'Members only'],
    [
      'Social',
      'All are welcome! Sign up so we order enough pizza.',
      'rsvp',
      'Sign up so we order enough pizza',
    ],
    // A restriction and an "open to all" in one listing: the restriction wins.
    ['Retreat', 'Open to all who were invited. Invitation only.', 'members', 'Invitation only'],
  ])('%s / %s → %s', (title, description, audience, evidence) => {
    expect(detect(title, description)).toEqual({ audience, evidence });
  });

  it('reads the title too', () => {
    expect(detect('Members-only pizza night', 'Pizza at 7')).toEqual({
      audience: 'members',
      evidence: 'Members-only pizza night',
    });
  });

  it('never claims open from silence, whatever else the listing says', () => {
    for (const description of [
      'Free pizza!',
      'Come hang out with us',
      'Bring a friend',
      'Located in the Michigan Union',
    ])
      expect(detect('Event', description).audience).toBe('unknown');
  });

  it('copies its evidence from the listing', () => {
    const description = 'Pizza and   games.\nThis event is open to the public and kid friendly.';
    const { evidence } = detect('Fall social', description);
    expect(evidence).toBe('This event is open to the public and kid friendly');
    const flat = description.replace(/\s+/g, ' ').toLowerCase();
    expect(flat).toContain(evidence?.toLowerCase());
  });
});

describe('evidenceAround', () => {
  it('keeps a few words on each side, within the sentence', () => {
    const text = 'Doors at six. Snacks and drinks for members only while supplies last today. Bye';
    const index = text.indexOf('for members');
    expect(evidenceAround(text, { index, end: index + 'for members'.length }, 3)).toBe(
      'Snacks and drinks for members only while supplies',
    );
  });
});
