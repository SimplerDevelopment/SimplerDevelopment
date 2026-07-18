'use client';

/**
 * DocumentCard — single row in the documents library list.
 *
 * Renders: title, status chip, category chip, owner avatar (initial),
 * version count badge, ack count badge, last-published date. The whole card
 * is a `<Link>` to the detail page.
 */

import Link from 'next/link';
import type {
  BrainDocumentStatus,
  BrainDocumentCategory,
} from '@/lib/brain/documents';

export interface DocumentCardData {
  id: number;
  title: string;
  slug: string;
  category: BrainDocumentCategory;
  status: BrainDocumentStatus;
  ownerId: number | null;
  ownerName?: string | null;
  currentPublishedVersionId: number | null;
  publishedAt: string | Date | null;
  versionCount: number;
  requiredReadCount: number;
  ackCount: number;
}

function formatDate(d: string | Date | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(d);
  }
}

const STATUS_STYLES: Record<BrainDocumentStatus, { icon: string; classes: string }> = {
  draft: {
    icon: 'edit_note',
    classes: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  published: {
    icon: 'check_circle',
    classes: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  archived: {
    icon: 'archive',
    classes: 'bg-muted text-muted-foreground border-border',
  },
};

const CATEGORY_ICONS: Record<BrainDocumentCategory, string> = {
  sop: 'fact_check',
  policy: 'policy',
  guide: 'menu_book',
  reference: 'description',
  announcement: 'campaign',
  other: 'article',
};

export default function DocumentCard({ doc }: { doc: DocumentCardData }) {
  const statusMeta = STATUS_STYLES[doc.status];
  const ownerInitial = (doc.ownerName ?? '').trim().slice(0, 1).toUpperCase() || '?';

  return (
    <Link
      href={`/portal/brain/documents/${doc.id}`}
      className="group flex items-start gap-3 px-3 py-2.5 rounded-lg bg-card border border-border hover:border-primary/40 hover:bg-accent/40 transition-colors"
    >
      <span
        className="material-icons text-[20px] text-muted-foreground group-hover:text-primary shrink-0 mt-0.5"
        aria-hidden
      >
        {CATEGORY_ICONS[doc.category] ?? 'description'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground truncate">{doc.title}</h3>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded border ${statusMeta.classes}`}>
                <span className="material-icons text-[11px]">{statusMeta.icon}</span>
                {doc.status}
              </span>
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground">
                <span className="material-icons text-[11px]">label</span>
                {doc.category}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/80 truncate" title="Stable slug">
                /{doc.slug}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted-foreground">
            {doc.ownerName && (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold"
                title={`Owner: ${doc.ownerName}`}
                aria-label={`Owner: ${doc.ownerName}`}
              >
                {ownerInitial}
              </span>
            )}
            <span className="inline-flex items-center gap-0.5" title={`${doc.versionCount} version(s)`}>
              <span className="material-icons text-[12px]">history</span>
              {doc.versionCount}
            </span>
            <span className="inline-flex items-center gap-0.5" title={`${doc.ackCount} acknowledgment(s)`}>
              <span className="material-icons text-[12px]">verified</span>
              {doc.ackCount}
            </span>
            <span className="hidden sm:inline-flex items-center gap-0.5" title="Last published">
              <span className="material-icons text-[12px]">schedule</span>
              {formatDate(doc.publishedAt)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
