import type { Tab } from './filters';

export const TAB_LABELS: Record<Tab, string> = { now: 'Now', today: 'Today', week: 'This Week' };
export const tabId = (tab: Tab) => `tab-${tab}`;
export const PANEL_ID = 'events-panel';
