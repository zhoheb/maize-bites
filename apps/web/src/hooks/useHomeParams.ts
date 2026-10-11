import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { parseFilters, parseTab, withFilters, type Filters, type Tab } from '../lib/filters';

/** On phones: the map with the list in a sheet over it (default), or the list alone. */
export type View = 'map' | 'list';

function setOrDelete(params: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === null) next.delete(key);
  else next.set(key, value);
  return next;
}

/** Home page state, read from and written to the URL. */
export function useHomeParams() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const view: View = params.get('view') === 'list' ? 'list' : 'map';

  const update = useCallback(
    (change: (prev: URLSearchParams) => URLSearchParams, push = false) => {
      setParams(change, { replace: !push });
    },
    [setParams],
  );

  return {
    params,
    filters,
    tab: parseTab(params),
    search: params.get('q') ?? '',
    selectedId: params.get('event'),
    view,
    setFilters: useCallback(
      (f: Filters) => {
        update((prev) => withFilters(prev, f));
      },
      [update],
    ),
    setSearch: useCallback(
      (q: string) => {
        update((prev) => setOrDelete(prev, 'q', q === '' ? null : q));
      },
      [update],
    ),
    /** Tabs push history so Back returns to the previous tab. */
    setTab: useCallback(
      (t: Tab) => {
        update((prev) => setOrDelete(prev, 'tab', t === 'now' ? null : t), true);
      },
      [update],
    ),
    setView: useCallback(
      (v: View) => {
        update((prev) => setOrDelete(prev, 'view', v === 'map' ? null : v));
      },
      [update],
    ),
    /** Opening pushes a history entry so Back closes the drawer. */
    select: useCallback(
      (id: string | null) => {
        update((prev) => setOrDelete(prev, 'event', id), id !== null);
      },
      [update],
    ),
  };
}

/** Link target that opens an event in the Home drawer, keeping the current tab and filters. */
export function eventHref(params: URLSearchParams, id: string): string {
  return `/?${setOrDelete(params, 'event', id).toString()}`;
}

/** Link target for another tab, keeping filters. */
export function tabHref(params: URLSearchParams, tab: Tab): string {
  const next = setOrDelete(setOrDelete(params, 'event', null), 'tab', tab === 'now' ? null : tab);
  const search = next.toString();
  return search ? `/?${search}` : '/';
}
