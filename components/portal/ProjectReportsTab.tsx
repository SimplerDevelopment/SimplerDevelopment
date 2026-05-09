'use client';

import { useEffect, useState } from 'react';
import SprintRetroPanel from './SprintRetroPanel';

interface BurndownPoint {
  date: string;
  remaining: number;
  completed: number;
  scope: number;
  ideal: number;
}

interface BurndownPayload {
  sprintId: number;
  sprintName: string;
  startDate: string | null;
  endDate: string | null;
  status: 'planning' | 'active' | 'completed';
  series: BurndownPoint[];
  message?: string;
}

interface VelocityRow {
  sprintId: number;
  sprintName: string;
  endDate: string | null;
  committed: number;
  completed: number;
}

interface VelocityPayload {
  rows: VelocityRow[];
  averageCommitted: number;
  averageCompleted: number;
}

interface CycleRow {
  cardId: number;
  number: number | null;
  title: string;
  doneAt: string;
  leadTimeMinutes: number;
  cycleTimeMinutes: number;
  storyPoints: number | null;
}

interface CyclePayload {
  rows: CycleRow[];
  averageLeadDays: number;
  averageCycleDays: number;
}

interface SprintRef {
  id: number;
  name: string;
  status: 'planning' | 'active' | 'completed';
}

interface CfdColumn { id: number; name: string; order: number }
interface CfdDay { date: string; counts: Record<number, number> }
interface CfdPayload { columns: CfdColumn[]; days: CfdDay[] }

interface CapacityRow {
  userId: number;
  name: string | null;
  email: string;
  cardCount: number;
  committedPoints: number;
  completedPoints: number;
}

interface CapacityPayload {
  sprintId: number;
  sprintName: string;
  rows: CapacityRow[];
}

