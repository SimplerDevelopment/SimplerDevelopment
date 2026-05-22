'use client';

/**
 * Card for a single brain_goal row inside an initiative detail page. Provides
 * inline check-in, edit, delete affordances. Renders a unit-aware progress
 * bar clamped 0..100% with a status chip + last-checkin breadcrumb.
 */
import { useState } from 'react';
import {
  goalStatusChip,
  formatMetric,
  progressPercent,
  relativeTime,
  GOAL_STATUSES,
  type BrainGoalStatus,
  type GoalRow,
} from './initiatives-shared';

interface OwnerLookup {
  [userId: number]: { name: string | null; email: string };
}

interface Props {
  goal: GoalRow;
  ownerLookup?: OwnerLookup;
  onCheckin?: (args: { currentMetric?: number; note?: string; status?: BrainGoalStatus }) => Promise<void>;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function GoalProgress({ goal, ownerLookup, onCheckin, onEdit, onDelete }: Props) {
  const status = goalStatusChip(goal.status);
  const pct = progressPercent(goal.currentMetric, goal.targetMetric);

  const owner = goal.ownerId !== null ? ownerLookup?.[goal.ownerId] : null;
  const ownerName = owner?.name || owner?.email || (goal.ownerId !== null ? `User #${goal.ownerId}` : null);

  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinCurrent, setCheckinCurrent] = useState<string>(goal.currentMetric?.toString() ?? '');
  const [checkinNote, setCheckinNote] = useState('');
  const [checkinStatus, setCheckinStatus] = useState<BrainGoalStatus | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submitCheckin = async () => {
    if (!onCheckin) return;
    setSubmitting(true);
    setErr(null);
    try {
      const args: { currentMetric?: number; note?: string; status?: BrainGoalStatus } = {};
      if (checkinCurrent.trim() !== '') {
        const n = Number(checkinCurrent);
        if (!Number.isFinite(n)) {
          setErr('currentMetric must be a number');
          setSubmitting(false);
          return;
        }
        args.currentMetric = n;
      }
      if (checkinNote.trim()) args.note = checkinNote.trim();
      if (checkinStatus !== '') args.status = checkinStatus;
      if (args.currentMetric === undefined && args.note === undefined && args.status === undefined) {
        setErr('Provide at least one of metric / note / status');
        setSubmitting(false);
        return;
      }
      await onCheckin(args);
      setCheckinOpen(false);
      setCheckinNote('');
      setCheckinStatus('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Check-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-foreground truncate">{goal.title}</h4>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${status.className}`}
            >
              <span className="material-icons text-[12px]">{status.icon}</span>
              {status.label}
            </span>
          </div>
          {goal.description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{goal.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onCheckin && (
            <button
              type="button"
              onClick={() => setCheckinOpen((v) => !v)}
              className="px-2 py-1 text-xs rounded-md border border-border text-foreground hover:bg-accent inline-flex items-center gap-1"
              title="Check in"
            >
              <span className="material-icons text-sm">update</span>
              Check in
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md"
              title="Edit goal"
              aria-label="Edit goal"
            >
              <span className="material-icons text-sm">edit</span>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
              title="Delete goal"
              aria-label="Delete goal"
            >
              <span className="material-icons text-sm">delete</span>
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {formatMetric(goal.currentMetric, goal.unit)}
            <span className="opacity-50"> / </span>
            {formatMetric(goal.targetMetric, goal.unit)}
          </span>
          {pct !== null && <span className="tabular-nums">{pct}%</span>}
        </div>
        <div className="mt-1 h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              goal.status === 'off_track'
                ? 'bg-red-500'
                : goal.status === 'at_risk'
                  ? 'bg-amber-500'
                  : goal.status === 'achieved'
                    ? 'bg-blue-500'
                    : goal.status === 'missed'
                      ? 'bg-zinc-500'
                      : 'bg-emerald-500'
            }`}
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
        {ownerName && (
          <span className="inline-flex items-center gap-1">
            <span className="material-icons text-[14px]">person</span>
            {ownerName}
          </span>
        )}
        {goal.targetDate && (
          <span className="inline-flex items-center gap-1">
            <span className="material-icons text-[14px]">event</span>
            target {relativeTime(goal.targetDate, { signed: true })}
          </span>
        )}
        {goal.lastCheckedInAt && (
          <span className="inline-flex items-center gap-1">
            <span className="material-icons text-[14px]">history</span>
            checked in {relativeTime(goal.lastCheckedInAt)} ago
          </span>
        )}
      </div>

      {checkinOpen && (
        <div className="bg-muted/40 border border-border rounded-md p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">Current metric</span>
              <input
                type="number"
                step="any"
                value={checkinCurrent}
                onChange={(e) => setCheckinCurrent(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={goal.targetMetric?.toString() ?? '0'}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">Override status</span>
              <select
                value={checkinStatus}
                onChange={(e) => setCheckinStatus(e.target.value as BrainGoalStatus | '')}
                className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">auto-classify</option>
                {GOAL_STATUSES.map((s) => (
                  <option key={s} value={s}>{goalStatusChip(s).label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Note (optional)</span>
            <textarea
              value={checkinNote}
              onChange={(e) => setCheckinNote(e.target.value)}
              rows={2}
              className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="What happened since the last check-in?"
            />
          </label>
          {err && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md px-2 py-1.5 text-xs text-destructive">
              {err}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setCheckinOpen(false); setErr(null); }}
              disabled={submitting}
              className="px-2.5 py-1 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitCheckin}
              disabled={submitting}
              className="px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {submitting
                ? <><span className="material-icons animate-spin text-sm">progress_activity</span>Saving…</>
                : <><span className="material-icons text-sm">check</span>Save check-in</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
