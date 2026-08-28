'use client';

/**
 * PUX-171 (design doc screen 30): the pipeline as a table — the same rows the
 * board draws, in the portal's list idiom (StudioTable). Studio-only; the
 * page gates on useFeatureFlag('portal-redesign').
 */

import StudioTable, { type StudioColumn } from '@/components/portal/StudioTable';
import { formatMoney } from '@/lib/utils/money';
import { daysSinceActivity, isStale } from '@/lib/crm/deal-stale';
import type { Deal, Stage } from '../_lib/types';

export default function DealsTable({ deals, stages, onOpenDeal }: { deals: Deal[]; stages: Stage[]; onOpenDeal: (deal: Deal) => void }) {
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const total = deals.reduce((sum, d) => sum + d.value, 0);
  const columns: StudioColumn<Deal>[] = [
    { key: 'deal', label: 'Deal', render: (d) => (
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{d.title}</p>
        {d.companyName && <p className="truncate text-xs text-muted-foreground">{d.companyName}</p>}
      </div>
    ) },
    { key: 'stage', label: 'Stage', className: 'text-muted-foreground', render: (d) => stageName.get(d.stageId) ?? '—' },
    { key: 'value', label: 'Value', align: 'right', render: (d) => formatMoney(d.value) },
    { key: 'owner', label: 'Owner', className: 'hidden md:table-cell text-muted-foreground', render: (d) => d.ownerName ?? '—' },
    { key: 'activity', label: 'Last activity', className: 'hidden lg:table-cell', render: (d) => {
      const days = daysSinceActivity(d);
      return isStale(d)
        ? <span className="rounded-full bg-[var(--portal-warn-bg)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--portal-warn)]">Stalled {days}d</span>
        : <span className="text-muted-foreground">{days === 0 ? 'Today' : `${days}d ago`}</span>;
    } },
    { key: 'close', label: 'Close by', className: 'hidden xl:table-cell text-muted-foreground', render: (d) => d.expectedCloseDate ? new Date(d.expectedCloseDate).toLocaleDateString() : '—' },
  ];
  return (
    <StudioTable
      columns={columns}
      rows={deals}
      rowKey={(d) => d.id}
      onRowClick={onOpenDeal}
      footer={`${deals.length} ${deals.length === 1 ? 'deal' : 'deals'} · ${formatMoney(total)}`}
    />
  );
}
