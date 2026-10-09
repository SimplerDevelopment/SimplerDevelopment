'use client';

/**
 * PUX-174 (design doc screen 33): campaigns in the list idiom — open and
 * click as bars you can scan, a scheduled campaign's real send time beside
 * its pill. Studio-only; the page gates on useFeatureFlag('portal-redesign').
 */

import Link from 'next/link';
import StudioTable, { type StudioColumn } from '@/components/portal/StudioTable';
import { rate, scheduledLabel } from '@/lib/email/campaign-rates';

export interface CampaignRow {
  id: number;
  name: string;
  subject: string;
  status: string;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  scheduledAt?: string | null;
  listName: string | null;
}

const PILL: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-primary/10 text-primary',
  sending: 'bg-[var(--portal-warn-bg)] text-[var(--portal-warn)]',
  sent: 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]',
  cancelled: 'bg-destructive/10 text-destructive',
  ab_testing: 'bg-[var(--studio-gold-surface)] text-[var(--studio-gold-ink)]',
};

function Bar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} /></span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  );
}

export default function CampaignsStudioTable<C extends CampaignRow>({ campaigns, onOpen, onDelete }: { campaigns: C[]; onOpen: (c: C) => void; onDelete?: (c: C) => void }) {
  const columns: StudioColumn<C>[] = [
    { key: 'campaign', label: 'Campaign', render: (c) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{c.name}</p>
        <p className="truncate text-xs text-muted-foreground">{c.subject}</p>
      </div>
    ) },
    { key: 'list', label: 'List', className: 'hidden md:table-cell text-muted-foreground', render: (c) => c.listName ?? '—' },
    { key: 'status', label: 'Status', render: (c) => {
      const when = c.status === 'scheduled' ? scheduledLabel(c.scheduledAt) : null;
      return (
        <span className="inline-flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PILL[c.status] ?? 'bg-muted text-muted-foreground'}`}>{c.status.replace('_', ' ')}</span>
          {when && <span className="text-xs text-muted-foreground">{when}</span>}
        </span>
      );
    } },
    { key: 'open', label: 'Open', align: 'right', render: (c) => <Bar pct={c.status === 'sent' ? rate(c.totalOpened, c.totalSent) : null} /> },
    { key: 'click', label: 'Click', align: 'right', render: (c) => <Bar pct={c.status === 'sent' ? rate(c.totalClicked, c.totalSent) : null} /> },
    ...(onDelete ? [{ key: 'actions', label: '', align: 'right' as const, render: (c: C) => (c.status === 'draft' || c.status === 'scheduled')
      ? <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(c); }} aria-label={`Delete ${c.name}`} className="material-icons text-base text-muted-foreground/60 hover:text-destructive">delete</button>
      : null }] : []),
  ];
  return (
    <StudioTable
      columns={columns}
      rows={campaigns}
      rowKey={(c) => c.id}
      onRowClick={onOpen}
      footer={<span>{campaigns.length} {campaigns.length === 1 ? 'campaign' : 'campaigns'} · <Link href="/portal/email/campaigns" className="hover:text-foreground">View all</Link></span>}
    />
  );
}
