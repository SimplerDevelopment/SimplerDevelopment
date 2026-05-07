'use client';

// Site snapshots — list, create, import, download, delete.
// Snapshots are clone-able exports of an entire client website (blocks +
// posts + nav + custom code + post types). See lib/snapshots/* for the
// export/import mechanics.

import { useCallback, useEffect, useState } from 'react';

type Snapshot = {
  id: number;
  name: string;
  description: string | null;
  sourceSiteId: number | null;
  version: number;
  isPublic: boolean;
  createdAt: string;
};

type Website = {
  id: number;
  name: string;
};

export default function PortalSnapshotsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createSiteId, setCreateSiteId] = useState<number | ''>('');
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [importingForSnapshot, setImportingForSnapshot] = useState<Snapshot | null>(null);
  const [importTargetSiteId, setImportTargetSiteId] = useState<number | 'new'>('new');
  const [importNewName, setImportNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [snapRes, siteRes] = await Promise.all([
        fetch('/api/portal/snapshots').then((r) => r.json()),
        fetch('/api/portal/cms/websites').then((r) => r.json()),
      ]);
      if (snapRes.success) setSnapshots(snapRes.data);
      if (siteRes.success) setWebsites(siteRes.data);
    } catch (err) {
      console.error('Failed to fetch snapshots', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function flashSuccess(message: string) {
    setFlash({ kind: 'success', message });
    window.setTimeout(() => setFlash(null), 4000);
  }
  function flashError(message: string) {
    setFlash({ kind: 'error', message });
    window.setTimeout(() => setFlash(null), 6000);
  }

  async function handleCreate() {
    if (!createSiteId) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/portal/sites/${createSiteId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim() || undefined,
          description: createDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        flashError(data.message || 'Export failed');
        return;
      }
      flashSuccess('Snapshot created');
      setShowCreate(false);
      setCreateSiteId('');
      setCreateName('');
      setCreateDescription('');
      await fetchData();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this snapshot? This cannot be undone.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/snapshots/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        flashError(data.message || 'Delete failed');
        return;
      }
      flashSuccess('Snapshot deleted');
      await fetchData();
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!importingForSnapshot) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (importTargetSiteId === 'new') {
        body.createNewSite = true;
        if (importNewName.trim()) body.newSiteName = importNewName.trim();
      } else {
        body.siteId = importTargetSiteId;
      }
      const res = await fetch(`/api/portal/snapshots/${importingForSnapshot.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        flashError(data.message || 'Import failed');
        return;
      }
      const conflictCount = data.data?.conflicts?.length ?? 0;
      flashSuccess(
        `Imported ${data.data?.postsCreated ?? 0} posts into site #${data.data?.siteId}` +
          (conflictCount > 0 ? ` (${conflictCount} slug conflicts resolved)` : ''),
      );
      setImportingForSnapshot(null);
      setImportTargetSiteId('new');
      setImportNewName('');
      await fetchData();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading snapshots...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Site snapshots</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Clone configured websites — export blocks, posts, navigation, custom code,
            and post types as a portable bundle, then import into a new or existing site.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
        >
          <span className="material-icons text-base">add</span>
          Create snapshot
        </button>
      </div>

      {flash && (
        <div
          className={`flex items-center gap-2 p-3 rounded-md text-sm border ${
            flash.kind === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
          }`}
        >
          <span className="material-icons text-base">
            {flash.kind === 'success' ? 'check_circle' : 'error'}
          </span>
          {flash.message}
        </div>
      )}

      {showCreate && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Create snapshot from a site</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Source site</label>
              <select
                value={createSiteId}
                onChange={(e) => setCreateSiteId(e.target.value ? parseInt(e.target.value, 10) : '')}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">— Select a site —</option>
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Snapshot name (optional)</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Acme Marketing Site v1"
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description (optional)</label>
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!createSiteId || creating}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create snapshot'}
            </button>
          </div>
        </div>
      )}

      {snapshots.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-lg">
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">photo_library</span>
          <p className="text-muted-foreground text-sm">No snapshots yet.</p>
          <p className="text-muted-foreground text-xs mt-1">Create your first to clone a site.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Name</th>
                <th className="text-left font-medium px-4 py-2.5">Source site</th>
                <th className="text-left font-medium px-4 py-2.5">Created</th>
                <th className="text-right font-medium px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => {
                const source = s.sourceSiteId
                  ? websites.find((w) => w.id === s.sourceSiteId)?.name ?? `Site #${s.sourceSiteId}`
                  : 'Uploaded';
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{s.name}</div>
                      {s.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{s.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{source}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <a
                          href={`/api/portal/snapshots/${s.id}/download`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-foreground hover:bg-accent"
                          title="Download JSON"
                        >
                          <span className="material-icons text-base">download</span>
                          Download
                        </a>
                        <button
                          onClick={() => {
                            setImportingForSnapshot(s);
                            setImportTargetSiteId('new');
                            setImportNewName(s.name);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-foreground hover:bg-accent"
                          title="Import this snapshot"
                          disabled={busy}
                        >
                          <span className="material-icons text-base">file_download</span>
                          Import
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Delete snapshot"
                          disabled={busy}
                        >
                          <span className="material-icons text-base">delete</span>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {importingForSnapshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setImportingForSnapshot(null)}
        >
          <div
            className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-semibold text-foreground">Import snapshot</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Apply <span className="font-medium text-foreground">{importingForSnapshot.name}</span> to a site.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Target</label>
              <select
                value={importTargetSiteId === 'new' ? 'new' : String(importTargetSiteId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setImportTargetSiteId(v === 'new' ? 'new' : parseInt(v, 10));
                }}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="new">— Create a new site —</option>
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>{w.name} (overlay)</option>
                ))}
              </select>
            </div>
            {importTargetSiteId === 'new' && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">New site name</label>
                <input
                  type="text"
                  value={importNewName}
                  onChange={(e) => setImportNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
            {importTargetSiteId !== 'new' && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200 text-xs">
                <span className="material-icons text-base">warning</span>
                <span>
                  Posts with conflicting slugs will be suffixed <code>-imported-N</code>. Existing
                  navigation will be replaced. Existing posts are kept.
                </span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setImportingForSnapshot(null)}
                disabled={busy}
                className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={busy}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
