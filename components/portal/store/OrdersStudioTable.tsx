'use client';

/**
 * PUX-209 (design doc screen 73): orders in the list idiom with payment and
 * fulfilment as two facts, selectable for the bulk bar. Studio-only.
 */

import StudioTable, { type StudioColumn } from '@/components/portal/StudioTable';
import { formatMoney } from '@/lib/utils/money';
import { orderSteps, terminalLabel } from '@/lib/store/order-steps';
import { paymentLabel } from '@/lib/store/order-chips';

export interface OrderRow {
  id: number; orderNumber: string; customerName: string; customerEmail: string; totalCents: number; status: string; itemCount: number; createdAt: string;
  paymentStatus?: string | null; paidAt?: string | null;
}

const TONE = { ok: 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]', warn: 'bg-[var(--portal-warn-bg)] text-[var(--portal-warn)]', muted: 'bg-muted text-muted-foreground' } as const;

function fulfilment(status: string): { label: string; tone: keyof typeof TONE } {
  const t = terminalLabel(status);
  if (t) return { label: t, tone: 'warn' };
  const cur = orderSteps(status).find((s) => s.state === 'current')?.label ?? 'Placed';
  return { label: cur, tone: cur === 'Fulfilled' ? 'ok' : 'muted' };
}

export default function OrdersStudioTable({ rows, selected, onToggle, onToggleAll, onOpen, footer }: {
  rows: OrderRow[]; selected: ReadonlySet<number>; onToggle: (id: number) => void; onToggleAll: () => void; onOpen: (o: OrderRow) => void; footer?: string;
}) {
  const columns: StudioColumn<OrderRow>[] = [
    { key: 'number', label: 'Order', render: (o) => <span className="font-medium text-primary">{o.orderNumber}</span> },
    { key: 'customer', label: 'Customer', render: (o) => <><span className="block text-foreground">{o.customerName}</span><span className="block text-xs text-muted-foreground">{o.customerEmail}</span></> },
    { key: 'items', label: 'Items', align: 'right', className: 'hidden md:table-cell', render: (o) => <span className="tabular-nums text-muted-foreground">{o.itemCount}</span> },
    { key: 'total', label: 'Total', align: 'right', render: (o) => <span className="tabular-nums font-medium">{formatMoney(o.totalCents)}</span> },
    { key: 'payment', label: 'Payment', render: (o) => { const p = paymentLabel(o); return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[p.tone]}`}>{p.label}</span>; } },
    { key: 'fulfilment', label: 'Fulfilment', render: (o) => { const f = fulfilment(o.status); return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[f.tone]}`}>{f.label}</span>; } },
    { key: 'date', label: 'Date', className: 'hidden lg:table-cell', render: (o) => <span className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString()}</span> },
  ];
  return <StudioTable columns={columns} rows={rows} rowKey={(o) => o.id} onRowClick={onOpen} selectable selected={selected} onToggle={onToggle} onToggleAll={onToggleAll} footer={footer} minWidth={720} />;
}
