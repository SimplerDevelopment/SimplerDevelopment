'use client';

/**
 * DataviewBlock — renders a `dataview`-fenced JSON code block as a live table.
 *
 * Wired into MarkdownEditor via the `extraComponents` prop — the caller passes
 *   { code: makeDataviewCodeOverride() }
 * which forwards non-dataview code blocks back to the editor's default code
 * renderer (so `language-ts` highlighting still works) and replaces dataview
 * blocks with this live component.
 *
 * v1 caching: each block fetches once on mount; clicking the "refreshed N min
 * ago" badge re-queries. No background polling.
 */

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import type { Components } from 'react-markdown';

interface DataviewResponse {
  rows: Array<Record<string, unknown>>;
  columns: string[];
}

interface DataviewBlockProps {
  /** Raw text inside the ` ```dataview ` fence — must parse as JSON. */
  source: string;
  /** Endpoint override for tests. */
  endpoint?: string;
}

/* --------------------------------------------------------------------- */
/* Helpers                                                                */
/* --------------------------------------------------------------------- */

function formatRelative(from: number, now: number): string {
  const sec = Math.max(0, Math.round((now - from) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} d ago`;
}

function formatCell(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  if (value instanceof Date) {
    return value.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }
  if (typeof value === 'string') {
    // ISO date heuristic — render as local date.
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric',
        });
      }
    }
    return value;
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return value.toLocaleString();
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">—</span>;
    return value.map((v) => String(v)).join(', ');
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Friendly column header from a camelCase / snake_case key. */
function humaniseColumn(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/* --------------------------------------------------------------------- */
/* The block                                                              */
/* --------------------------------------------------------------------- */

export function DataviewBlock({ source, endpoint = '/api/portal/brain/dataview' }: DataviewBlockProps) {
  const parsed = useMemo<{ ok: true; query: unknown } | { ok: false; error: string }>(() => {
    try {
      const trimmed = source.trim();
      if (!trimmed) return { ok: false, error: 'empty dataview block' };
      const obj = JSON.parse(trimmed);
      return { ok: true, query: obj };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'invalid JSON' };
    }
  }, [source]);

  const [state, setState] = useState<
    | { phase: 'idle' }
    | { phase: 'loading' }
    | { phase: 'error'; message: string }
    | { phase: 'ready'; data: DataviewResponse; fetchedAt: number }
  >({ phase: 'idle' });
  const [now, setNow] = useState(() => Date.now());
  const [reloadKey, setReloadKey] = useState(0);

  const run = useCallback(async () => {
    if (!parsed.ok) return;
    setState({ phase: 'loading' });
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.query),
        credentials: 'same-origin',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        const msg = body?.message || `HTTP ${res.status}`;
        setState({ phase: 'error', message: msg });
        return;
      }
      setState({
        phase: 'ready',
        data: body.data as DataviewResponse,
        fetchedAt: Date.now(),
      });
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'request failed',
      });
    }
  }, [parsed, endpoint]);

  // Initial fetch (and re-fetch when the user hits the badge — reloadKey changes).
  useEffect(() => {
    if (parsed.ok) queueMicrotask(() => { void run(); });
  }, [parsed, run, reloadKey]);

  // Tick every 30s so the relative timestamp stays accurate.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!parsed.ok) {
    return (
      <div className="my-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-destructive">
          <span className="material-icons text-sm">error_outline</span>
          Dataview parse error
        </div>
        <div className="mt-1 font-mono text-[11px] text-destructive/80">{parsed.error}</div>
      </div>
    );
  }

  if (state.phase === 'idle' || state.phase === 'loading') {
    return (
      <div className="my-3 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="material-icons text-sm animate-spin">refresh</span>
          <span>Running dataview query…</span>
        </div>
        <div className="mt-2 space-y-1">
          <div className="h-3 w-2/3 rounded bg-muted-foreground/15 animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-muted-foreground/15 animate-pulse" />
          <div className="h-3 w-3/4 rounded bg-muted-foreground/15 animate-pulse" />
        </div>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="my-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-medium text-destructive">
            <span className="material-icons text-sm">error_outline</span>
            Query failed
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((n) => n + 1)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-destructive hover:bg-destructive/10"
          >
            <span className="material-icons text-xs">refresh</span>
            Retry
          </button>
        </div>
        <div className="mt-1 font-mono text-[11px] text-destructive/80">{state.message}</div>
      </div>
    );
  }

  const { rows, columns } = state.data;
  const relative = formatRelative(state.fetchedAt, now);

  return (
    <div className="my-3 overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-2.5 py-1.5 text-[11px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="material-icons text-sm">table_chart</span>
          <span className="font-medium uppercase tracking-wider">Dataview</span>
          <span>· {rows.length} {rows.length === 1 ? 'row' : 'rows'}</span>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((n) => n + 1)}
          title="Refresh query"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          <span>live · refreshed {relative}</span>
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-xs italic text-muted-foreground">No matching rows.</div>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    className="border-b border-border px-2 py-1.5 text-left font-semibold text-foreground"
                  >
                    {humaniseColumn(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="even:bg-muted/20">
                  {columns.map((c) => (
                    <td
                      key={c}
                      className="border-b border-border/50 px-2 py-1 align-top"
                    >
                      {formatCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Code-component override for `react-markdown`'s `components` prop.
 *
 * When the fenced language is `dataview`, render <DataviewBlock>. Otherwise,
 * delegate back to the default code rendering provided by the caller (so
 * existing syntax-highlighted code blocks still work). Pass this as
 *   <MarkdownEditor extraComponents={{ code: makeDataviewCodeOverride(defaultCode) }} />
 *
 * @param fallback - the editor's existing `code` renderer (preserves
 *   highlighting / inline-vs-block logic). When omitted, a minimal pass-through
 *   is used.
 */
export function makeDataviewCodeOverride(
  fallback?: Components['code'],
): Components['code'] {
  return function DataviewCode(props) {
    const { className, children } = props;
    const isDataview = /\blanguage-dataview\b/.test(className ?? '');
    if (isDataview) {
      // children is the raw fence body — react-markdown passes it as a string
      // (or a single text node child).
      const source = Array.isArray(children)
        ? children.map((c) => (typeof c === 'string' ? c : '')).join('')
        : typeof children === 'string'
          ? children
          : String(children ?? '');
      return <DataviewBlock source={source} />;
    }
    if (fallback) {
      // Forward unchanged so highlighting and other styling still apply.
      // `Components['code']` is `ComponentType | string | undefined`; only the
      // function-component case is meaningful here.
      if (typeof fallback === 'function') {
        const FallbackComponent = fallback as ComponentType<typeof props>;
        return createElement(FallbackComponent, props);
      }
    }
    return <code {...props}>{children}</code>;
  };
}
