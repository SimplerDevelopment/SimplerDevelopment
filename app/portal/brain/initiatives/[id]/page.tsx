'use client';

/**
 * Initiative detail page.
 *
 * Layout:
 *   [back to list]
 *   ┌────────────────────────────────────────────────────────────────────────┐
 *   │ Header: name + status + priority + owner + target + days-remaining     │
 *   │                                          Actions: Edit / Close / etc.  │
 *   ├────────────────────────────────────────────────────────────────────────┤
 *   │ Description (collapsible if >280 chars)                                │
 *   │ Goals section — grid of <GoalProgress> + Add goal form                 │
 *   │ Linked entities (tabbed)                                               │
 *   │ Lessons learned (only when terminal)                                   │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * All API calls hit /api/portal/brain/{initiatives,goals,...}. Mutations
 * optimistically reload the affected slice; on failure we surface the error
 * and re-fetch from scratch.
 */

import { useEffect, useState, useCallback, useMemo, use as reactUse } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCardPad, pInput, pSelect, pSectionTitle } from '@/components/portal/portal-ui';
import InitiativeForm, {
  type InitiativeFormValues,
  type InitiativeCloseValues,
} from '@/components/brain/InitiativeForm';
import GoalProgress from '@/components/brain/GoalProgress';
import InitiativeLinksPanel from '@/components/brain/InitiativeLinksPanel';
import {
  GOAL_STATUSES,
  goalStatusChip,
  initiativeStatusChip,
  initiativePriorityChip,
  relativeTime,
  daysUntil,
  type BrainGoalStatus,
  type GoalRow,
  type InitiativeRow,
  type InitiativeLinkItem,
} from '@/components/brain/initiatives-shared';

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

interface DetailResponse {
  initiative: InitiativeRow;
  goals?: GoalRow[];
  links?: {
    byType: Record<string, number>;
    items?: InitiativeLinkItem[];
  };
}

