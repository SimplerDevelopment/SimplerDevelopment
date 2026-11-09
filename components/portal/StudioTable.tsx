'use client';

/**
 * PUX-169 (design doc screen 28): the portal's list idiom, built once.
 * Ink header row on paper, hairline rows, tabular numerals right-aligned,
 * an optional checkbox column, and a footer for the count. Contacts uses it
 * first; Deals (table view), Proposals & contracts and Surveys reuse it.
 * Studio-only by convention — callers gate on useFeatureFlag('portal-redesign').
 */

import type { ReactNode } from 'react';

export interface StudioColumn<T> {
  key: string;
  label: string;
  align?: 'right';
  /** Extra classes on both the header cell and the body cells (e.g. responsive hiding). */
  className?: string;
  render: (row: T) => ReactNode;
}

export default function StudioTable<T>({
  columns, rows, rowKey, onRowClick, selectable = false, selected, onToggle, onToggleAll, footer, minWidth = 640,
}: {
  columns: StudioColumn<T>[];
  rows: T[];
  rowKey: (row: T) => number;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selected?: ReadonlySet<number>;
  onToggle?: (key: number) => void;
  onToggleAll?: () => void;
  footer?: ReactNode;
  minWidth?: number;
}) {
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)));
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="bg-foreground text-background">
            {selectable && (
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={onToggleAll} className="h-4 w-4 accent-primary" />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[.06em] ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.className ?? ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const k = rowKey(r);
            const isSel = selectable && !!selected?.has(k);
            return (
              <tr
                key={k}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-accent/60' : ''} ${isSel ? 'bg-primary/5' : ''}`}
              >
                {selectable && (
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label="Select row" checked={isSel} onChange={() => onToggle?.(k)} className="h-4 w-4 accent-primary" />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.className ?? ''}`}>{c.render(r)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer && <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">{footer}</div>}
    </div>
  );
}
