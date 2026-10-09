'use client';

/**
 * PUX-186 (design doc screen 45): store products in the list idiom —
 * thumbnail, Name + SKU, Price, Stock as a pill, Status. Selection stays
 * wired to the page's existing bulk-status controls. Studio-only; the
 * products page gates on useFeatureFlag('portal-redesign').
 */

import StudioTable, { type StudioColumn } from '@/components/portal/StudioTable';
import { formatMoney } from '@/lib/utils/money';
import { stockLabel, type StockTone } from '@/lib/store/stock-label';

export interface ProductRow {
  id: number;
  name: string;
  sku?: string | null;
  status: string;
  price: number;
  compareAtPrice?: number | null;
  quantity: number;
  trackInventory: boolean;
  images: { url: string }[];
}

const STOCK_TONE: Record<StockTone, string> = {
  ok: 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]',
  warn: 'bg-[var(--portal-warn-bg)] text-[var(--portal-warn)]',
  muted: 'bg-muted text-muted-foreground',
};

const STATUS_TONE: Record<string, string> = {
  active: 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]',
  draft: 'bg-muted text-muted-foreground',
  archived: 'bg-[var(--portal-warn-bg)] text-[var(--portal-warn)]',
};

export default function ProductsStudioTable({
  rows, lowStockThreshold, selected, onToggle, onToggleAll, onOpen, footer,
}: {
  rows: ProductRow[];
  lowStockThreshold: number;
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onOpen: (p: ProductRow) => void;
  footer?: string;
}) {
  const columns: StudioColumn<ProductRow>[] = [
    {
      key: 'thumb', label: '', className: 'w-14',
      render: (p) => p.images[0]?.url
        // eslint-disable-next-line @next/next/no-img-element -- remote product image, same as the legacy table
        ? <img src={p.images[0].url} alt="" className="h-9 w-9 rounded-lg border border-border object-cover" />
        : <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/30"><span className="material-icons text-base text-muted-foreground">image</span></div>,
    },
    {
      key: 'name', label: 'Name',
      render: (p) => (
        <>
          <p className="font-medium text-foreground">{p.name}</p>
          {p.sku && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.sku}</p>}
        </>
      ),
    },
    {
      key: 'price', label: 'Price', align: 'right',
      render: (p) => (
        <span className="tabular-nums">
          {formatMoney(p.price)}
          {p.compareAtPrice ? <span className="ml-1.5 text-xs text-muted-foreground line-through">{formatMoney(p.compareAtPrice)}</span> : null}
        </span>
      ),
    },
    {
      key: 'stock', label: 'Stock',
      render: (p) => { const s = stockLabel(p, lowStockThreshold); return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STOCK_TONE[s.tone]}`}>{s.label}</span>; },
    },
    {
      key: 'status', label: 'Status',
      render: (p) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_TONE[p.status] ?? 'bg-muted text-muted-foreground'}`}>{p.status}</span>,
    },
  ];
  return (
    <StudioTable
      columns={columns} rows={rows} rowKey={(p) => p.id} onRowClick={onOpen}
      selectable selected={selected} onToggle={onToggle} onToggleAll={onToggleAll} footer={footer}
    />
  );
}