export default function InitiativeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Next 16 App Router passes params as a Promise. `use()` unwraps it for
  // client components.
  const { id } = reactUse(params);
  const router = useRouter();
  const initiativeId = parseInt(id, 10);

  const [data, setData] = useState<DetailResponse | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addGoalOpen, setAddGoalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(initiativeId) || initiativeId <= 0) {
      setError('Invalid initiative id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/initiatives/${initiativeId}?includeGoals=true&includeLinks=true`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load initiative');
        setData(null);
        return;
      }
      setData(json.data as DetailResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [initiativeId]);

  useEffect(() => { load(); }, [load]);

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

  const ownerLookup = useMemo(() => {
    const m: Record<number, TeamMember> = {};
    for (const t of team) m[t.userId] = t;
    return m;
  }, [team]);

  // ─── handlers ─────────────────────────────────────────────────────────────

  const onEdit = async (values: InitiativeFormValues) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/portal/brain/initiatives/${initiativeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          description: values.description.trim() || null,
          priority: values.priority,
          ownerId: values.ownerId ?? null,
          sponsorId: values.sponsorId ?? null,
          startDate: values.startDate || null,
          targetDate: values.targetDate || null,
          confidentialityLevel: values.confidentialityLevel,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) throw new Error(json.message || 'Update failed');
      setEditing(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onClose = async (values: InitiativeCloseValues) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/portal/brain/initiatives/${initiativeId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome: values.outcome,
          reason: values.reason || undefined,
          lessonsLearned: values.lessonsLearned || undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) throw new Error(json.message || 'Close failed');
      setClosing(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onReopen = async () => {
    if (!confirm('Reopen this initiative? Its status will be set to Active.')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/portal/brain/initiatives/${initiativeId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Reopen failed');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    if (!confirm('Cancel this initiative? It will be soft-cancelled (recoverable via reopen).')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/portal/brain/initiatives/${initiativeId}`, { method: 'DELETE' });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Cancel failed');
        return;
      }
      // Soft-cancel — go back to list.
      router.push('/portal/brain/initiatives');
    } finally {
      setBusy(false);
    }
  };

  const onGoalCheckin = useCallback(
    async (goalId: number, args: { currentMetric?: number; note?: string; status?: BrainGoalStatus }) => {
      const r = await fetch(`/api/portal/brain/goals/${goalId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const json = await r.json();
      if (!r.ok || !json.success) throw new Error(json.message || 'Check-in failed');
      await load();
    },
    [load],
  );

  const onGoalDelete = useCallback(async (goalId: number) => {
    if (!confirm('Delete this goal? This cannot be undone.')) return;
    const r = await fetch(`/api/portal/brain/goals/${goalId}`, { method: 'DELETE' });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'Delete failed');
      return;
    }
    await load();
  }, [load]);

  // ─── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 flex items-center justify-center text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Link
          href="/portal/brain/initiatives"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="material-icons text-sm">chevron_left</span>
          Initiatives
        </Link>
        <div className="mt-4 bg-destructive/10 border border-destructive/30 rounded-md p-4 text-sm text-destructive flex items-center gap-2">
          <span className="material-icons text-base">error_outline</span>
          {error || 'Initiative not found'}
        </div>
      </div>
    );
  }

  const { initiative } = data;
  const goals = data.goals ?? [];
  const links = data.links?.items ?? [];
  const isTerminal = initiative.status === 'completed' || initiative.status === 'cancelled';

  const status = initiativeStatusChip(initiative.status);
  const priority = initiativePriorityChip(initiative.priority);
  const owner = initiative.ownerId !== null ? ownerLookup[initiative.ownerId] : null;
  const ownerName = owner?.name || owner?.email || (initiative.ownerId !== null ? `User #${initiative.ownerId}` : null);
  const days = daysUntil(initiative.targetDate);
  const overdue = days !== null && days < 0 && !isTerminal;

  const goalsByStatus = goals.reduce<Record<string, number>>((acc, g) => {
    acc[g.status] = (acc[g.status] ?? 0) + 1;
    return acc;
  }, {});

  const description = initiative.description ?? '';
  const descTruncated = description.length > 280;

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-6">
      <Link
        href="/portal/brain/initiatives"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="material-icons text-sm">chevron_left</span>
        Initiatives
      </Link>

      {/* Header */}
      <PortalPageHeader
        eyebrow="Company Brain"
        title={initiative.name}
        actions={!editing && !closing ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isTerminal && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                className={pBtnGhost}
              >
                <span className="material-icons text-sm">edit</span>
                Edit
              </button>
            )}
            {!isTerminal && (
              <button
                type="button"
                onClick={() => setClosing(true)}
                disabled={busy}
                className={pBtnGhost}
              >
                <span className="material-icons text-sm">archive</span>
                Close
              </button>
            )}
            {isTerminal && (
              <button
                type="button"
                onClick={onReopen}
                disabled={busy}
                className={pBtnGhost}
              >
                <span className="material-icons text-sm">restart_alt</span>
                Reopen
              </button>
            )}
            {!isTerminal && (
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-card px-4 py-2.5 text-sm font-semibold text-destructive transition hover:border-destructive/60 hover:bg-destructive/5 disabled:opacity-50"
              >
                <span className="material-icons text-sm">delete</span>
                Cancel
              </button>
            )}
          </div>
        ) : undefined}
      />

      <div className={pCardPad}>
        {/* Status + priority chips */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}
          >
            <span className="material-icons text-[14px]">{status.icon}</span>
            {status.label}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priority.className}`}
          >
            {priority.label}
          </span>
        </div>

        {/* Meta row */}
        <div className="mt-2 flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
          {ownerName && (
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-base">person</span>
              {ownerName}
            </span>
          )}
          {initiative.targetDate && (
            <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
              <span className="material-icons text-base">
                {overdue ? 'event_busy' : 'event'}
              </span>
              target {new Date(initiative.targetDate).toLocaleDateString()}
              {days !== null && !isTerminal && (
                <span className="ml-1 opacity-70">
                  ({days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`})
                </span>
              )}
            </span>
          )}
          {initiative.startDate && (
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-base">play_circle</span>
              started {new Date(initiative.startDate).toLocaleDateString()}
            </span>
          )}
          {initiative.closedAt && (
            <span className="inline-flex items-center gap-1">
              <span className="material-icons text-base">archive</span>
              closed {relativeTime(initiative.closedAt)} ago
            </span>
          )}
        </div>

        {/* Description */}
        {description && !editing && !closing && (
          <div className="mt-4 text-sm text-foreground/90 whitespace-pre-wrap">
            {descTruncated && !showFullDescription ? (
              <>
                {description.slice(0, 280)}…{' '}
                <button
                  type="button"
                  onClick={() => setShowFullDescription(true)}
                  className="text-primary hover:underline text-xs"
                >
                  show more
                </button>
              </>
            ) : (
              <>
                {description}
                {descTruncated && (
                  <button
                    type="button"
                    onClick={() => setShowFullDescription(false)}
                    className="ml-2 text-primary hover:underline text-xs"
                  >
                    show less
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Inline edit form */}
        {editing && (
          <div className="mt-4 pt-4 border-t border-border">
            <h2 className={`${pSectionTitle} mb-3`}>Edit initiative</h2>
            <InitiativeForm
              mode="edit"
              team={team}
              initial={{
                name: initiative.name,
                description: initiative.description ?? '',
                priority: initiative.priority,
                ownerId: initiative.ownerId,
                sponsorId: initiative.sponsorId,
                startDate: initiative.startDate ? initiative.startDate.slice(0, 10) : '',
                targetDate: initiative.targetDate ? initiative.targetDate.slice(0, 10) : '',
                confidentialityLevel: initiative.confidentialityLevel as 'standard' | 'restricted' | 'confidential',
              }}
              onCancel={() => setEditing(false)}
              onSubmit={onEdit}
            />
          </div>
        )}

        {/* Inline close form */}
        {closing && (
          <div className="mt-4 pt-4 border-t border-border">
            <h2 className={`${pSectionTitle} mb-3 inline-flex items-center gap-1.5`}>
              <span className="material-icons text-base">archive</span>
              Close initiative
            </h2>
            <InitiativeForm
              mode="close"
              onCancel={() => setClosing(false)}
              onSubmit={onClose}
            />
          </div>
        )}
      </div>

      {/* Goals section */}
      <section className={pCardPad}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className={`${pSectionTitle} inline-flex items-center gap-2`}>
            <span className="material-icons text-base text-primary">track_changes</span>
            Goals
            <span className="text-xs text-muted-foreground font-normal">({goals.length})</span>
          </h2>
          <button
            type="button"
            onClick={() => setAddGoalOpen((v) => !v)}
            className={pBtnGhost}
          >
            <span className="material-icons text-sm">{addGoalOpen ? 'close' : 'add'}</span>
            {addGoalOpen ? 'Cancel' : 'Add goal'}
          </button>
        </div>

        {/* Mini sparkline of goals by status */}
        {goals.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {GOAL_STATUSES.map((s) => {
              const c = goalsByStatus[s] ?? 0;
              if (c === 0) return null;
              const chip = goalStatusChip(s);
              return (
                <span
                  key={s}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${chip.className}`}
                >
                  <span className="material-icons text-[12px]">{chip.icon}</span>
                  {c} {chip.label.toLowerCase()}
                </span>
              );
            })}
          </div>
        )}

        {addGoalOpen && (
          <AddGoalForm
            initiativeId={initiativeId}
            onCreated={async () => { setAddGoalOpen(false); await load(); }}
            onCancel={() => setAddGoalOpen(false)}
          />
        )}

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {goals.length === 0 ? (
            <div className="lg:col-span-2 text-center py-6 text-xs text-muted-foreground bg-muted/30 rounded-md border border-dashed border-border">
              No goals yet. Add one to track measurable progress on this initiative.
            </div>
          ) : (
            goals.map((g) => (
              <GoalProgress
                key={g.id}
                goal={g}
                ownerLookup={ownerLookup}
                onCheckin={(args) => onGoalCheckin(g.id, args)}
                onDelete={() => onGoalDelete(g.id)}
              />
            ))
          )}
        </div>
      </section>

      {/* Linked entities */}
      <InitiativeLinksPanel
        initiativeId={initiativeId}
        links={links}
        onChanged={load}
      />

      {/* Lessons learned (terminal only) */}
      {isTerminal && initiative.lessonsLearned && (
        <section className={pCardPad}>
          <h2 className={`${pSectionTitle} inline-flex items-center gap-2`}>
            <span className="material-icons text-base text-primary">menu_book</span>
            Lessons learned
          </h2>
          {initiative.closeReason && (
            <p className="mt-2 text-xs text-muted-foreground">
              Reason: {initiative.closeReason}
            </p>
          )}
          <p className="mt-3 text-sm text-foreground/90 whitespace-pre-wrap">
            {initiative.lessonsLearned}
          </p>
        </section>
      )}
    </div>
  );
}

// ─── add-goal inline form ───────────────────────────────────────────────────

function AddGoalForm({
  initiativeId,
  onCreated,
  onCancel,
}: {
  initiativeId: number;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState<'' | 'percent' | 'usd_cents' | 'count' | 'boolean'>('');
  const [targetMetric, setTargetMetric] = useState('');
  const [currentMetric, setCurrentMetric] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [status, setStatus] = useState<BrainGoalStatus>('open');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErr('Title is required');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const targetNum = targetMetric.trim() === '' ? null : Number(targetMetric);
      const currentNum = currentMetric.trim() === '' ? null : Number(currentMetric);
      const r = await fetch('/api/portal/brain/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiativeId,
          title: title.trim(),
          description: description.trim() || undefined,
          unit: unit || undefined,
          targetMetric: typeof targetNum === 'number' && Number.isFinite(targetNum) ? targetNum : undefined,
          currentMetric: typeof currentNum === 'number' && Number.isFinite(currentNum) ? currentNum : undefined,
          targetDate: targetDate || undefined,
          status,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setErr(json.message || 'Create failed');
        return;
      }
      onCreated();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 rounded-2xl border border-border bg-card p-4 space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Goal title"
        required
        autoFocus
        className={pInput}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description (optional)"
        className={pInput}
      />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">Unit</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as typeof unit)}
            className={`mt-1 ${pSelect}`}
          >
            <option value="">none</option>
            <option value="percent">%</option>
            <option value="usd_cents">$ (cents)</option>
            <option value="count">count</option>
            <option value="boolean">yes/no</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">Target</span>
          <input
            type="number"
            step="any"
            value={targetMetric}
            onChange={(e) => setTargetMetric(e.target.value)}
            className={`mt-1 ${pInput}`}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">Current</span>
          <input
            type="number"
            step="any"
            value={currentMetric}
            onChange={(e) => setCurrentMetric(e.target.value)}
            className={`mt-1 ${pInput}`}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">Target date</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className={`mt-1 ${pInput}`}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as BrainGoalStatus)}
            className={`mt-1 ${pSelect}`}
          >
            {GOAL_STATUSES.map((s) => (
              <option key={s} value={s}>{goalStatusChip(s).label}</option>
            ))}
          </select>
        </label>
      </div>
      {err && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
          {err}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className={pBtnGhost}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={pBtnPrimary}
        >
          {submitting
            ? <><span className="material-icons animate-spin text-sm">progress_activity</span>Adding…</>
            : <><span className="material-icons text-sm">add</span>Add goal</>}
        </button>
      </div>
    </form>
  );
}
