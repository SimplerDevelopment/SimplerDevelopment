'use client';

// Client renderer for the unified webhook console. Receives the pre-aggregated
// rows from page.tsx (server component), exposes filter chips, copy-URL,
// rotate-secret, and view-deliveries panels. All mutations go through
// /api/portal/settings/webhooks/[source]/[id]/...

import { useMemo, useState } from 'react';
import Link from 'next/link';

export type WebhookSource = 'project' | 'survey' | 'site';

export interface UnifiedWebhookRow {
  source: WebhookSource;
  sourceId: number;
  sourceLabel: string;
  sourceHref: string;
  id: number;
  url: string;
  events: string[];
  enabled: boolean;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  secretLast4: string | null;
  failing: boolean;
  createdAt: string;
  /** True when a delivery log table exists for this source (project today). */
  hasDeliveryLog: boolean;
}

interface DeliveryRow {
  id: number;
  event: string;
  status: number | null;
  error: string | null;
  createdAt: string;
}

type SourceFilter = 'all' | WebhookSource;
type StatusFilter = 'all' | 'enabled' | 'disabled';

const SOURCE_ICON: Record<WebhookSource, string> = {
  project: 'folder_special',
  survey: 'poll',
  site: 'language',
};

const SOURCE_LABEL: Record<WebhookSource, string> = {
  project: 'Project',
  survey: 'Survey',
  site: 'Site',
};

function truncateUrl(url: string, max = 48): string {
  if (url.length <= max) return url;
  return url.slice(0, max - 1) + '…';
}

function formatStatus(status: number | null): string {
  if (status === null) return '—';
  return String(status);
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString();
}

