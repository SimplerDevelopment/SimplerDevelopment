'use client';

/**
 * PUX-211 (design doc screen 75): discount codes in the list idiom with
 * "active" as the switch itself instead of a badge you can only change from
 * the edit form. Studio-only; the page gates on the flag.
 */

import StudioTable, { type StudioColumn } from '@/components/portal/StudioTable';
import { formatMoney } from '@/lib/utils/money';

export interface DiscountRow {
  id: number; code: string; discountType: string; amount: number; minOrderAmount?: number | null; maxUses?: number | null; usedCount: number; active: boolean; startsAt?: string | null; expiresAt?: string | null;
}

const amountLabel = (d: DiscountRow) => (d.discountType === 'percentage' ? `${d.amount / 100}%` : formatMoney(d.amount));

export default function DiscountsStudioTable({ rows, onEdit, onToggle, busyId }: { rows: DiscountRow[]; onEdit: (d: DiscountRow) => void; onToggle: (d: DiscountRow) => void; busyId?: number | null }) {
  const columns: StudioColumn<DiscountRow>[] = [
    { key: 'code', label: 'Code', render: (d) => <span className="font-mono font-semibold text-foreground">{d.code}</span> },
    { key: 'amount', label: 'Discount', render: (d) => <span className="tabular-nums">{amountLabel(d)}{d.minOrderAmount ? <span className="text-xs text-muted-foreground"> · min {formatMoney(d.minOrderAmount)}</span> : null}</span> },
    { key: 'uses', label: 'Uses', align: 'right', className: 'hidden md:table-cell', render: (d) => <span className="tabular-nums text-muted-foreground">{d.usedCount}{d.maxUses != null ? `/${d.maxUses}` : ''}</span> },
    { key: 'window', label: 'Valid', className: 'hidden lg:table-cell', render: (d) => <span className="text-xs text-muted-foreground">{d.startsAt ? new Date(d.startsAt).toLocaleDateString() : 'now'} → {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : 'no end date'}</span> },
    {
      key: 'active', label: 'Active', align: 'right',
      render: (d) => (
        <button type="button" role="switch" aria-checked={d.active} aria-label={`${d.active ? 'Deactivate' : 'Activate'} ${d.code}`} disabled={busyId === d.id}
          onClick={(e) => { e.stopPropagation(); onToggle(d); }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${d.active ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${d.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      ),
    },
  ];
  return <StudioTable columns={columns} rows={rows} rowKey={(d) => d.id} onRowClick={onEdit} footer={`${rows.length} ${rows.length === 1 ? 'code' : 'codes'}`} />;
}
