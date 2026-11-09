'use client';

/**
 * PUX-184 (design doc screen 43): a site's pages in the list idiom — type
 * tabs with counts, Title · Type · Status · Last edited, and the row action
 * named for where it goes. Studio-only; the entries page gates on hasFlag.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import StudioTable, { type StudioColumn } from '@/components/portal/StudioTable';
import { PAGE_STATUS_LABEL, type PageStatus } from '@/lib/sites/page-rows';
import { relativeTime } from '@/lib/notifications/feed';
import { sBtnGhost } from '@/components/portal/portal-ui';

export interface PageRow { id: number; title: string; postType: string; status: PageStatus; updatedAt: string }
export interface TypeTab { slug: string; name: string; count: number }

const TONE: Record<PageStatus, string> = {
  published: 'bg-[var(--portal-ok-bg)] text-[var(--portal-ok)]',
  draft: 'bg-muted text-muted-foreground',
  pending: 'bg-[var(--studio-gold-surface)] text-[var(--studio-gold-ink)]',
};

export default function PagesStudioTable({ siteId, rows, tabs, activeType, total }: { siteId: number; rows: PageRow[]; tabs: TypeTab[]; activeType: string | null; total: number }) {
  const router = useRouter();
  const typeName = new Map(tabs.map((t) => [t.slug, t.name]));
  const edit = (id: number) => `/portal/websites/${siteId}/posts/${id}/edit`;
  const columns: StudioColumn<PageRow>[] = [
    { key: 'title', label: 'Title', render: (p) => <Link href={edit(p.id)} onClick={(e) => e.stopPropagation()} className="font-medium text-foreground hover:underline">{p.title || 'Untitled'}</Link> },
    { key: 'type', label: 'Type', className: 'hidden md:table-cell text-muted-foreground', render: (p) => typeName.get(p.postType) ?? p.postType },
    { key: 'status', label: 'Status', render: (p) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[p.status]}`}>{PAGE_STATUS_LABEL[p.status]}</span> },
    { key: 'edited', label: 'Last edited', className: 'hidden lg:table-cell text-muted-foreground', render: (p) => relativeTime(p.updatedAt) },
    { key: 'action', label: '', align: 'right', render: (p) => <Link href={edit(p.id)} onClick={(e) => e.stopPropagation()} className={`${sBtnGhost} !py-1`}>Edit in the visual editor</Link> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Content types">
        {[{ slug: '', name: 'All', count: total }, ...tabs].map((t) => {
          const active = (activeType ?? '') === t.slug;
          return (
            <Link key={t.slug || 'all'} role="tab" aria-selected={active} href={t.slug ? `?type=${t.slug}` : '?'}
              className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}>
              {t.name}<span className={`ml-1.5 tabular-nums ${active ? 'text-background/70' : 'text-muted-foreground/70'}`}>{t.count}</span>
            </Link>
          );
        })}
      </div>
      <StudioTable columns={columns} rows={rows} rowKey={(p) => p.id} onRowClick={(p) => router.push(edit(p.id))} footer={`${rows.length} of ${total} ${total === 1 ? 'page' : 'pages'}`} />
    </div>
  );
}
