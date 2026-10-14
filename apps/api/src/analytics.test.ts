import type { DayAggregate } from '@maize-bites/db';
import { addDays } from '@maize-bites/shared';
import { describe, expect, it } from 'vitest';
import { BOT_USER_AGENT, analyticsWindow, buildAnalyticsResponse, visitorId } from './analytics.js';

const TODAY = '2026-10-14';
const dayWith = (offset: number, uniqueVisitors: number): DayAggregate => ({
  day: addDays(TODAY, -offset),
  uniqueVisitors,
  pageViews: uniqueVisitors * 2,
  signedInVisitors: 0,
  eventVisitors: 0,
  mobileShare: 0.5,
  topPaths: [{ name: '/', views: uniqueVisitors * 2 }],
  topReferrers: [],
});

describe('buildAnalyticsResponse', () => {
  it('compares each tile with the period before it', () => {
    // 10 a day for the last 30 full days, 5 a day for the 30 before; today 3, yesterday 10.
    const days = [dayWith(0, 3)];
    for (let i = 1; i <= 30; i++) days.push(dayWith(i, 10));
    for (let i = 31; i <= 60; i++) days.push(dayWith(i, 5));
    const body = buildAnalyticsResponse({
      range: '30d',
      today: TODAY,
      days,
      signups: new Map([[TODAY, 2]]),
      excludeSelf: true,
    });
    expect(body.tiles).toEqual({
      today: { value: 3, previous: 10 },
      yesterday: { value: 10, previous: 10 },
      weekAverage: { value: 10, previous: 10 },
      last30: { value: 300, previous: 150 },
    });
    expect(body.series).toHaveLength(30);
    expect(body.series[0]?.day).toBe(addDays(TODAY, -29));
    expect(body.series.at(-1)).toMatchObject({ day: TODAY, uniqueVisitors: 3, alertSignups: 2 });
    expect(body.mobileShare).toBe(0.5);
  });

  it('fills missing days with zeros and has no device split without data', () => {
    const body = buildAnalyticsResponse({
      range: '90d',
      today: TODAY,
      days: [],
      signups: new Map(),
      excludeSelf: false,
    });
    expect(body.series).toHaveLength(90);
    expect(body.series.every((d) => d.uniqueVisitors === 0)).toBe(true);
    expect(body.mobileShare).toBeNull();
  });
});

describe('analyticsWindow', () => {
  it('reads far enough back for the 30-day comparison', () => {
    expect(analyticsWindow('30d', TODAY)).toEqual({ from: addDays(TODAY, -60), to: TODAY });
    expect(analyticsWindow('90d', TODAY)).toEqual({ from: addDays(TODAY, -89), to: TODAY });
  });
});

describe('visitorId', () => {
  it('depends on every input', () => {
    const base = visitorId('s', '1.2.3.4', 'ua', 'site');
    expect(visitorId('s2', '1.2.3.4', 'ua', 'site')).not.toBe(base);
    expect(visitorId('s', '1.2.3.5', 'ua', 'site')).not.toBe(base);
    expect(visitorId('s', '1.2.3.4', 'ua2', 'site')).not.toBe(base);
    expect(visitorId('s', '1.2.3.4', 'ua', 'site2')).not.toBe(base);
  });
});

describe('BOT_USER_AGENT', () => {
  it('lets ordinary browsers through', () => {
    for (const ua of [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    ]) {
      expect(BOT_USER_AGENT.test(ua)).toBe(false);
    }
  });
  it('catches common crawlers and tools', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'facebookexternalhit/1.1',
      'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
      'TelegramBot (like TwitterBot)',
      'python-requests/2.32.3',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2)',
    ]) {
      expect(BOT_USER_AGENT.test(ua)).toBe(true);
    }
  });
});
