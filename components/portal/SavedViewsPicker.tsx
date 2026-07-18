'use client';

import { useEffect, useState } from 'react';

interface SavedView {
  id: number;
  name: string;
  scope: string;
  userId: number | null;
  filterJson: Record<string, unknown>;
  isDefault: boolean;
}

interface Props<T extends Record<string, unknown>> {
  projectId: number;
  scope: 'backlog' | 'board' | 'reports';
  /** The current filter state to capture when saving a new view. */
  currentFilter: T;
  /** Called when the user picks a saved view; receives the stored filter shape. */
  onApply: (filter: T) => void;
  /** True when the caller has editor+ permission (allows saving shared views). */
  canShare?: boolean;
}

export default function SavedViewsPicker<T extends Record<string, unknown>>({ projectId, scope, currentFilter, onApply, canShare = false }: Props<T>) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newShared, setNewShared] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/portal/projects/${projectId}/saved-views?scope=${scope}`);
    const data = await res.json();
    if (data.success) setViews(data.data);
  };

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/portal/projects/${projectId}/saved-views?scope=${scope}`);
      const data = await res.json();
      if (data.success) setViews(data.data);
    })();
  }, [projectId, scope]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/saved-views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          scope,
          filterJson: currentFilter,
          shared: newShared,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowSaveForm(false);
        setNewName('');
        setNewShared(false);
        await load();
        setActiveId(data.data.id);
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (viewId: number) => {
    if (!confirm('Delete this view?')) return;
    const res = await fetch(`/api/portal/saved-views/${viewId}`, { method: 'DELETE' });
    if ((await res.json()).success) {
      if (activeId === viewId) setActiveId(null);
      await load();
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={activeId ?? ''}
        onChange={e => {
          const id = e.target.value === '' ? null : parseInt(e.target.value, 10);
          setActiveId(id);
          if (id != null) {
            const v = views.find(x => x.id === id);
            if (v) onApply(v.filterJson as T);
          }
        }}
        className="px-3 py-1.5 rounded border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <option value="">No view</option>
        {views.map(v => (
          <option key={v.id} value={v.id}>
            {v.userId === null ? '🌐 ' : ''}{v.name}
          </option>
        ))}
      </select>

      {activeId != null && views.find(v => v.id === activeId) && (
        <button
          onClick={() => onDelete(activeId)}
          className="text-xs text-muted-foreground hover:text-destructive"
          title="Delete view"
        >
          <span className="material-icons text-sm">delete_outline</span>
        </button>
      )}

      <button
        onClick={() => setShowSaveForm(v => !v)}
        className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium border border-border text-muted-foreground hover:bg-accent"
      >
        <span className="material-icons text-sm">{showSaveForm ? 'close' : 'bookmark_add'}</span>
        {showSaveForm ? 'Cancel' : 'Save view'}
      </button>

      {showSaveForm && (
        <form onSubmit={onSave} className="flex items-center gap-2 ml-2">
          <input
            type="text"
            required
            placeholder="View name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="px-2 py-1 rounded border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 w-44"
          />
          {canShare && (
            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={newShared} onChange={e => setNewShared(e.target.checked)} className="accent-primary" />
              Share with team
            </label>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? '…' : 'Save'}
          </button>
        </form>
      )}
    </div>
  );
}
