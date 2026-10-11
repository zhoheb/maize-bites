import { beforeEach, describe, expect, it } from 'vitest';
import { makeEvent } from '../test/fixtures';
import { NO_FILTERS } from './filters';
import { loadList, saveList } from './offline-cache';

const NOW = new Date('2026-10-01T16:00:00Z');

beforeEach(() => {
  localStorage.clear();
});

describe('offline list cache', () => {
  it('returns the list saved for the same tab and filters, with when it was saved', () => {
    saveList('now', NO_FILTERS, [makeEvent()], NOW);
    expect(loadList('now', NO_FILTERS)).toEqual({ savedAt: NOW, events: [makeEvent()] });
  });

  it('keeps one list per tab', () => {
    saveList('now', NO_FILTERS, [makeEvent()], NOW);
    saveList('week', NO_FILTERS, [], NOW);
    expect(loadList('now', NO_FILTERS)?.events).toHaveLength(1);
    expect(loadList('week', NO_FILTERS)?.events).toHaveLength(0);
    expect(loadList('today', NO_FILTERS)).toBeNull();
  });

  it('does not offer a list saved under different filters', () => {
    saveList('now', NO_FILTERS, [makeEvent()], NOW);
    expect(loadList('now', { ...NO_FILTERS, openOnly: true })).toBeNull();
  });

  it('ignores stored data that is not a valid list', () => {
    localStorage.setItem('mb-last-lists', '{"now":{"savedAt":"yesterday","events":[{}]}}');
    expect(loadList('now', NO_FILTERS)).toBeNull();
    localStorage.setItem('mb-last-lists', 'not json');
    expect(loadList('now', NO_FILTERS)).toBeNull();
  });
});
