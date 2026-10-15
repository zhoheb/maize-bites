import type {
  AdminAnalyticsResponse,
  AdminMetricsResponse,
  ReviewQueueResponse,
} from '@maize-bites/shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN, BUILDINGS, SIGNED_IN, mockApi, renderApp } from '../test/api-mock';
import { AdminPage } from './AdminPage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const EVENT_ID = '6f1c1b7e-8d8a-4f3e-9d61-2b3c6f0e9a11';
const TIP_ID = '7a2d2c8f-9e9b-4a4f-8e72-3c4d7a1f0b22';

const queue: ReviewQueueResponse = {
  events: [
    {
      event: {
        id: EVENT_ID,
        source: 'maizepages',
        title: 'Maybe snacks',
        description: null,
        startsAt: '2026-10-01T17:00:00.000Z',
        endsAt: null,
        locationName: 'Michigan Union',
        url: 'https://maizepages.umich.edu/event/1',
      },
      classification: {
        method: 'llm',
        model: 'claude-haiku-4-5',
        hasFreeFood: true,
        confidence: 0.55,
        foodItems: ['snacks'],
        mealType: 'snacks',
        dietary: [],
        audience: 'unknown',
        audienceEvidence: null,
        evidence: 'snacks may be provided',
        createdAt: '2026-10-01T16:00:00.000Z',
      },
      flag: null,
      wrongAudienceReports: 0,
    },
  ],
  submissions: [
    {
      id: TIP_ID,
      title: 'Donuts in the atrium',
      description: 'Two boxes left',
      building: { id: BUILDINGS.buildings[0]?.id ?? '', name: 'Duderstadt Center' },
      locationName: 'Duderstadt Center',
      room: 'Atrium',
      startsAt: '2026-10-01T17:00:00.000Z',
      endsAt: null,
      submittedAt: '2026-10-01T16:30:00.000Z',
      submitter: { email: 'tipster@umich.edu', trustLevel: 2 },
    },
  ],
};

const metrics: AdminMetricsResponse = {
  sources: [
    {
      source: 'happening',
      lastRunAt: '2026-10-01T15:23:00.000Z',
      lastSuccessAt: '2026-09-30T21:48:00.000Z',
      lastError: 'fetch failed: HTTP 403 (blocked by a Cloudflare challenge)',
      recentRuns: 5,
      recentComplete: 1,
    },
    {
      source: 'maizepages',
      lastRunAt: '2026-10-01T15:23:00.000Z',
      lastSuccessAt: '2026-10-01T15:23:05.000Z',
      lastError: null,
      recentRuns: 2,
      recentComplete: 2,
    },
  ],
  runs: [],
  classifier: {
    window: { from: '2026-09-24T16:00:00.000Z', to: '2026-10-15T16:00:00.000Z' },
    events: 60,
    outcomes: {
      published: 12,
      review: 1,
      rejected_rules: 40,
      rejected_llm: 5,
      hidden_by_admin: 1,
      pending_llm: 1,
      unclassified: 0,
    },
    llmClassifications: 18,
    alerts: { sent: 7, failed: 1 },
  },
  locationMisses: [
    {
      id: '8b3e3d9a-0f0c-4b5a-9f83-4d5e8b2a1c33',
      locationName: 'East Hall',
      normalizedName: 'east hall',
      seenCount: 7,
      lastSeenAt: '2026-10-01T15:23:00.000Z',
    },
  ],
};

const analytics: AdminAnalyticsResponse = {
  range: '30d',
  today: '2026-10-14',
  tiles: {
    today: { value: 42, previous: 40 },
    yesterday: { value: 40, previous: 50 },
    weekAverage: { value: 38.4, previous: 38.4 },
    last30: { value: 1200, previous: 0 },
  },
  series: Array.from({ length: 30 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 8, 15 + i)).toISOString().slice(0, 10),
    uniqueVisitors: 30 + i,
    pageViews: 60 + 2 * i,
    signedInVisitors: 2,
    eventVisitors: 10,
    alertSignups: i === 29 ? 3 : 0,
  })),
  topPages: [
    { name: '/', views: 900 },
    { name: '/events/:id', views: 300 },
  ],
  topReferrers: [{ name: 'reddit.com', views: 120 }],
  mobileShare: 0.62,
  excludeSelf: true,
};

const routes = (extra: Parameters<typeof mockApi>[0] = {}) =>
  mockApi({
    'GET /api/me': ADMIN,
    'GET /api/admin/analytics': analytics,
    'GET /api/admin/review-queue': queue,
    'GET /api/admin/metrics': metrics,
    'GET /api/buildings': BUILDINGS,
    ...extra,
  });

