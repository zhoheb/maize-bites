import type { Audience } from '@maize-bites/shared';
import type { ReactNode } from 'react';
import { AUDIENCE_LABELS } from '../lib/labels';

const TONES = {
  maize: 'bg-maize text-michigan-blue',
  blue: 'bg-michigan-blue/10 text-michigan-blue',
  slate: 'bg-slate-100 text-slate-700',
  warn: 'bg-amber-100 text-amber-900',
} as const;

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const AUDIENCE_TONE: Record<Audience, keyof typeof TONES> = {
  open: 'maize',
  members: 'slate',
  rsvp: 'blue',
};

export function AudienceBadge({ audience }: { audience: Audience | null }) {
  if (audience === null) return null;
  return <Badge tone={AUDIENCE_TONE[audience]}>{AUDIENCE_LABELS[audience]}</Badge>;
}
