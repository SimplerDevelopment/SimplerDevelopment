'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface SprintRow {
  id: number;
  name: string;
  status: 'planning' | 'active' | 'completed';
  startDate: string | null;
  endDate: string | null;
  cards: Array<{
    id: number;
    number: number | null;
    title: string;
    dueDate: string | null;
    storyPoints: number | null;
    columnIsDone: boolean | null;
    cardType: string;
  }>;
}

const statusColor: Record<SprintRow['status'], string> = {
  planning: 'fill-amber-300/70',
  active: 'fill-primary',
  completed: 'fill-emerald-300/70',
};

export default function ProjectRoadmapTab({ projectId, projectKey }: { projectId: number; projectKey: string | null }) {
  const [sprints, setSprints] = useState<SprintRow[]>([]);
  const [backlogDueCount, setBacklogDueCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/portal/projects/${projectId}/sprints`)
      .then(r => r.json())
      .then(json => {
        if (cancelled || !json.success) return;
        const list: SprintRow[] = (json.data?.sprints ?? []).map((s: SprintRow) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          startDate: s.startDate,
          endDate: s.endDate,
          cards: (s.cards ?? []) as SprintRow['cards'],
        }));
        setSprints(list);
        const backlog: SprintRow['cards'] = json.data?.backlog ?? [];
        setBacklogDueCount(backlog.filter(c => c.dueDate).length);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const dated = sprints.filter(s => s.startDate && s.endDate);

  const range = useMemo(() => {
    if (dated.length === 0) return null;
    let min = Infinity, max = -Infinity;
    for (const s of dated) {
      const start = new Date(s.startDate!).getTime();
      const end = new Date(s.endDate!).getTime();
      if (start < min) min = start;
      if (end > max) max = end;
      for (const c of s.cards) {
        if (!c.dueDate) continue;
        const d = new Date(c.dueDate).getTime();
        if (d < min) min = d;
        if (d > max) max = d;
      }
    }
    if (min === Infinity || max === -Infinity || min === max) return null;
    return { min, max };
  }, [dated]);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><span className="material-icons animate-spin text-primary">refresh</span></div>;
  }

  if (dated.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <span className="material-icons text-5xl text-muted-foreground">timeline</span>
        <h3 className="mt-3 font-semibold text-foreground">No dated sprints yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">Set a startDate and endDate on sprints to plot them on the roadmap.</p>
      </div>
    );
  }

  const W = 1100;
  const ROW_H = 56;
  const PAD_X = 100;
  const totalH = dated.length * ROW_H + 60;
  const xAt = range ? (t: number) => PAD_X + ((t - range.min) / (range.max - range.min)) * (W - PAD_X - 16) : () => 0;

  // Month tick lines.
  const ticks: { t: number; label: string }[] = [];
  if (range) {
    const start = new Date(range.min);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    for (let d = new Date(start); d.getTime() <= range.max; d.setUTCMonth(d.getUTCMonth() + 1)) {
      ticks.push({ t: d.getTime(), label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
    }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Roadmap</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Sprints with start + end dates plotted on a single timeline. Card due-dates show as dots inside each sprint row.
          {backlogDueCount > 0 && <span className="text-amber-600"> · {backlogDueCount} backlog card{backlogDueCount === 1 ? '' : 's'} with due dates not yet pulled into a sprint.</span>}
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full h-auto" role="img" aria-label="Project roadmap">
          {/* Month grid */}
          {ticks.map((tk, i) => (
            <g key={`tick-${i}`}>
              <line x1={xAt(tk.t)} x2={xAt(tk.t)} y1={20} y2={totalH - 20} stroke="currentColor" strokeOpacity="0.08" />
              <text x={xAt(tk.t)} y={14} fontSize="10" textAnchor="middle" fill="currentColor" fillOpacity="0.55">{tk.label}</text>
            </g>
          ))}
          {/* Today */}
          {range && Date.now() >= range.min && Date.now() <= range.max && (
            <g>
              <line x1={xAt(Date.now())} x2={xAt(Date.now())} y1={20} y2={totalH - 20} stroke="hsl(var(--primary, 222 47% 51%))" strokeOpacity="0.5" strokeDasharray="3 3" />
              <text x={xAt(Date.now())} y={totalH - 6} fontSize="10" textAnchor="middle" fill="hsl(var(--primary, 222 47% 51%))" fillOpacity="0.85">today</text>
            </g>
          )}
          {/* Sprint rows */}
          {dated.map((s, i) => {
            const y = 32 + i * ROW_H;
            const x1 = xAt(new Date(s.startDate!).getTime());
            const x2 = xAt(new Date(s.endDate!).getTime());
            const barH = 22;
            return (
              <g key={s.id}>
                <text x={PAD_X - 8} y={y + barH / 2 + 4} fontSize="11" textAnchor="end" fill="currentColor" fillOpacity="0.85">
                  {s.name.length > 14 ? `${s.name.slice(0, 14)}…` : s.name}
                </text>
                <rect
                  x={x1}
                  y={y}
                  width={Math.max(2, x2 - x1)}
                  height={barH}
                  rx={4}
                  className={statusColor[s.status]}
                  opacity={s.status === 'completed' ? 0.6 : 1}
                />
                <text x={x1 + 6} y={y + barH / 2 + 4} fontSize="10" fill="currentColor" fillOpacity="0.85">
                  {s.cards.length} card{s.cards.length === 1 ? '' : 's'}
                </text>
                {/* Card dots */}
                {s.cards.filter(c => c.dueDate).map(c => {
                  const cx = xAt(new Date(c.dueDate!).getTime());
                  return (
                    <circle
                      key={`c-${c.id}`}
                      cx={cx}
                      cy={y + barH / 2}
                      r={4}
                      className={c.columnIsDone ? 'fill-emerald-500' : 'fill-rose-500'}
                    >
                      <title>{`${projectKey && c.number != null ? `${projectKey}-${c.number} · ` : ''}${c.title}${c.storyPoints != null ? ` · ${c.storyPoints} pts` : ''}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend + sprint links */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 bg-amber-300/70 rounded-sm"></span>Planning</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 bg-primary rounded-sm"></span>Active</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 bg-emerald-300/70 rounded-sm"></span>Completed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 bg-rose-500 rounded-full"></span>Open card due</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 bg-emerald-500 rounded-full"></span>Done card</span>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        {dated.map(s => (
          <Link
            key={s.id}
            href={`/portal/projects/${projectId}?tab=sprints#${s.id}`}
            className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {s.name} · {new Date(s.startDate!).toLocaleDateString('en-US')} → {new Date(s.endDate!).toLocaleDateString('en-US')}
          </Link>
        ))}
      </div>
    </div>
  );
}
