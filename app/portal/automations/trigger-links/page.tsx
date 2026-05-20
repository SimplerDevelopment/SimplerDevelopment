'use client';

// Trigger Links — portal management UI. Tabular list with inline create form
// and a slide-out detail panel showing recent clicks for the selected row.
// All API calls go to /api/portal/trigger-links (auth + tenant scoping done
// server-side); we just render and forward.

import { useEffect, useMemo, useState } from 'react';

interface TriggerLink {
  id: number;
  slug: string;
  destinationUrl: string;
  label: string | null;
  contactFieldKey: string | null;
  createdAt: string;
  updatedAt: string;
  clickCount: number;
}

interface ClickRow {
  id: number;
  ip: string | null;
  userAgent: string | null;
  referer: string | null;
  occurredAt: string;
}

interface DetailResponse {
  link: TriggerLink;
  clickCount: number;
  recentClicks: ClickRow[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function PortalTriggerLinksPage() {
  const [links, setLinks] = useState<TriggerLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [destination, setDestination] = useState('');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const goOrigin = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}`;
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/trigger-links');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load');
      setLinks(data.data?.links ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/portal/trigger-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationUrl: destination,
          label: label || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Create failed');
      setDestination('');
      setLabel('');
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this trigger link? Past click history will also be removed.')) return;
    const res = await fetch(`/api/portal/trigger-links/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) {
      alert(data.error || 'Delete failed');
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
    }
    await refresh();
  }

  async function openDetail(id: number) {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/portal/trigger-links/${id}`);
      const data = await res.json();
      if (data.success) setDetail(data.data);
    } finally {
      setDetailLoading(false);
    }
  }

  function copySlug(slug: string) {
    const url = `${goOrigin}/go/${slug}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons">link</span>
            Trigger Links
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tracked shortlinks. Each visit to <code className="px-1 py-0.5 bg-muted rounded text-xs">/go/&lt;slug&gt;</code> is logged
            and can be used as an automation trigger.
          </p>
        </div>
      </header>

      <section className="mb-6 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-foreground mb-3">Create a new link</h2>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Destination URL</label>
            <input
              type="text"
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="https://example.com/landing-page"
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Spring promo"
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !destination}
            className="px-4 py-2 text-sm font-medium rounded bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 inline-flex items-center gap-1"
          >
            <span className="material-icons text-base">add_link</span>
            {creating ? 'Creating…' : 'Create link'}
          </button>
        </form>
        {createError && (
          <p role="alert" className="mt-2 text-sm text-destructive">{createError}</p>
        )}
      </section>

      {loading && (
        <div className="text-sm text-muted-foreground">Loading…</div>
      )}
      {error && (
        <div role="alert" className="text-sm text-destructive">{error}</div>
      )}

      {!loading && !error && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-sm min-w-[640px]" data-testid="trigger-links-table">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Slug</th>
                <th className="text-left px-4 py-2 font-medium">Destination</th>
                <th className="text-right px-4 py-2 font-medium">Clicks</th>
                <th className="text-left px-4 py-2 font-medium">Created</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-8">
                    No trigger links yet. Create one above.
                  </td>
                </tr>
              )}
              {links.map((link) => (
                <tr
                  key={link.id}
                  className={`border-t border-border hover:bg-accent/30 cursor-pointer ${selectedId === link.id ? 'bg-accent/40' : ''}`}
                  onClick={() => openDetail(link.id)}
                  data-testid={`trigger-link-row-${link.id}`}
                >
                  <td className="px-4 py-2">
                    <div className="font-mono text-xs">{link.slug}</div>
                    {link.label && <div className="text-xs text-muted-foreground">{link.label}</div>}
                  </td>
                  <td className="px-4 py-2 max-w-[280px] truncate text-muted-foreground">
                    {link.destinationUrl}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{link.clickCount}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {formatDate(link.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); copySlug(link.slug); }}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                      title="Copy /go URL"
                    >
                      <span className="material-icons text-base">content_copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(link.id); }}
                      className="inline-flex items-center gap-1 text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded"
                      title="Delete"
                    >
                      <span className="material-icons text-base">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {selectedId !== null && (
        <section className="mt-6 rounded-lg border border-border bg-card p-4" data-testid="trigger-link-detail">
          <header className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-base">analytics</span>
              Recent clicks
            </h2>
            <button
              type="button"
              onClick={() => { setSelectedId(null); setDetail(null); }}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <span className="material-icons text-base">close</span>
              Close
            </button>
          </header>
          {detailLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!detailLoading && detail && (
            <>
              <div className="text-xs text-muted-foreground mb-3">
                {detail.clickCount} total click{detail.clickCount === 1 ? '' : 's'}.
              </div>
              {detail.recentClicks.length === 0 ? (
                <div className="text-sm text-muted-foreground italic py-4">No clicks recorded yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left py-1 font-medium">When</th>
                        <th className="text-left py-1 font-medium">IP</th>
                        <th className="text-left py-1 font-medium">User-Agent</th>
                        <th className="text-left py-1 font-medium">Referer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recentClicks.map((c) => (
                        <tr key={c.id} className="border-t border-border">
                          <td className="py-1 pr-3 whitespace-nowrap">{formatDate(c.occurredAt)}</td>
                          <td className="py-1 pr-3 font-mono">{c.ip || '—'}</td>
                          <td className="py-1 pr-3 max-w-[280px] truncate">{c.userAgent || '—'}</td>
                          <td className="py-1 pr-3 max-w-[200px] truncate">{c.referer || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