export default function ProjectReportsTab({ projectId, projectKey }: { projectId: number; projectKey: string | null }) {
  const [sprints, setSprints] = useState<SprintRef[]>([]);
  const [activeSprintId, setActiveSprintId] = useState<number | null>(null);
  const [burndown, setBurndown] = useState<BurndownPayload | null>(null);
  const [capacity, setCapacity] = useState<CapacityPayload | null>(null);
  const [velocity, setVelocity] = useState<VelocityPayload | null>(null);
  const [cycle, setCycle] = useState<CyclePayload | null>(null);
  const [cfd, setCfd] = useState<CfdPayload | null>(null);
  const [loading, setLoading] = useState(true);

  // Initial load of sprints + project-level data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [sprintsRes, velocityRes, cycleRes, cfdRes] = await Promise.all([
          fetch(`/api/portal/projects/${projectId}/sprints`).then(r => r.json()),
          fetch(`/api/portal/projects/${projectId}/velocity`).then(r => r.json()),
          fetch(`/api/portal/projects/${projectId}/cycle-time`).then(r => r.json()),
          fetch(`/api/portal/projects/${projectId}/cfd?days=30`).then(r => r.json()),
        ]);
        if (cancelled) return;
        if (sprintsRes.success) {
          const list: SprintRef[] = (sprintsRes.data.sprints ?? []).map((s: { id: number; name: string; status: SprintRef['status'] }) => ({ id: s.id, name: s.name, status: s.status }));
          setSprints(list);
          // Default to the active sprint if any, else the latest planning sprint.
          const active = list.find(s => s.status === 'active') ?? list.find(s => s.status === 'planning') ?? list[0];
          if (active) setActiveSprintId(active.id);
        }
        if (velocityRes.success) setVelocity(velocityRes.data);
        if (cycleRes.success) setCycle(cycleRes.data);
        if (cfdRes.success) setCfd(cfdRes.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  // Burndown + capacity load when the selected sprint changes.
  useEffect(() => {
    if (activeSprintId == null) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/portal/sprints/${activeSprintId}/burndown`).then(r => r.json()),
      fetch(`/api/portal/sprints/${activeSprintId}/capacity`).then(r => r.json()),
    ]).then(([b, c]) => {
      if (cancelled) return;
      if (b.success) setBurndown(b.data);
      if (c.success) setCapacity(c.data);
    });
    return () => { cancelled = true; };
  }, [activeSprintId]);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><span className="material-icons animate-spin text-primary text-2xl">refresh</span></div>;
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Burndown */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Burndown</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Daily remaining points vs. the ideal line.</p>
          </div>
          {sprints.length > 0 && (
            <select
              value={activeSprintId ?? ''}
              onChange={e => setActiveSprintId(parseInt(e.target.value, 10))}
              className="px-3 py-1.5 rounded border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {sprints.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
              ))}
            </select>
          )}
        </div>
        {burndown ? <BurndownChart payload={burndown} /> : <EmptyChart message="No sprint selected." />}
      </section>

      {/* Capacity by assignee */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">Capacity by assignee</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Points committed and completed per teammate in {capacity?.sprintName ?? 'the selected sprint'}.
        </p>
        {capacity && capacity.rows.length > 0
          ? <CapacityChart payload={capacity} />
          : <EmptyChart message="No assigned cards in this sprint yet." />}
      </section>

      {/* Velocity */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">Velocity</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Last {velocity?.rows.length ?? 0} completed sprints. Average committed: {velocity?.averageCommitted ?? 0} pts ·
          {' '}Average completed: {velocity?.averageCompleted ?? 0} pts.
        </p>
        {velocity && velocity.rows.length > 0 ? <VelocityChart payload={velocity} /> : <EmptyChart message="No completed sprints yet — velocity becomes available once sprints close." />}
      </section>

      {/* Retro */}
      {activeSprintId != null && (
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-1">Sprint retrospective</h2>
          <p className="text-sm text-muted-foreground mb-3">Three columns: what went well, what didn&rsquo;t, and the action items the team commits to next sprint.</p>
          <SprintRetroPanel
            sprintId={activeSprintId}
            sprintName={sprints.find(s => s.id === activeSprintId)?.name ?? `Sprint ${activeSprintId}`}
          />
        </section>
      )}

      {/* Cumulative flow */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">Cumulative flow</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Card counts per column over the last {cfd?.days?.length ?? 0} day{(cfd?.days?.length ?? 0) === 1 ? '' : 's'}. Stacked-area shape shows where work piles up.
        </p>
        {cfd && cfd.days.length > 0
          ? <CfdChart payload={cfd} />
          : <EmptyChart message="No daily snapshots yet — schedule /api/cron/pm-column-snapshots once a day to populate this chart." />}
      </section>

      {/* Cycle / lead time */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">Cycle &amp; lead time</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Average cycle time: {cycle?.averageCycleDays ?? 0} days · Average lead time: {cycle?.averageLeadDays ?? 0} days.
        </p>
        {cycle && cycle.rows.length > 0 ? <CycleTable payload={cycle} projectKey={projectKey} /> : <EmptyChart message="No completed cards yet." />}
      </section>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ─── Burndown chart (inline SVG) ─────────────────────────────────────────────

function BurndownChart({ payload }: { payload: BurndownPayload }) {
  if (!payload.series || payload.series.length === 0) {
    return <EmptyChart message={payload.message ?? 'No data yet — events accrue as cards move into and out of the sprint.'} />;
  }
  const W = 720;
  const H = 240;
  const PAD = { top: 16, right: 16, bottom: 28, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...payload.series.map(p => Math.max(p.scope, p.remaining, p.ideal)));

  const xAt = (i: number) => PAD.left + (innerW * (payload.series.length === 1 ? 0 : i / (payload.series.length - 1)));
  const yAt = (v: number) => PAD.top + innerH - (innerH * (v / max));

  const remainingPath = payload.series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.remaining)}`).join(' ');
  const idealPath = payload.series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(p.ideal)}`).join(' ');

  const yTicks = [0, Math.round(max / 2), max];
  const xTickIdx = [0, Math.floor(payload.series.length / 2), payload.series.length - 1];

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Burndown chart">
        {/* Y ticks */}
        {yTicks.map(t => (
          <g key={`y-${t}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yAt(t)} y2={yAt(t)} stroke="currentColor" strokeOpacity="0.1" />
            <text x={PAD.left - 8} y={yAt(t) + 4} fontSize="10" textAnchor="end" fill="currentColor" fillOpacity="0.5">{t}</text>
          </g>
        ))}
        {/* X labels */}
        {xTickIdx.map(i => i < payload.series.length && (
          <text key={`x-${i}`} x={xAt(i)} y={H - PAD.bottom + 16} fontSize="10" textAnchor="middle" fill="currentColor" fillOpacity="0.5">
            {payload.series[i].date.slice(5)}
          </text>
        ))}
        {/* Ideal — dashed muted line */}
        <path d={idealPath} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
        {/* Remaining — primary solid line */}
        <path d={remainingPath} stroke="hsl(var(--primary, 222 47% 51%))" strokeWidth="2" fill="none" />
        {/* Remaining dots */}
        {payload.series.map((p, i) => (
          <circle key={`dot-${i}`} cx={xAt(i)} cy={yAt(p.remaining)} r="2.5" fill="hsl(var(--primary, 222 47% 51%))" />
        ))}
      </svg>
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground mt-2">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-primary"></span>Remaining</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 border-t border-dashed border-muted-foreground"></span>Ideal</span>
      </div>
    </div>
  );
}