export default function WebhookConsole({ rows }: { rows: UnifiedWebhookRow[] }) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [failingOnly, setFailingOnly] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openDeliveries, setOpenDeliveries] = useState<string | null>(null);
  const [deliveriesById, setDeliveriesById] = useState<Record<string, DeliveryRow[] | 'loading' | 'error'>>({});
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotatedSecrets, setRotatedSecrets] = useState<Record<string, string>>({});
  const [rotateError, setRotateError] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (statusFilter === 'enabled' && !r.enabled) return false;
      if (statusFilter === 'disabled' && r.enabled) return false;
      if (failingOnly && !r.failing) return false;
      return true;
    });
  }, [rows, sourceFilter, statusFilter, failingOnly]);

  const sources: SourceFilter[] = ['all', 'project', 'survey', 'site'];

  const rowKey = (r: UnifiedWebhookRow) => `${r.source}-${r.id}`;

  async function handleCopy(key: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(key);
      setTimeout(() => setCopiedId((current) => (current === key ? null : current)), 1600);
    } catch {
      // ignore — old browsers without clipboard API
    }
  }

  async function handleRotate(r: UnifiedWebhookRow) {
    const key = rowKey(r);
    if (!confirm(`Rotate the signing secret for this ${SOURCE_LABEL[r.source].toLowerCase()} webhook?\nAny consumer that doesn't update will start failing signature checks immediately.`)) {
      return;
    }
    setRotatingId(key);
    setRotateError((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const res = await fetch(`/api/portal/settings/webhooks/${r.source}/${r.id}/rotate`, {
        method: 'POST',
      });
      const json = (await res.json()) as { success: boolean; data?: { secret: string }; message?: string };
      if (!res.ok || !json.success || !json.data) {
        setRotateError((prev) => ({ ...prev, [key]: json.message ?? `HTTP ${res.status}` }));
        return;
      }
      setRotatedSecrets((prev) => ({ ...prev, [key]: json.data!.secret }));
    } catch (err) {
      setRotateError((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : 'Rotate failed',
      }));
    } finally {
      setRotatingId(null);
    }
  }

  async function handleToggleDeliveries(r: UnifiedWebhookRow) {
    const key = rowKey(r);
    if (openDeliveries === key) {
      setOpenDeliveries(null);
      return;
    }
    setOpenDeliveries(key);
    if (!deliveriesById[key]) {
      setDeliveriesById((prev) => ({ ...prev, [key]: 'loading' }));
      try {
        const res = await fetch(`/api/portal/settings/webhooks/${r.source}/${r.id}/deliveries`);
        const json = (await res.json()) as { success: boolean; data?: DeliveryRow[]; message?: string };
        if (!res.ok || !json.success) {
          setDeliveriesById((prev) => ({ ...prev, [key]: 'error' }));
          return;
        }
        setDeliveriesById((prev) => ({ ...prev, [key]: json.data ?? [] }));
      } catch {
        setDeliveriesById((prev) => ({ ...prev, [key]: 'error' }));
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-card">
          {sources.map((s) => {
            const active = sourceFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSourceFilter(s)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s !== 'all' && (
                  <span className="material-icons text-sm">{SOURCE_ICON[s as WebhookSource]}</span>
                )}
                {s === 'all' ? 'All sources' : SOURCE_LABEL[s as WebhookSource]}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-card">
          {(['all', 'enabled', 'disabled'] as StatusFilter[]).map((s) => {
            const active = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs rounded-md capitalize transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'all' ? 'Any status' : s}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setFailingOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
            failingOnly
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="material-icons text-sm">error_outline</span>
          Failing only
        </button>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {/* Empty states */}
      {rows.length === 0 && (
        <div className="border border-border bg-card rounded-xl p-8 flex flex-col items-center text-center">
          <span className="material-icons text-5xl text-muted-foreground mb-3">webhook</span>
          <h3 className="font-semibold text-foreground mb-1">No webhooks configured</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Create webhooks from inside individual projects, surveys, or sites. They&apos;ll show up
            here automatically.
          </p>
        </div>
      )}

      {rows.length > 0 && filtered.length === 0 && (
        <div className="border border-border bg-card rounded-xl p-6 text-sm text-muted-foreground text-center">
          No webhooks match the current filters.
        </div>
      )}

      {/* Rows */}
      {filtered.length > 0 && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">URL</th>
                <th className="px-3 py-2 font-medium">Events</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last delivery</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const key = rowKey(r);
                const isOpen = openDeliveries === key;
                const deliveries = deliveriesById[key];
                const rotated = rotatedSecrets[key];
                const error = rotateError[key];
                return (
                  <FragmentRow
                    key={key}
                    r={r}
                    isOpen={isOpen}
                    deliveries={deliveries}
                    rotated={rotated}
                    error={error}
                    rotating={rotatingId === key}
                    copied={copiedId === key}
                    onCopy={() => handleCopy(key, r.url)}
                    onRotate={() => handleRotate(r)}
                    onToggleDeliveries={() => handleToggleDeliveries(r)}
                  />
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface FragmentRowProps {
  r: UnifiedWebhookRow;
  isOpen: boolean;
  deliveries: DeliveryRow[] | 'loading' | 'error' | undefined;
  rotated: string | undefined;
  error: string | undefined;
  rotating: boolean;
  copied: boolean;
  onCopy: () => void;
  onRotate: () => void;
  onToggleDeliveries: () => void;
}

function FragmentRow({
  r,
  isOpen,
  deliveries,
  rotated,
  error,
  rotating,
  copied,
  onCopy,
  onRotate,
  onToggleDeliveries,
}: FragmentRowProps) {
  return (
    <>
      <tr className="border-t border-border align-top">
        <td className="px-3 py-3">
          <Link
            href={r.sourceHref}
            className="inline-flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
          >
            <span className="material-icons text-base text-muted-foreground">
              {SOURCE_ICON[r.source]}
            </span>
            <span className="truncate max-w-[14ch]">{r.sourceLabel}</span>
            <span className="material-icons text-sm text-muted-foreground">north_east</span>
          </Link>
          <div className="text-xs text-muted-foreground mt-0.5">{SOURCE_LABEL[r.source]}</div>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <code className="font-mono text-xs text-foreground">{truncateUrl(r.url)}</code>
            <button
              type="button"
              onClick={onCopy}
              title="Copy URL"
              className="text-muted-foreground hover:text-foreground"
            >
              <span className="material-icons text-base">
                {copied ? 'check' : 'content_copy'}
              </span>
            </button>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 font-mono">
            secret …{r.secretLast4 ?? '----'}
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-wrap gap-1 max-w-[20ch]">
            {r.events.length === 0 ? (
              <span className="text-xs text-muted-foreground">all</span>
            ) : (
              r.events.slice(0, 3).map((e) => (
                <span
                  key={e}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground font-mono"
                >
                  {e}
                </span>
              ))
            )}
            {r.events.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{r.events.length - 3}</span>
            )}
          </div>
        </td>
        <td className="px-3 py-3">
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
              r.enabled
                ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <span className="material-icons text-sm">
              {r.enabled ? 'check_circle' : 'pause_circle'}
            </span>
            {r.enabled ? 'Enabled' : 'Disabled'}
          </span>
          {r.failing && (
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-destructive">
              <span className="material-icons text-sm">error</span>
              Failing
            </div>
          )}
        </td>
        <td className="px-3 py-3">
          <div className="text-xs text-foreground">{formatRelative(r.lastDeliveryAt)}</div>
          <div className="text-[11px] text-muted-foreground font-mono">
            HTTP {formatStatus(r.lastStatus)}
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={onRotate}
              disabled={rotating}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50 transition-colors"
              title="Generate a new HMAC signing secret"
            >
              <span className="material-icons text-sm">key</span>
              {rotating ? 'Rotating…' : 'Rotate secret'}
            </button>
            <button
              type="button"
              onClick={onToggleDeliveries}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
            >
              <span className="material-icons text-sm">{isOpen ? 'expand_less' : 'history'}</span>
              {isOpen ? 'Hide' : 'Deliveries'}
            </button>
          </div>
        </td>
      </tr>

      {(rotated || error) && (
        <tr className="border-t border-border bg-muted/30">
          <td colSpan={6} className="px-3 py-3">
            {rotated && (
              <div className="border border-amber-500/40 bg-amber-500/10 rounded-md p-3 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
                  <span className="material-icons text-base">warning</span>
                  New signing secret — copy it now. We never display it again.
                </div>
                <code className="block mt-2 p-2 rounded bg-background border border-border font-mono break-all">
                  {rotated}
                </code>
              </div>
            )}
            {error && (
              <div className="text-xs text-destructive flex items-center gap-1.5">
                <span className="material-icons text-base">error</span>
                {error}
              </div>
            )}
          </td>
        </tr>
      )}

      {isOpen && (
        <tr className="border-t border-border bg-muted/20">
          <td colSpan={6} className="px-3 py-3">
            <DeliveriesPanel hasLog={r.hasDeliveryLog} deliveries={deliveries} />
          </td>
        </tr>
      )}
    </>
  );
}

function DeliveriesPanel({
  hasLog,
  deliveries,
}: {
  hasLog: boolean;
  deliveries: DeliveryRow[] | 'loading' | 'error' | undefined;
}) {
  if (!hasLog) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        <span className="material-icons text-base">info</span>
        Delivery log is not yet recorded for this source. {/* TODO: wire survey + site delivery
        history once those tables are added. */}
      </div>
    );
  }
  if (deliveries === 'loading' || deliveries === undefined) {
    return <div className="text-xs text-muted-foreground">Loading deliveries…</div>;
  }
  if (deliveries === 'error') {
    return <div className="text-xs text-destructive">Failed to load deliveries.</div>;
  }
  if (deliveries.length === 0) {
    return <div className="text-xs text-muted-foreground">No delivery attempts recorded yet.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 pr-3 font-medium">When</th>
            <th className="py-1 pr-3 font-medium">Event</th>
            <th className="py-1 pr-3 font-medium">Status</th>
            <th className="py-1 font-medium">Error</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id} className="border-t border-border/60">
              <td className="py-1 pr-3 text-muted-foreground whitespace-nowrap">
                {new Date(d.createdAt).toLocaleString()}
              </td>
              <td className="py-1 pr-3 font-mono text-foreground">{d.event}</td>
              <td className="py-1 pr-3 font-mono">
                <span
                  className={
                    d.status !== null && d.status >= 200 && d.status < 300
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-destructive'
                  }
                >
                  {formatStatus(d.status)}
                </span>
              </td>
              <td className="py-1 text-destructive truncate max-w-[40ch]">{d.error ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
