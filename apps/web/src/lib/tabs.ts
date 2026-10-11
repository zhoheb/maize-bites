import { TABS, type Tab } from './filters';

export const TAB_LABELS: Record<Tab, string> = { now: 'Now', today: 'Today', week: 'This Week' };
export const TAB_OPTIONS = TABS.map((value) => ({ value, label: TAB_LABELS[value] }));