describe('AdminPage', () => {
  it('turns away someone who is not an admin without calling the admin API', async () => {
    const api = mockApi({ 'GET /api/me': SIGNED_IN });
    renderApp(<AdminPage />);

    expect(await screen.findByText('Admins only')).toBeTruthy();
    expect(api.calls.map((c) => c.key)).toEqual(['GET /api/me']);
  });

  it('shows visitor tiles, the chart, top pages and referrers, and toggles self-exclusion', async () => {
    const api = routes({
      'PUT /api/admin/analytics/settings': (body: unknown) => ({ body }),
    });
    const { user } = renderApp(<AdminPage />);

    const panel = await screen.findByRole('region', { name: 'Visitors' });
    const today = (await within(panel).findByText('Today')).parentElement;
    expect(today?.textContent).toContain('42');
    expect(today?.textContent).toContain('+5% vs yesterday');
    expect(within(panel).getByText(/−20%/)).toBeTruthy(); // yesterday vs the day before
    expect(within(panel).getByText('new')).toBeTruthy(); // nothing in the 30 before
    expect(
      within(panel).getByRole('img', { name: /Daily unique visitors and page views/ }),
    ).toBeTruthy();
    expect(within(panel).getByText('Event pages')).toBeTruthy();
    expect(within(panel).getByText('reddit.com')).toBeTruthy();
    expect(within(panel).getByText('62%')).toBeTruthy();
    expect(within(panel).getByText('Signed up for alerts')).toBeTruthy();

    await user.click(within(panel).getByRole('switch', { name: 'Leave out my own visits' }));
    await waitFor(() => {
      expect(api.bodiesFor('PUT /api/admin/analytics/settings')).toEqual([{ excludeSelf: false }]);
    });

    await user.click(within(panel).getByRole('radio', { name: '90 days' }));
    await waitFor(() => {
      expect(api.calls.filter((c) => c.key === 'GET /api/admin/analytics').length).toBeGreaterThan(
        1,
      );
    });
  });

  it('shows the review queue, ingestion per source, classifier stats, and location misses', async () => {
    routes();
    renderApp(<AdminPage />);

    const queuePanel = await screen.findByRole('region', { name: 'Review queue' });
    expect(await within(queuePanel).findByText('Donuts in the atrium')).toBeTruthy();
    expect(
      within(queuePanel).getByText(/From tipster@umich\.edu \(2 approved so far\)/),
    ).toBeTruthy();
    expect(within(queuePanel).getByText('Maybe snacks')).toBeTruthy();
    expect(within(queuePanel).getByText('llm 55%')).toBeTruthy();
    expect(within(queuePanel).getByText(/snacks may be provided/)).toBeTruthy();

    const ingestion = await screen.findByRole('region', { name: 'Ingestion' });
    const [happening, maizepages] = within(ingestion).getAllByRole('listitem');
    expect(happening?.textContent).toContain('Happening @ Michigan');
    expect(happening?.textContent).toContain('Failing');
    expect(happening?.textContent).toContain('blocked by a Cloudflare challenge');
    expect(happening?.textContent).toContain('1 of 5 recent runs completed');
    expect(maizepages?.textContent).toContain('Maize Pages');
    expect(maizepages?.textContent).toContain('Healthy');

    const classifier = screen.getByRole('region', { name: 'Classifier' });
    expect(classifier.textContent).toContain('Published12');
    expect(classifier.textContent).toContain('Alerts sent / failed7 / 1');

    expect(screen.getByRole('region', { name: 'Location misses' }).textContent).toContain(
      'East Hall · seen 7×',
    );
  });

  it('approves a tip', async () => {
    const api = routes({
      [`POST /api/admin/submissions/${TIP_ID}`]: { status: 'approved', eventId: EVENT_ID },
    });
    const { user } = renderApp(<AdminPage />);

    await user.click(await screen.findByRole('button', { name: 'Approve Donuts in the atrium' }));

    await waitFor(() => {
      expect(api.bodiesFor(`POST /api/admin/submissions/${TIP_ID}`)).toEqual([
        { action: 'approve' },
      ]);
    });
    // The queue is fetched again after the change.
    await waitFor(() => {
      expect(api.bodiesFor('GET /api/admin/review-queue').length).toBeGreaterThan(1);
    });
  });

  it('hides an event, and shows one with corrected details', async () => {
    const api = routes({
      [`POST /api/admin/events/${EVENT_ID}/override`]: (body) => ({
        status: 201,
        body: { eventId: EVENT_ID, action: (body as { action: string }).action },
      }),
    });
    const { user } = renderApp(<AdminPage />);

    await user.click(await screen.findByRole('button', { name: 'Hide Maybe snacks' }));
    await waitFor(() => {
      expect(api.bodiesFor(`POST /api/admin/events/${EVENT_ID}/override`)).toHaveLength(1);
    });

    await user.click(screen.getByText('Edit details'));
    const food = screen.getByLabelText('Food (comma-separated)');
    await user.clear(food);
    await user.type(food, 'granola bars, fruit');
    await user.selectOptions(screen.getByLabelText('Who can come'), 'open');
    await user.type(
      screen.getByLabelText("Audience evidence (the listing's words, or how you know)"),
      'Host confirmed anyone can come',
    );
    await user.click(screen.getByRole('button', { name: 'Show Maybe snacks' }));

    await waitFor(() => {
      expect(api.bodiesFor(`POST /api/admin/events/${EVENT_ID}/override`)).toEqual([
        // The audience is left out unless the reviewer changes it.
        { action: 'hide', foodItems: ['snacks'], mealType: 'snacks' },
        {
          action: 'show',
          foodItems: ['granola bars', 'fruit'],
          mealType: 'snacks',
          audience: 'open',
          audienceNote: 'Host confirmed anyone can come',
        },
      ]);
    });
  });

  it('adds a missed location as a building alias', async () => {
    const union = BUILDINGS.buildings[2];
    const api = routes({
      [`POST /api/admin/buildings/${union?.id ?? ''}/aliases`]: () => ({
        status: 201,
        body: { ...union, aliases: ['Union', 'East Hall'] },
      }),
    });
    const { user } = renderApp(<AdminPage />);

    await user.selectOptions(
      await screen.findByLabelText('Building for East Hall'),
      'Michigan Union',
    );
    await user.click(screen.getByRole('button', { name: 'Add alias' }));

    expect(await screen.findByRole('button', { name: 'Added' })).toBeTruthy();
    expect(api.bodiesFor(`POST /api/admin/buildings/${union?.id ?? ''}/aliases`)).toEqual([
      { alias: 'East Hall' },
    ]);
  });
});
