'use client';

/**
 * DocumentVersionHistory — vertical timeline of versions for a document.
 *
 * Renders oldest-first. Each row shows: version number, isDraft chip,
 * publishedAt date, changeNotes (if any). Clicking a row fires
 * `onSelectVersion(versionId)` so the parent can fetch and display that
 * version's body inline.
 *
 * Body fetching is done by the parent (so we don't N+1 the API). This
 * component is purely presentational.
 */

interface VersionRow {
  id: number;
  versionNumber: number;
  isDraft: boolean;
  publishedAt: string | Date | null;
  title?: string | null;
  changeNotes?: string | null;
  summary?: string | null;
}

interface Props {
  versions: VersionRow[];
  /** The version whose body is currently displayed inline (highlighted). */
  selectedVersionId?: number | null;
  /** The doc's currentPublishedVersionId, for the "current" badge. */
  currentPublishedVersionId?: number | null;
  onSelectVersion?: (versionId: number) => void;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(d);
  }
}

export default function DocumentVersionHistory({
  versions,
  selectedVersionId,
  currentPublishedVersionId,
  onSelectVersion,
}: Props) {
  // Sort oldest → newest for the timeline render.
  const ordered = [...versions].sort((a, b) => a.versionNumber - b.versionNumber);

  if (ordered.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-4">No versions yet.</div>
    );
  }

  return (
    <ol className="space-y-1.5">
      {ordered.map((v, idx) => {
        const isCurrent = currentPublishedVersionId === v.id;
        const isSelected = selectedVersionId === v.id;
        const isLast = idx === ordered.length - 1;
        return (
          <li key={v.id} className="relative pl-6">
            {/* Timeline rail + dot */}
            <span
              className={`absolute left-2 top-3 w-2 h-2 rounded-full ${
                v.isDraft ? 'bg-amber-500' : isCurrent ? 'bg-emerald-500' : 'bg-muted-foreground'
              }`}
              aria-hidden
            />
            {!isLast && (
              <span
                className="absolute left-[11px] top-5 bottom-0 w-px bg-border"
                aria-hidden
              />
            )}
            <button
              type="button"
              onClick={() => onSelectVersion?.(v.id)}
              className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                isSelected
                  ? 'border-primary/60 bg-primary/5'
                  : 'border-border bg-card hover:bg-accent/40'
              }`}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-foreground">v{v.versionNumber}</span>
                {v.isDraft && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    <span className="material-icons text-[11px]">edit_note</span>
                    Draft
                  </span>
                )}
                {isCurrent && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                    <span className="material-icons text-[11px]">check_circle</span>
                    Current
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground ml-auto inline-flex items-center gap-0.5">
                  <span className="material-icons text-[11px]">
                    {v.isDraft ? 'edit' : 'check'}
                  </span>
                  {v.isDraft ? 'Last edited' : 'Published'} {formatDate(v.publishedAt)}
                </span>
              </div>
              {v.changeNotes && (
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug whitespace-pre-wrap">
                  {v.changeNotes}
                </p>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
