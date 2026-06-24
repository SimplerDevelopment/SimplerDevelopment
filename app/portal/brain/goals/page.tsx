'use client';

/**
 * Goals list — owner-centric "what am I responsible for" view across every
 * initiative. Thin table by design: title, status, progress, target date,
 * parent initiative. Each row links into its parent initiative for deeper
 * actions (check-in / delete live there to keep this page lean).
 *
 * Filters in URL params:
 *   ?status=open|on_track|...|all  (default: open + on_track + at_risk + off_track shown as "active")
 *   ?ownerId=<id>
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  goalStatusChip,
  formatMetric,
  progressPercent,
  relativeTime,
  type BrainGoalStatus,
  type GoalRow,
} from '@/components/brain/initiatives-shared';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnGhost, pBtnPrimary, pSelect } from '@/components/portal/portal-ui';

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

interface InitiativeSlim {
  id: number;
  name: string;
  status: string;
}

type StatusFilter = BrainGoalStatus | 'all' | 'active';
const STATUS_FILTERS: StatusFilter[] = ['active', 'open', 'on_track', 'at_risk', 'off_track', 'achieved', 'missed', 'all'];

const ACTIVE_STATUSES: BrainGoalStatus[] = ['open', 'on_track', 'at_risk', 'off_track'];

export default function GoalsListPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    }>
      <GoalsListContent />
    </Suspense>
  );
}

function GoalsListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = (searchParams.get('status') as StatusFilter | null) ?? 'active';
  const ownerIdParam = searchParams.get('ownerId');

  const [allGoals, setAllGoals] = useState<GoalRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [initiatives, setInitiatives] = useState<InitiativeSlim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setParam = useCallback(
    (next: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === undefined || v === '') params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/team')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          setTeam(
            json.data
              .filter((m: { userId?: number }) => typeof m.userId === 'number')
              .map((m: { userId: number; name: string | null; email: string }) => ({
                userId: m.userId,
                name: m.name,
                email: m.email,
              })),
          );
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all' && statusFilter !== 'active') {
        params.set('status', statusFilter);
      }
      if (ownerIdParam) params.set('ownerId', ownerIdParam);
      params.set('limit', '100');

      const [goalsRes, initsRes] = await Promise.all([
        fetch(`/api/portal/brain/goals?${params.toString()}`),
        fetch('/api/portal/brain/initiatives?status=all&limit=100'),
      ]);
      const goalsJson = await goalsRes.json();
      const initsJson = await initsRes.json();
      if (!goalsRes.ok || !goalsJson.success) {
        setError(goalsJson.message || 'Failed to load goals');
        setAllGoals([]);
        return;
      }
      const items = (Array.isArray(goalsJson.data?.items) ? goalsJson.data.items : []) as GoalRow[];
      setAllGoals(items);
      if (initsRes.ok && initsJson.success && Array.isArray(initsJson.data?.items)) {
        setInitiatives(
          initsJson.data.items.map((i: { id: number; name: string; status: string }) => ({
            id: i.id,
            name: i.name,
            status: i.status,
          })),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, ownerIdParam]);

  useEffect(() => { load(); }, [load]);

  const initiativeLookup = useMemo(() => {
    const m: Record<number, InitiativeSlim> = {};
    for (const i of initiatives) m[i.id] = i;
    return m;
  }, [initiatives]);

  const ownerLookup = useMemo(() => {
    const m: Record<number, TeamMember> = {};
    for (const t of team) m[t.userId] = t;
    return m;
  }, [team]);

  const visibleGoals = useMemo(() => {
    if (statusFilter === 'active') {
      return allGoals.filter((g) => ACTIVE_STATUSES.includes(g.status));
    }
    return allGoals;
  }, [allGoals, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="sticky top-[var(--portal-header-height,3.5rem)] z-10 bg-background -mx-4 sm:mx-0 px-4 sm:px-0 pt-1 pb-3 border-b border-border">
        <PortalPageHeader
          eyebrow="Company Brain"
          title={<span className="flex items-center gap-2"><span className="material-icons text-primary">track_changes</span>Goals</span>}
          subtitle="Every goal across every initiative. Click into an initiative to check in or edit."
          actions={
            <Link href="/portal/brain/initiatives" className={pBtnGhost}>
              <span className="material-icons text-base">flag</span>
              Initiatives
            </Link>
          }
          className="mb-0 pb-3"
        />
        {/* keep existing status filter pill row and owner select row exactly as-is */}
        <div className="mt-3 flex items-center gap-1 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s;
            const label =
              s === 'all'
                ? 'All'
                : s === 'active'
                  ? 'Active'
                  : goalStatusChip(s as BrainGoalStatus).label;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setParam({ status: s })}
                className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
          <select
            value={ownerIdParam ?? ''}
            onChange={(e) => setParam({ ownerId: e.target.value || null })}
            className="appearance-none rounded-xl border border-border bg-card px-3.5 py-2 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
            <option value="">Any owner</option>
            {team.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive flex items-center gap-2">
          <span className="material-icons text-base">error_outline</span>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading…
        </div>
      ) : visibleGoals.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-2xl">
          <span className="material-icons text-5xl text-muted-foreground mb-2 block">track_changes</span>
          <p className="text-foreground text-sm font-medium">No goals match these filters.</p>
          <p className="text-muted-foreground text-xs mt-1 mb-4">
            Create an initiative to start tracking measurable outcomes.
          </p>
          <Link
            href="/portal/brain/initiatives/new"
            className={pBtnPrimary}
          >
            <span className="material-icons text-base">add</span>
            New initiative
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Goal</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Progress</th>
                <th className="text-left px-3 py-2 font-medium">Owner</th>
                <th className="text-left px-3 py-2 font-medium">Target</th>
                <th className="text-left px-3 py-2 font-medium">Initiative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleGoals.map((g) => {
                const chip = goalStatusChip(g.status);
                const pct = progressPercent(g.currentMetric, g.targetMetric);
                const init = initiativeLookup[g.initiativeId];
                const owner = g.ownerId !== null ? ownerLookup[g.ownerId] : null;
                const ownerName = owner?.name || owner?.email || (g.ownerId !== null ? `User #${g.ownerId}` : null);
                return (
                  <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 align-top max-w-xs">
                      <Link
                        href={`/portal/brain/initiatives/${g.initiativeId}`}
                        className="text-foreground hover:text-primary font-medium block truncate"
                      >
                        {g.title}
                      </Link>
                      {g.lastCheckedInAt && (
                        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                          <span className="material-icons text-[13px]">history</span>
                          checked in {relativeTime(g.lastCheckedInAt)} ago
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium ${chip.className}`}
                      >
                        <span className="material-icons text-[12px]">{chip.icon}</span>
                        {chip.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top w-40">
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatMetric(g.currentMetric, g.unit)}
                        <span className="opacity-50"> / </span>
                        {formatMetric(g.targetMetric, g.unit)}
                        {pct !== null && <span className="ml-1">({pct}%)</span>}
                      </div>
                      <div className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            g.status === 'off_track' ? 'bg-red-500'
                              : g.status === 'at_risk' ? 'bg-amber-500'
                              : g.status === 'achieved' ? 'bg-blue-500'
                              : g.status === 'missed' ? 'bg-zinc-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${pct ?? 0}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                      {ownerName ?? <span className="opacity-60">unassigned</span>}
                    </td>
                    <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                      {g.targetDate ? new Date(g.targetDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {init ? (
                        <Link
                          href={`/portal/brain/initiatives/${init.id}`}
                          className="text-xs text-primary hover:underline truncate inline-block max-w-[12rem]"
                        >
                          {init.name}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">#{g.initiativeId}</span>
                      )}
                    </td>
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
