'use client';

/**
 * PUX-169 (design doc screen 28): saved views as tabs, each with its count.
 * ponytail: one `?limit=1` count fetch per view (the list route returns
 * `total`); a count endpoint if tenants accumulate many views.
 */

import { useEffect, useState } from 'react';
import { sBtnGhost } from '@/components/portal/portal-ui';

export interface SavedViewLite {
  id: number;
  name: string;
  filters: { search?: string; status?: string; companyId?: string; title?: string };
}

export function viewCountUrl(filters: SavedViewLite['filters']): string {
  const p = new URLSearchParams({ limit: '1' });
  if (filters.search) p.set('search', filters.search);
  if (filters.status) p.set('status', filters.status);
  if (filters.companyId) p.set('companyId', filters.companyId);
  if (filters.title) p.set('title', filters.title);
  return `/api/portal/crm/contacts?${p}`;
}

export default function SavedViewTabs({
  views, selectedId, onSelect, onDelete, canSave, onSave,
}: {
  views: SavedViewLite[];
  selectedId: number | null;
  onSelect: (view: SavedViewLite | null) => void;
  onDelete: (id: number) => void;
  canSave: boolean;
  onSave: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    const targets: [string, SavedViewLite['filters']][] = [['all', {}], ...views.map((v) => [String(v.id), v.filters] as [string, SavedViewLite['filters']])];
    (async () => {
      const entries = await Promise.all(targets.map(async ([k, f]) => {
        try {
          const r = await fetch(viewCountUrl(f));
          const d = await r.json();
          return [k, Number(d.data?.total ?? 0)] as const;
        } catch {
          return [k, NaN] as const;
        }
      }));
      if (!cancelled) setCounts(Object.fromEntries(entries.filter(([, n]) => !Number.isNaN(n))));
    })();
    return () => { cancelled = true; };
  }, [views]);

  const tab = (key: string, label: string, active: boolean, onClick: () => void, extra?: React.ReactNode) => (
    <span key={key} className="flex items-center">
      <button
        type="button"
        onClick={onClick}
        className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
        {counts[key] !== undefined && <span className={`ml-1.5 tabular-nums ${active ? 'text-background/70' : 'text-muted-foreground/70'}`}>{counts[key]}</span>}
      </button>
      {extra}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Saved views">
      {tab('all', 'All', selectedId === null, () => onSelect(null))}
      {views.map((v) => tab(String(v.id), v.name, selectedId === v.id, () => onSelect(v),
        selectedId === v.id ? (
          <button type="button" onClick={() => onDelete(v.id)} title="Delete saved view" className="ml-0.5 rounded p-1 text-muted-foreground hover:text-destructive">
            <span className="material-icons text-sm">delete</span>
          </button>
        ) : undefined,
      ))}
      {canSave && (
        <button type="button" onClick={onSave} className={`${sBtnGhost} !py-1`}>
          <span className="material-icons text-base">add</span>
          Save this view
        </button>
      )}
    </div>
  );
}