// ─── Velocity chart (paired bars) ────────────────────────────────────────────

function VelocityChart({ payload }: { payload: VelocityPayload }) {
  const W = 720;
  const H = 240;
  const PAD = { top: 16, right: 16, bottom: 36, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...payload.rows.flatMap(r => [r.committed, r.completed]));

  const groupW = innerW / payload.rows.length;
  const barW = Math.min(28, (groupW - 8) / 2);

  const yAt = (v: number) => PAD.top + innerH - (innerH * (v / max));

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Velocity chart">
        {[0, Math.round(max / 2), max].map(t => (
          <g key={`v-y-${t}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yAt(t)} y2={yAt(t)} stroke="currentColor" strokeOpacity="0.1" />
            <text x={PAD.left - 8} y={yAt(t) + 4} fontSize="10" textAnchor="end" fill="currentColor" fillOpacity="0.5">{t}</text>
          </g>
        ))}
        {payload.rows.map((r, i) => {
          const cx = PAD.left + groupW * i + groupW / 2;
          return (
            <g key={r.sprintId}>
              <rect
                x={cx - barW - 1}
                y={yAt(r.committed)}
                width={barW}
                height={(yAt(0) - yAt(r.committed))}
                fill="currentColor"
                fillOpacity="0.25"
              />
              <rect
                x={cx + 1}
                y={yAt(r.completed)}
                width={barW}
                height={(yAt(0) - yAt(r.completed))}
                fill="hsl(var(--primary, 222 47% 51%))"
              />
              <text x={cx} y={H - PAD.bottom + 14} fontSize="10" textAnchor="middle" fill="currentColor" fillOpacity="0.6">
                {r.sprintName.length > 12 ? `${r.sprintName.slice(0, 12)}…` : r.sprintName}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground mt-2">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 bg-current opacity-25 rounded-sm"></span>Committed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 bg-primary rounded-sm"></span>Completed</span>
      </div>
    </div>
  );
}

// ─── Cumulative flow diagram ─────────────────────────────────────────────────

function CfdChart({ payload }: { payload: CfdPayload }) {
  const W = 720;
  const H = 240;
  const PAD = { top: 16, right: 16, bottom: 28, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // Stack column counts in column-order so the leftmost column is at the
  // bottom of the stack (same convention as Atlassian/Jira CFDs).
  const sortedCols = [...payload.columns].sort((a, b) => a.order - b.order);

  // Per-day totals → max for y-scale.
  const totals = payload.days.map(d => sortedCols.reduce((s, c) => s + (d.counts[c.id] ?? 0), 0));
  const maxTotal = Math.max(1, ...totals);

  const xAt = (i: number) => PAD.left + (innerW * (payload.days.length === 1 ? 0 : i / (payload.days.length - 1)));
  const yAt = (v: number) => PAD.top + innerH - (innerH * (v / maxTotal));

  // Build cumulative y per (day, column) so we can draw stacked polygons.
  const stacks: number[][] = sortedCols.map(() => Array(payload.days.length).fill(0));
  for (let di = 0; di < payload.days.length; di++) {
    let cum = 0;
    for (let ci = 0; ci < sortedCols.length; ci++) {
      cum += payload.days[di].counts[sortedCols[ci].id] ?? 0;
      stacks[ci][di] = cum;
    }
  }

  // Color palette via deterministic hue rotation (HSL) so the chart works in
  // both light and dark modes without bringing in a palette dep.
  const colorOf = (i: number) => `hsl(${(220 + i * 47) % 360} 65% 55%)`;

  // Draw from the top of the stack down so the top band is on top in z-order.
  const polygons = [...sortedCols].map((col, ci) => {
    const top = stacks[ci];
    const bot = ci === 0 ? Array(payload.days.length).fill(0) : stacks[ci - 1];
    const points: string[] = [];
    for (let i = 0; i < payload.days.length; i++) points.push(`${xAt(i)},${yAt(top[i])}`);
    for (let i = payload.days.length - 1; i >= 0; i--) points.push(`${xAt(i)},${yAt(bot[i])}`);
    return { id: col.id, name: col.name, points: points.join(' '), color: colorOf(ci) };
  });

  const yTicks = [0, Math.round(maxTotal / 2), maxTotal];
  const xTickIdx = [0, Math.floor(payload.days.length / 2), payload.days.length - 1];

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Cumulative flow diagram">
        {yTicks.map(t => (
          <g key={`cfd-y-${t}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yAt(t)} y2={yAt(t)} stroke="currentColor" strokeOpacity="0.1" />
            <text x={PAD.left - 8} y={yAt(t) + 4} fontSize="10" textAnchor="end" fill="currentColor" fillOpacity="0.5">{t}</text>
          </g>
        ))}
        {xTickIdx.map(i => i < payload.days.length && (
          <text key={`cfd-x-${i}`} x={xAt(i)} y={H - PAD.bottom + 16} fontSize="10" textAnchor="middle" fill="currentColor" fillOpacity="0.5">
            {payload.days[i].date.slice(5)}
          </text>
        ))}
        {polygons.map(p => (
          <polygon key={p.id} points={p.points} fill={p.color} fillOpacity="0.9" stroke={p.color} strokeWidth="0.75">
            <title>{p.name}</title>
          </polygon>
        ))}
      </svg>
      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
        {polygons.map(p => (
          <span key={p.id} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: p.color }}></span>
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Capacity-by-assignee chart ──────────────────────────────────────────────

function CapacityChart({ payload }: { payload: CapacityPayload }) {
  const max = Math.max(1, ...payload.rows.map(r => r.committedPoints));
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      {payload.rows.map(r => {
        const committedPct = (r.committedPoints / max) * 100;
        const completedPct = r.committedPoints > 0
          ? (r.completedPoints / r.committedPoints) * committedPct
          : 0;
        return (
          <div key={r.userId} className="grid grid-cols-[160px_1fr_auto] items-center gap-3 text-sm">
            <div className="truncate" title={r.email}>
              <span className="font-medium text-foreground">{r.name ?? r.email}</span>
            </div>
            <div className="relative h-6 bg-muted rounded overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-current opacity-25"
                style={{ width: `${committedPct}%` }}
                aria-label={`${r.committedPoints} committed`}
              />
              <div
                className="absolute inset-y-0 left-0 bg-primary"
                style={{ width: `${completedPct}%` }}
                aria-label={`${r.completedPoints} completed`}
              />
            </div>
            <div className="text-xs text-muted-foreground tabular-nums shrink-0">
              {r.completedPoints}/{r.committedPoints} pts · {r.cardCount} card{r.cardCount === 1 ? '' : 's'}
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-end gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 bg-current opacity-25 rounded-sm"></span>Committed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 bg-primary rounded-sm"></span>Completed</span>
      </div>
    </div>
  );
}

// ─── Cycle / lead time list ──────────────────────────────────────────────────

function CycleTable({ payload, projectKey }: { payload: CyclePayload; projectKey: string | null }) {
  const fmt = (mins: number) => {
    const days = mins / (60 * 24);
    if (days >= 1) return `${days.toFixed(1)}d`;
    const hours = mins / 60;
    if (hours >= 1) return `${hours.toFixed(1)}h`;
    return `${mins}m`;
  };
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">Key</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-16">Pts</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">Lead</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-24">Cycle</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-28">Done</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {payload.rows.slice(0, 50).map(r => {
            const key = projectKey && r.number != null ? `${projectKey}-${r.number}` : `#${r.cardId}`;
            return (
              <tr key={r.cardId} className="hover:bg-accent/30">
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{key}</td>
                <td className="px-4 py-2 text-foreground">{r.title}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.storyPoints ?? '—'}</td>
                <td className="px-4 py-2 text-xs">{fmt(r.leadTimeMinutes)}</td>
                <td className="px-4 py-2 text-xs">{fmt(r.cycleTimeMinutes)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(r.doneAt).toLocaleDateString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {payload.rows.length > 50 && (
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground bg-muted/30">
          Showing 50 of {payload.rows.length} done cards.
        </div>
      )}
    </div>
  );
}
