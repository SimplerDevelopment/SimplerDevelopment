'use client';

import { useEffect, useMemo, useState } from 'react';
import { CARD_TYPE_META, CARD_TYPE_OPTIONS } from './card-detail/_lib/agile';
import type { CardType, WorkflowState } from './card-detail/_lib/types';

interface BacklogCard {
  id: number;
  number: number | null;
  title: string;
  priority: string | null;
  sprintId: number | null;
  sprintOrder: number | null;
  storyPoints: number | null;
  cardType: CardType;
  parentCardId: number | null;
  workflowState: WorkflowState;
  columnId: number;
  columnName: string | null;
  columnIsDone: boolean | null;
}

interface SprintRef {
  id: number;
  name: string;
  status: 'planning' | 'active' | 'completed';
}

interface Props {
  projectId: number;
  projectKey: string | null;
  canEdit: boolean;
}

const KEY_OF = (projectKey: string | null, num: number | null) =>
  projectKey && num != null ? `${projectKey}-${num}` : null;

export default function BacklogTab({ projectId, projectKey, canEdit }: Props) {
  const [cards, setCards] = useState<BacklogCard[]>([]);
  const [sprints, setSprints] = useState<SprintRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<CardType | 'all'>('all');
  const [showOnlyEstimated, setShowOnlyEstimated] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/projects/${projectId}/sprints`);
      const data = await res.json();
      if (data.success) {
        setCards((data.data.backlog ?? []) as BacklogCard[]);
        setSprints(((data.data.sprints ?? []) as Array<{ id: number; name: string; status: SprintRef['status'] }>)
          .map(s => ({ id: s.id, name: s.name, status: s.status })));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const filtered = useMemo(() => cards.filter(c => {
    if (typeFilter !== 'all' && c.cardType !== typeFilter) return false;
    if (showOnlyEstimated && c.storyPoints == null) return false;
    return true;
  }), [cards, typeFilter, showOnlyEstimated]);

  const totalPoints = useMemo(
    () => filtered.reduce((sum, c) => sum + (c.storyPoints ?? 0), 0),
    [filtered],
  );
  const unsizedCount = useMemo(
    () => filtered.filter(c => c.storyPoints == null).length,
    [filtered],
  );

  const sendToSprint = async (cardId: number, sprintId: number) => {
    const res = await fetch(`/api/portal/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sprintId }),
    });
    if ((await res.json()).success) load();
  };

  const activeSprints = sprints.filter(s => s.status !== 'completed');

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Backlog</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cards that haven't been pulled into a sprint yet. {totalPoints} pts total
            {unsizedCount > 0 && <span className="text-amber-600"> · {unsizedCount} unsized</span>}.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
            typeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
          }`}
        >
          All
        </button>
        {CARD_TYPE_OPTIONS.map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 capitalize ${
              typeFilter === t ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            <span className={`material-icons text-sm ${typeFilter === t ? '' : CARD_TYPE_META[t].color}`}>{CARD_TYPE_META[t].icon}</span>
            {CARD_TYPE_META[t].label}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer ml-2">
          <input
            type="checkbox"
            checked={showOnlyEstimated}
            onChange={e => setShowOnlyEstimated(e.target.checked)}
            className="accent-primary"
          />
          Sized only
        </label>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="material-icons animate-spin text-primary">refresh</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">inbox</span>
          <h3 className="mt-4 font-semibold text-foreground">Backlog is empty</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Add cards on the Board, then refine and prioritize them here.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-8"></th>
                <th className="px-2 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">Key</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-16">Pts</th>
                <th className="px-2 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-28">Column</th>
                {canEdit && activeSprints.length > 0 && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider w-44">Send to sprint</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(c => {
                const meta = CARD_TYPE_META[c.cardType];
                const key = KEY_OF(projectKey, c.number);
                return (
                  <tr key={c.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-2">
                      <span className={`material-icons text-base ${meta.color}`} title={meta.label}>
                        {meta.icon}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{key ?? `#${c.id}`}</td>
                    <td className="px-2 py-2 text-foreground">{c.title}</td>
                    <td className="px-2 py-2">
                      {c.storyPoints == null ? (
                        <span className="text-xs text-amber-600">unsized</span>
                      ) : (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{c.storyPoints}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{c.columnName ?? '—'}</td>
                    {canEdit && activeSprints.length > 0 && (
                      <td className="px-4 py-2 text-right">
                        <select
                          defaultValue=""
                          onChange={e => {
                            const sid = parseInt(e.target.value, 10);
                            if (!Number.isNaN(sid)) sendToSprint(c.id, sid);
                            e.target.value = '';
                          }}
                          className="px-2 py-1 rounded border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                        >
                          <option value="">Send to…</option>
                          {activeSprints.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                          ))}
                        </select>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
