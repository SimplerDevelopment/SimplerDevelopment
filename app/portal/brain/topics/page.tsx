'use client';

/**
 * Brain topics admin — tree management + tag-import wizard.
 *
 * Layout:
 *   ┌────────────────────────────────────┬───────────────────────┐
 *   │  Topics (tree, drag-drop)          │  Side panel: details  │
 *   │   - rename inline                  │   - breadcrumb        │
 *   │   - new child                      │   - name / desc       │
 *   │   - merge into picker              │   - color + icon      │
 *   │   - delete (force? checkbox)       │   - attached entities │
 *   │                                    │   - delete            │
 *   └────────────────────────────────────┴───────────────────────┘
 *
 * Tag-import wizard mints topics from existing `brain_notes.tags`, attaching
 * notes to the resulting leaf topic. Step 1 = dry-run preview, step 2 =
 * confirm + actual write.
 *
 * Wave 3b — see .planning/brain-restructure/PLAN.md.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import TopicTree from '@/components/brain/TopicTree';
import type {
  BrainTopicTreeNode,
  BrainTopicWithBreadcrumb,
  ImportTopicsFromTagsReport,
  BrainTopic,
} from '@/lib/brain/topics';

interface TopicEntityRow {
  entityType: 'note' | 'meeting' | 'task' | 'decision' | 'relationship_overlay';
  entityId: number;
  title: string;
}

interface TopicEntitiesResponse {
  items: TopicEntityRow[];
  byType: Record<TopicEntityRow['entityType'], TopicEntityRow[]>;
}

const ENTITY_TYPE_LABELS: Record<TopicEntityRow['entityType'], string> = {
  note: 'Notes',
  meeting: 'Meetings',
  task: 'Tasks',
  decision: 'Decisions',
  relationship_overlay: 'Relationship overlays',
};

const ENTITY_TYPE_ICONS: Record<TopicEntityRow['entityType'], string> = {
  note: 'sticky_note_2',
  meeting: 'event',
  task: 'check_circle',
  decision: 'gavel',
  relationship_overlay: 'people',
};

export default function BrainTopicsAdminPage() {
  const [tree, setTree] = useState<BrainTopicTreeNode[]>([]);
  const [flat, setFlat] = useState<Array<{ id: number; name: string; path: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createRoot, setCreateRoot] = useState(false);
  const [createRootValue, setCreateRootValue] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [treeR, flatR] = await Promise.all([
        fetch('/api/portal/brain/topics?as=tree'),
        fetch('/api/portal/brain/topics?as=flat'),
      ]);
      const treeJson = await treeR.json().catch(() => ({}));
      const flatJson = await flatR.json().catch(() => ({}));
      if (!treeR.ok || !treeJson.success) {
        throw new Error(treeJson?.message || `Failed to load tree (${treeR.status})`);
      }
      setTree(treeJson.data?.tree ?? []);
      if (flatR.ok && flatJson.success) {
        const items: BrainTopic[] = flatJson.data?.items ?? [];
        setFlat(items.map((t) => ({ id: t.id, name: t.name, path: t.path })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const totalTopics = useMemo(() => flat.length, [flat]);

  // ── mutation handlers ───────────────────────────────────────────────
  const handleMove = useCallback(async (sourceId: number, newParentId: number | null) => {
    setError(null);
    const r = await fetch(`/api/portal/brain/topics/${sourceId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newParentId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      setError(json?.message || `Move failed (${r.status}).`);
      return;
    }
    await reload();
  }, [reload]);

  const handleRename = useCallback(async (id: number, newName: string) => {
    setError(null);
    const r = await fetch(`/api/portal/brain/topics/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      setError(json?.message || `Rename failed (${r.status}).`);
      return;
    }
    await reload();
  }, [reload]);

  const handleDelete = useCallback(async (id: number, opts: { force: boolean }) => {
    setError(null);
    const qs = opts.force ? '?force=true' : '';
    const r = await fetch(`/api/portal/brain/topics/${id}${qs}`, { method: 'DELETE' });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      setError(json?.message || `Delete failed (${r.status}).`);
      return;
    }
    if (selectedId === id) setSelectedId(null);
    await reload();
  }, [reload, selectedId]);

  const handleMerge = useCallback(async (sourceId: number, targetId: number) => {
    setError(null);
    const r = await fetch(`/api/portal/brain/topics/${sourceId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetTopicId: targetId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      setError(json?.message || `Merge failed (${r.status}).`);
      return;
    }
    if (selectedId === sourceId) setSelectedId(targetId);
    await reload();
  }, [reload, selectedId]);

  const handleCreateChild = useCallback(async (parentId: number | null, name: string) => {
    setError(null);
    const r = await fetch('/api/portal/brain/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      setError(json?.message || `Create failed (${r.status}).`);
      return;
    }
    await reload();
  }, [reload]);

  const handleCreateRoot = useCallback(async () => {
    const name = createRootValue.trim();
    setCreateRoot(false);
    setCreateRootValue('');
    if (!name) return;
    await handleCreateChild(null, name);
  }, [createRootValue, handleCreateChild]);

  // Side-panel selection.
  const handleSelectFromTree = useCallback((node: BrainTopicTreeNode) => {
    setSelectedId(node.id);
  }, []);

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">account_tree</span>
            Topics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {loading
              ? 'Loading…'
              : `${totalTopics} ${totalTopics === 1 ? 'topic' : 'topics'} · drag to reorganize`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setCreateRoot(true); setCreateRootValue(''); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">add</span>
            New topic
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
          >
            <span className="material-icons text-base">file_download</span>
            Import from tags
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <span className="material-icons text-base">error_outline</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: tree */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span className="material-icons text-sm">account_tree</span>
            Topic tree
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <span className="material-icons animate-spin mr-2 align-middle">progress_activity</span>
              Loading topics…
            </div>
          ) : (
            <div className="py-2">
              {createRoot && (
                <div className="px-3 py-1.5 flex items-center gap-2 border-b border-border/40">
                  <span className="material-icons text-base text-muted-foreground">add</span>
                  <input
                    type="text"
                    autoFocus
                    value={createRootValue}
                    onChange={(e) => setCreateRootValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateRoot();
                      else if (e.key === 'Escape') { setCreateRoot(false); setCreateRootValue(''); }
                    }}
                    onBlur={handleCreateRoot}
                    placeholder="New root topic name…"
                    className="flex-1 px-2 py-1 text-sm rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              )}
              {tree.length === 0 && !createRoot ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <span className="material-icons text-3xl text-muted-foreground/50 block mb-2">account_tree</span>
                  <p className="mb-3">No topics yet.</p>
                  <button
                    type="button"
                    onClick={() => { setCreateRoot(true); setCreateRootValue(''); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90"
                  >
                    <span className="material-icons text-sm">add</span>
                    Create your first topic
                  </button>
                  <p className="mt-2 text-xs">
                    Or{' '}
                    <button
                      type="button"
                      onClick={() => setImportOpen(true)}
                      className="underline text-primary hover:opacity-80"
                    >
                      import from existing tags
                    </button>
                    .
                  </p>
                </div>
              ) : (
                <TopicTree
                  tree={tree}
                  selectedTopicId={selectedId}
                  onSelect={handleSelectFromTree}
                  enableDragDrop
                  showEntityCounts
                  onMove={handleMove}
                  onRename={handleRename}
                  onDelete={handleDelete}
                  onMerge={handleMerge}
                  onCreateChild={handleCreateChild}
                  allTopics={flat}
                />
              )}
            </div>
          )}
        </div>

        {/* Right: details */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {selectedId == null ? (
            <div className="p-8 text-center">
              <span className="material-icons text-3xl text-muted-foreground/50 block mb-2">account_tree</span>
              <p className="text-sm text-muted-foreground">
                Select a topic to see its details, or drag rows to reorganize your tree.
              </p>
            </div>
          ) : (
            <TopicDetailPanel
              topicId={selectedId}
              onUpdate={async (patch) => {
                setError(null);
                const r = await fetch(`/api/portal/brain/topics/${selectedId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(patch),
                });
                const json = await r.json().catch(() => ({}));
                if (!r.ok || !json.success) {
                  setError(json?.message || `Update failed (${r.status}).`);
                  return false;
                }
                await reload();
                return true;
              }}
              onDelete={async () => {
                if (!selectedId) return;
                await handleDelete(selectedId, { force: false });
              }}
            />
          )}
        </div>
      </div>

      {importOpen && (
        <ImportFromTagsWizard
          onClose={() => setImportOpen(false)}
          onDone={async () => {
            setImportOpen(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

// ─── Detail panel ──────────────────────────────────────────────────────

function TopicDetailPanel({
  topicId,
  onUpdate,
  onDelete,
}: {
  topicId: number;
  onUpdate: (patch: { name?: string; description?: string | null; color?: string | null; icon?: string | null }) => Promise<boolean>;
  onDelete: () => Promise<void>;
}) {
  const [topic, setTopic] = useState<BrainTopicWithBreadcrumb | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entities, setEntities] = useState<TopicEntitiesResponse | null>(null);
  const [entitiesLoading, setEntitiesLoading] = useState(false);

  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [colorDraft, setColorDraft] = useState('');
  const [iconDraft, setIconDraft] = useState('');
  const [saving, setSaving] = useState<null | 'name' | 'desc' | 'color' | 'icon'>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/portal/brain/topics/${topicId}`)
      .then((r) => r.json().catch(() => ({})))
      .then((json) => {
        if (cancelled) return;
        if (!json?.success) {
          setError(json?.message || 'Failed to load topic.');
          return;
        }
        const t = json.data as BrainTopicWithBreadcrumb;
        setTopic(t);
        setNameDraft(t.name);
        setDescDraft(t.description ?? '');
        setColorDraft(t.color ?? '');
        setIconDraft(t.icon ?? '');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Network error');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [topicId]);

  useEffect(() => {
    let cancelled = false;
    setEntitiesLoading(true);
    fetch(`/api/portal/brain/topics/${topicId}/entities`)
      .then((r) => r.json().catch(() => ({})))
      .then((json) => {
        if (cancelled) return;
        if (json?.success) setEntities(json.data as TopicEntitiesResponse);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setEntitiesLoading(false); });
    return () => { cancelled = true; };
  }, [topicId]);

  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <span className="material-icons animate-spin mr-2 align-middle">progress_activity</span>
        Loading…
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="p-6 text-center text-sm">
        <div className="bg-destructive/10 border border-destructive/30 rounded p-3 text-destructive">
          <span className="material-icons text-base align-middle mr-1">error_outline</span>
          {error ?? 'Topic not found.'}
        </div>
      </div>
    );
  }

  const breadcrumb = topic.breadcrumb;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border space-y-1">
        {breadcrumb.length > 0 && (
          <nav className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
            {breadcrumb.map((b, i) => (
              <span key={b.id} className="inline-flex items-center gap-1">
                {i > 0 && <span className="material-icons text-[12px]">chevron_right</span>}
                <span>{b.name}</span>
              </span>
            ))}
            <span className="material-icons text-[12px]">chevron_right</span>
          </nav>
        )}
        <div className="flex items-center gap-2">
          <span
            className="material-icons text-xl"
            style={topic.color ? { color: topic.color } : undefined}
          >
            {topic.icon || 'sell'}
          </span>
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={async () => {
              if (nameDraft.trim() === topic.name) return;
              setSaving('name');
              const ok = await onUpdate({ name: nameDraft.trim() });
              setSaving(null);
              if (!ok) setNameDraft(topic.name);
            }}
            className="flex-1 min-w-0 text-base font-semibold bg-transparent border-0 px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded"
          />
          {saving === 'name' && <span className="material-icons text-sm animate-spin text-muted-foreground">progress_activity</span>}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono">{topic.path}</div>
      </div>

      <div className="px-4 py-3 space-y-3 text-sm flex-1 overflow-y-auto">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">Description</label>
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={async () => {
              const nextRaw = descDraft.trim();
              const nextValue = nextRaw ? nextRaw : null;
              if (nextValue === (topic.description ?? null)) return;
              setSaving('desc');
              const ok = await onUpdate({ description: nextValue });
              setSaving(null);
              if (!ok) setDescDraft(topic.description ?? '');
            }}
            rows={3}
            placeholder="Optional — what does this topic cover?"
            className="w-full px-2 py-1.5 text-sm rounded border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
          {saving === 'desc' && <div className="text-[10px] text-muted-foreground mt-1"><span className="material-icons text-sm animate-spin align-middle">progress_activity</span> Saving…</div>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Color</label>
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={colorDraft || '#888888'}
                onChange={(e) => setColorDraft(e.target.value)}
                onBlur={async () => {
                  const next = colorDraft || null;
                  if (next === (topic.color ?? null)) return;
                  setSaving('color');
                  const ok = await onUpdate({ color: next });
                  setSaving(null);
                  if (!ok) setColorDraft(topic.color ?? '');
                }}
                className="h-8 w-12 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={colorDraft}
                onChange={(e) => setColorDraft(e.target.value)}
                onBlur={async () => {
                  const next = colorDraft.trim() || null;
                  if (next === (topic.color ?? null)) return;
                  setSaving('color');
                  const ok = await onUpdate({ color: next });
                  setSaving(null);
                  if (!ok) setColorDraft(topic.color ?? '');
                }}
                placeholder="#06b6d4"
                className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-border bg-background focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Icon</label>
            <input
              type="text"
              value={iconDraft}
              onChange={(e) => setIconDraft(e.target.value)}
              onBlur={async () => {
                const next = iconDraft.trim() || null;
                if (next === (topic.icon ?? null)) return;
                setSaving('icon');
                const ok = await onUpdate({ icon: next });
                setSaving(null);
                if (!ok) setIconDraft(topic.icon ?? '');
              }}
              placeholder="folder, sell, label…"
              className="w-full px-2 py-1 text-xs rounded border border-border bg-background focus:outline-none"
            />
            <div className="text-[10px] text-muted-foreground mt-0.5">Material Icons name</div>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <span className="material-icons text-sm">attach_file</span>
            Entities attached
            {entitiesLoading && <span className="material-icons text-sm animate-spin">progress_activity</span>}
          </div>
          {entities && entities.items.length === 0 && !entitiesLoading && (
            <div className="text-xs text-muted-foreground italic px-1 py-2">No entities attached yet.</div>
          )}
          {entities && entities.items.length > 0 && (
            <div className="space-y-3">
              {(Object.keys(entities.byType) as Array<TopicEntityRow['entityType']>)
                .filter((k) => entities.byType[k].length > 0)
                .map((k) => (
                  <div key={k}>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
                      <span className="material-icons text-sm">{ENTITY_TYPE_ICONS[k]}</span>
                      <span>{ENTITY_TYPE_LABELS[k]}</span>
                      <span className="ml-auto font-mono normal-case tracking-normal">{entities.byType[k].length}</span>
                    </div>
                    <ul className="space-y-0.5">
                      {entities.byType[k].slice(0, 50).map((row) => (
                        <li key={`${k}-${row.entityId}`} className="text-xs text-foreground px-1 py-0.5 rounded hover:bg-accent/60 truncate" title={row.title}>
                          {row.title}
                        </li>
                      ))}
                      {entities.byType[k].length > 50 && (
                        <li className="text-[11px] text-muted-foreground italic px-1">
                          …and {entities.byType[k].length - 50} more
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border flex items-center justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded border border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <span className="material-icons text-sm">delete</span>
          Delete topic
        </button>
      </div>
    </div>
  );
}

// ─── Import wizard ─────────────────────────────────────────────────────

function ImportFromTagsWizard({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [step, setStep] = useState<'preview' | 'confirm' | 'done'>('preview');
  const [tagPrefix, setTagPrefix] = useState('');
  const [report, setReport] = useState<ImportTopicsFromTagsReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runImport = useCallback(async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/topics/import-from-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagPrefix: tagPrefix.trim() || undefined,
          dryRun,
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json?.message || `Import failed (${r.status}).`);
        return;
      }
      setReport(json.data as ImportTopicsFromTagsReport);
      if (!dryRun) setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }, [tagPrefix]);

  // Auto-run dry-run on mount.
  useEffect(() => {
    runImport(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={() => !busy && onClose()} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl rounded-lg border border-border bg-popover shadow-xl flex flex-col max-h-[85vh]">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <span className="material-icons text-base text-primary">file_download</span>
            <h3 className="text-base font-semibold flex-1">Import topics from tags</h3>
            <button
              type="button"
              onClick={() => !busy && onClose()}
              disabled={busy}
              className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-accent disabled:opacity-50"
              aria-label="Close"
            >
              <span className="material-icons text-base">close</span>
            </button>
          </div>

          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Tag prefix (optional)</label>
            <input
              type="text"
              value={tagPrefix}
              onChange={(e) => setTagPrefix(e.target.value)}
              placeholder="e.g. kb (leave empty for all)"
              disabled={busy}
              className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background"
            />
            <button
              type="button"
              onClick={() => runImport(true)}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-50"
            >
              {busy && step === 'preview' ? (
                <span className="material-icons text-sm animate-spin">progress_activity</span>
              ) : (
                <span className="material-icons text-sm">refresh</span>
              )}
              Preview
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 rounded p-2 text-xs text-destructive">
                <span className="material-icons text-sm align-middle mr-1">error_outline</span>
                {error}
              </div>
            )}

            {step === 'done' && report ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-3 text-sm text-emerald-700 dark:text-emerald-300">
                <div className="font-medium mb-1 flex items-center gap-1">
                  <span className="material-icons text-base">check_circle</span>
                  Import complete
                </div>
                <p className="text-xs">
                  Created {report.topicsCreated} {report.topicsCreated === 1 ? 'topic' : 'topics'} and attached{' '}
                  {report.notesAttached} {report.notesAttached === 1 ? 'note' : 'notes'}.
                </p>
              </div>
            ) : !report ? (
              <div className="text-center py-8 text-muted-foreground">
                <span className="material-icons animate-spin mr-2 align-middle">progress_activity</span>
                Building preview…
              </div>
            ) : (
              <>
                <div className="bg-muted/40 border border-border rounded p-3 text-xs">
                  <div className="font-medium text-foreground mb-1">Preview</div>
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">{report.topicsCreated}</strong>{' '}
                    {report.topicsCreated === 1 ? 'topic' : 'topics'} would be created (or matched if already
                    present), with{' '}
                    <strong className="text-foreground">{report.notesAttached}</strong> note attachments.
                    Re-running is safe — duplicates are skipped.
                  </p>
                </div>

                {report.perTopic.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground italic">
                    No tags to import {tagPrefix.trim() ? `under prefix "${tagPrefix.trim()}"` : ''}.
                  </div>
                )}

                {report.perTopic.length > 0 && (
                  <div className="border border-border rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="px-2 py-1 font-medium">Topic path</th>
                          <th className="px-2 py-1 font-medium text-right">Notes</th>
                          <th className="px-2 py-1 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.perTopic.map((row, i) => (
                          <tr key={i} className="border-t border-border/40">
                            <td className="px-2 py-1 font-mono text-[11px]">{row.path}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{row.noteCount}</td>
                            <td className="px-2 py-1">
                              <span className={`inline-flex items-center gap-1 ${
                                row.created ? 'text-primary' : 'text-muted-foreground'
                              }`}>
                                <span className="material-icons text-sm">
                                  {row.created ? 'add_circle' : 'check_circle'}
                                </span>
                                {row.created ? 'new' : 'exists'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
            {step === 'done' ? (
              <button
                type="button"
                onClick={onDone}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:opacity-90"
              >
                <span className="material-icons text-sm">done</span>
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm rounded border border-border hover:bg-accent disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('confirm'); runImport(false); }}
                  disabled={busy || !report || report.perTopic.length === 0}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy && step === 'confirm' ? (
                    <span className="material-icons text-sm animate-spin">progress_activity</span>
                  ) : (
                    <span className="material-icons text-sm">file_download</span>
                  )}
                  Run import
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
