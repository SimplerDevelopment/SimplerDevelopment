// The before/after diff for one pending MCP change. Moved verbatim out of
// app/portal/approvals/page.tsx (PUX-157) — that page sits at its file-size
// cap and this block is pure: props in, rows out, no page state.

type DiffKind = 'added' | 'removed' | 'changed' | 'unchanged';

interface DiffRow { key: string; before: unknown; after: unknown; kind: DiffKind }

function diffObjects(before: unknown, after: unknown): DiffRow[] {
  const b = (before && typeof before === 'object' && !Array.isArray(before)) ? before as Record<string, unknown> : {};
  const a = (after && typeof after === 'object' && !Array.isArray(after)) ? after as Record<string, unknown> : {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();
  return keys.map(key => {
    const hasBefore = key in b;
    const hasAfter = key in a;
    if (!hasBefore) return { key, before: undefined, after: a[key], kind: 'added' as const };
    if (!hasAfter) return { key, before: b[key], after: undefined, kind: 'removed' as const };
    const bJson = JSON.stringify(b[key]);
    const aJson = JSON.stringify(a[key]);
    return { key, before: b[key], after: a[key], kind: bJson === aJson ? 'unchanged' as const : 'changed' as const };
  });
}

function formatValue(v: unknown): string {
  if (v === undefined) return '';
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

export function DiffViewer({ before, after }: { before: unknown; after: unknown }) {
  const rows = diffObjects(before, after);
  const changedCount = rows.filter(r => r.kind !== 'unchanged').length;
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No fields to compare.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">
        {changedCount} of {rows.length} field{rows.length === 1 ? '' : 's'} changed.
      </div>
      <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
        {rows.map(row => {
          const rowBg =
            row.kind === 'added' ? 'bg-emerald-50 dark:bg-emerald-900/10' :
            row.kind === 'removed' ? 'bg-destructive/5' :
            row.kind === 'changed' ? 'bg-amber-50 dark:bg-amber-900/10' :
            'bg-transparent';
          return (
            <div key={row.key} className={`${rowBg} px-3 py-2 text-xs`}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <code className="font-semibold text-foreground">{row.key}</code>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{row.kind}</span>
              </div>
              {row.kind === 'unchanged' ? (
                <pre className="text-muted-foreground whitespace-pre-wrap break-words line-clamp-3">{formatValue(row.before)}</pre>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">before</div>
                    <pre className="bg-muted/40 rounded px-2 py-1 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                      {row.kind === 'added' ? <span className="text-muted-foreground italic">(not set)</span> : formatValue(row.before)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">after</div>
                    <pre className="bg-muted/40 rounded px-2 py-1 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                      {row.kind === 'removed' ? <span className="text-muted-foreground italic">(removed)</span> : formatValue(row.after)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
