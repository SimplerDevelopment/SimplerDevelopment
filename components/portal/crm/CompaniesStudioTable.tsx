'use client';

/**
 * PUX-203 (design doc screen 67): companies in the list idiom with the
 * columns that predict a deal — Contacts, Open deals, Last activity — the
 * same swap Contacts made. Row click opens the side panel. Studio-only.
 */

import StudioTable, { type StudioColumn } from '@/components/portal/StudioTable';
import { relativeTime } from '@/lib/notifications/feed';

export interface CompanyRow {
  id: number; name: string; domain?: string | null; logoUrl?: string | null;
  contactCount?: number | null; openDeals?: number | null;
  lastActivity?: { title: string; at: string } | null;
}

export default function CompaniesStudioTable({ rows, onOpen, selectedId, footer }: { rows: CompanyRow[]; onOpen: (c: CompanyRow) => void; selectedId?: number | null; footer?: string }) {
  const columns: StudioColumn<CompanyRow>[] = [
    {
      key: 'name', label: 'Company',
      render: (c) => (
        <span className={`flex items-center gap-2 ${selectedId === c.id ? 'font-semibold' : 'font-medium'} text-foreground`}>
          {c.logoUrl
            // eslint-disable-next-line @next/next/no-img-element -- tenant logo URL
            ? <img src={c.logoUrl} alt="" className="h-6 w-6 rounded border border-border object-contain" />
            : <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">{c.name.slice(0, 1).toUpperCase()}</span>}
          <span>{c.name}{c.domain && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.domain}</span>}</span>
        </span>
      ),
    },
    { key: 'contacts', label: 'Contacts', align: 'right', render: (c) => <span className="tabular-nums">{c.contactCount ?? 0}</span> },
    { key: 'deals', label: 'Open deals', align: 'right', render: (c) => <span className={`tabular-nums ${(c.openDeals ?? 0) > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{c.openDeals ?? 0}</span> },
    { key: 'activity', label: 'Last activity', className: 'hidden md:table-cell', render: (c) => c.lastActivity ? <span className="text-muted-foreground"><span className="text-foreground">{c.lastActivity.title}</span> · {relativeTime(c.lastActivity.at)}</span> : <span className="text-muted-foreground/60">—</span> },
  ];
  return <StudioTable columns={columns} rows={rows} rowKey={(c) => c.id} onRowClick={onOpen} footer={footer} />;
}
