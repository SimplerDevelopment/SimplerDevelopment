'use client';

/**
 * PUX-173 (design doc screen 32): proposals in the list idiom — Title (with
 * the sent → viewed → signed timeline folded under it), Contact, Company,
 * Value, Status, Sent, Views. Typed structurally over the list route's
 * fields so it doesn't depend on the page's own Proposal interface.
 * Studio-only; the caller gates on the flag.
 */

import StudioTable, { type StudioColumn } from '@/components/portal/StudioTable';
import ProposalTimeline from '@/components/portal/crm/ProposalTimeline';
import { formatMoney } from '@/lib/utils/money';
import type { ProposalTimelineInput } from '@/lib/crm/proposal-timeline';

export interface ProposalRow extends ProposalTimelineInput {
  id: number;
  title: string;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactName?: string | null;
  companyName?: string | null;
  currency?: string | null;
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary/10 text-primary',
  viewed: 'bg-[var(--studio-gold-surface)] text-[var(--studio-gold-ink)]',
  accepted: 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]',
  declined: 'bg-destructive/10 text-destructive',
  expired: 'bg-muted text-muted-foreground',
};

const day = (at: string | null | undefined) => at ? new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

export default function ProposalsStudioTable<P extends ProposalRow>({
  proposals, valueOf, onOpen,
}: {
  proposals: P[];
  /** The page's own computeValue(lineItems, fees) — cents. */
  valueOf: (p: P) => number;
  onOpen: (p: P) => void;
}) {
  const columns: StudioColumn<P>[] = [
    { key: 'title', label: 'Title', render: (p) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{p.title}</p>
        {p.status !== 'draft' && <ProposalTimeline proposal={p} summary={`${p.viewCount ?? 0} ${p.viewCount === 1 ? 'view' : 'views'} · story`} />}
      </div>
    ) },
    { key: 'contact', label: 'Contact', className: 'hidden md:table-cell text-muted-foreground', render: (p) => p.contactName ?? ([p.contactFirstName, p.contactLastName].filter(Boolean).join(' ') || '—') },
    { key: 'company', label: 'Company', className: 'hidden lg:table-cell text-muted-foreground', render: (p) => p.companyName ?? '—' },
    { key: 'value', label: 'Value', align: 'right', render: (p) => formatMoney(valueOf(p)) },
    { key: 'status', label: 'Status', render: (p) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_TONE[p.status] ?? 'bg-muted text-muted-foreground'}`}>{p.status}</span> },
    { key: 'sent', label: 'Sent', className: 'hidden lg:table-cell text-muted-foreground', render: (p) => day(p.sentAt) },
    { key: 'views', label: 'Views', align: 'right', render: (p) => p.viewCount ?? 0 },
  ];
  return (
    <StudioTable
      columns={columns}
      rows={proposals}
      rowKey={(p) => p.id}
      onRowClick={onOpen}
      footer={`${proposals.length} ${proposals.length === 1 ? 'proposal' : 'proposals'}`}
    />
  );
}
