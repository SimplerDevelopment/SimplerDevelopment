// The projects list's per-board roll-up, pure half (PUX-151, design doc
// screen 10): "Progress and lane counts, computed, not stored." Nothing here
// touches the DB so it can be unit-tested; list-rollup.ts fetches the rows.

export interface ProjectRollup {
  total: number;
  shipped: number;
  /** 0–100, shipped ÷ total */
  pct: number;
  /** non-done lanes with at least one card, in board order */
  lanes: { name: string; count: number }[];
  lastActivityAt: string | null;
  /** up to three people with a card on the board */
  members: { id: number; name: string }[];
}

export type LaneRow = { projectId: number; name: string; order: number; isDone: boolean; count: number };
export type ActivityRow = { projectId: number; at: Date | string | null };
export type MemberRow = { projectId: number; userId: number; name: string | null };

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export function shapeProjectRollup(lanes: LaneRow[], activity: ActivityRow[], members: MemberRow[]): Record<number, ProjectRollup> {
  const out: Record<number, ProjectRollup> = {};
  const get = (id: number) => (out[id] ??= { total: 0, shipped: 0, pct: 0, lanes: [], lastActivityAt: null, members: [] });

  for (const l of [...lanes].sort((a, b) => a.order - b.order)) {
    const r = get(l.projectId);
    r.total += l.count;
    if (l.isDone) r.shipped += l.count;
    else if (l.count > 0) r.lanes.push({ name: l.name, count: l.count });
  }
  for (const a of activity) {
    const r = get(a.projectId);
    const at = iso(a.at);
    if (at && (!r.lastActivityAt || at > r.lastActivityAt)) r.lastActivityAt = at;
  }
  const seen = new Set<string>();
  for (const m of members) {
    const key = `${m.projectId}:${m.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = get(m.projectId);
    if (r.members.length < 3) r.members.push({ id: m.userId, name: m.name ?? 'Someone' });
  }
  for (const r of Object.values(out)) r.pct = r.total === 0 ? 0 : Math.round((r.shipped / r.total) * 100);
  return out;
}
