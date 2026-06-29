'use client';

import { useEffect, useState } from 'react';

type Kind = 'went_well' | 'went_poorly' | 'action_item';

interface RetroItem {
  id: number;
  kind: Kind;
  text: string;
  votes: number;
  authorUserId: number | null;
  authorName: string | null;
  promotedCardId: number | null;
  createdAt: string;
}

interface RetroData {
  retro: { id: number; sprintId: number; status: string } | null;
  items: Record<Kind, RetroItem[]>;
}

const COLUMN_META: Record<Kind, { label: string; icon: string; color: string }> = {
  went_well:    { label: 'Went well',    icon: 'sentiment_satisfied',     color: 'text-emerald-600' },
  went_poorly:  { label: 'Went poorly',  icon: 'sentiment_dissatisfied',  color: 'text-rose-600' },
  action_item:  { label: 'Action items', icon: 'checklist',               color: 'text-amber-600' },
};

const KINDS: Kind[] = ['went_well', 'went_poorly', 'action_item'];

export default function SprintRetroPanel({ sprintId, sprintName }: { sprintId: number; sprintName: string }) {
  const [data, setData] = useState<RetroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<Kind, string>>({ went_well: '', went_poorly: '', action_item: '' });
  const [creatingRetro, setCreatingRetro] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/portal/sprints/${sprintId}/retro`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [sprintId]);

  const onCreateRetro = async () => {
    setCreatingRetro(true);
    try {
      const res = await fetch(`/api/portal/sprints/${sprintId}/retro`, { method: 'POST' });
      if ((await res.json()).success) await load();
    } finally {
      setCreatingRetro(false);
    }
  };

  const onAddItem = async (kind: Kind, e: React.FormEvent) => {
    e.preventDefault();
    const text = drafts[kind].trim();
    if (!text || !data?.retro) return;
    const res = await fetch(`/api/portal/retros/${data.retro.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, text }),
    });
    if ((await res.json()).success) {
      setDrafts(d => ({ ...d, [kind]: '' }));
      await load();
    }
  };

  const onVote = async (itemId: number) => {
    await fetch(`/api/portal/retro-items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote: 1 }),
    });
    await load();
  };

  const onDelete = async (itemId: number) => {
    if (!confirm('Delete this item?')) return;
    await fetch(`/api/portal/retro-items/${itemId}`, { method: 'DELETE' });
    await load();
  };

  if (loading) {
    return <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">Loading retro…</div>;
  }

  if (!data?.retro) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center">
        <span className="material-icons text-5xl text-muted-foreground">forum</span>
        <h3 className="mt-3 font-semibold text-foreground">Retro for {sprintName}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Capture what went well, what went poorly, and the action items the team commits to.</p>
        <button
          onClick={onCreateRetro}
          disabled={creatingRetro}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          <span className="material-icons text-base">add</span>
          {creatingRetro ? 'Starting…' : 'Start retro'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Retro · {sprintName}</h3>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${data.retro.status === 'closed' ? 'bg-muted text-muted-foreground' : 'bg-emerald-100 text-emerald-700'}`}>
          {data.retro.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {KINDS.map(kind => {
          const meta = COLUMN_META[kind];
          const items = data.items[kind] ?? [];
          return (
            <div key={kind} className="bg-card border border-border rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <span className={`material-icons text-base ${meta.color}`}>{meta.icon}</span>
                <h4 className="text-sm font-semibold text-foreground">{meta.label}</h4>
                <span className="text-xs text-muted-foreground">({items.length})</span>
              </div>

              <form onSubmit={e => onAddItem(kind, e)} className="space-y-1.5">
                <textarea
                  rows={2}
                  value={drafts[kind]}
                  onChange={e => setDrafts(d => ({ ...d, [kind]: e.target.value }))}
                  placeholder={`Add a ${meta.label.toLowerCase()} item…`}
                  className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
                <button
                  type="submit"
                  disabled={!drafts[kind].trim()}
                  className="w-full px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-30"
                >
                  Add
                </button>
              </form>

              <div className="space-y-1.5 pt-2 border-t border-border">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No items yet.</p>
                ) : (
                  items.map(it => (
                    <div key={it.id} className="bg-background border border-border rounded-lg p-2">
                      <p className="text-xs text-foreground whitespace-pre-wrap">{it.text}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-muted-foreground">
                          {it.authorName ?? 'Anonymous'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onVote(it.id)}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                            title="Upvote"
                          >
                            <span className="material-icons text-xs">thumb_up</span>
                            <span className="font-semibold text-foreground">{it.votes}</span>
                          </button>
                          <button
                            onClick={() => onDelete(it.id)}
                            className="text-[10px] text-muted-foreground hover:text-destructive"
                            title="Delete"
                          >
                            <span className="material-icons text-xs">close</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
