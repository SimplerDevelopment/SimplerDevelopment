// Brain home, the pure half (PUX-158, design doc screen 17): turns the
// summary the dashboard already computes, the five newest notes, the
// proposed decisions and the active run into what the page shows. No I/O.
import { noteType, NOTE_TYPE_ICON, type NoteType } from './note-type';
import { ago } from '@/lib/portal/needs-you-shape';

export interface BrainStatusRow { icon: string; label: string; detail: string; href: string }
export interface BrainHomeNote { id: number; title: string; type: NoteType; icon: string; when: string; needsReview: boolean; href: string }
export interface BrainHomeDecision { id: number; title: string; owned: boolean; when: string; href: string }
export interface BrainHomeRun { id: number; name: string; done: number; total: number; href: string }

type SummaryLike = {
  counts: { pendingReviewItems: number; openTasks: number; playbookRunsActive: number; documentsRequiredReadsPending: number; goalsAtRisk: number };
  overdueTasks: { title: string }[];
  blockedTasks: { title: string }[];
  upcomingTasks: { title: string }[];
};
type NoteLike = { id: number; title: string; source: string; meetingId: number | null; sourceUrl: string | null; attachmentFilename: string | null; updatedAt: Date | string; needsReview: boolean };
type DecisionLike = { id: number; title: string; decisionMakerId: number | null; createdAt: Date | string };
type RunLike = { id: number; playbookName: string; stepProgress: { completed: number; total: number } };

const titles = (rows: { title: string }[], n = 3) => rows.slice(0, n).map((r) => r.title).join(' · ');

/** The gold card: one line per thing the Brain is holding for you. Empty rows are dropped. */
export function brainStatusRows(s: SummaryLike | null): BrainStatusRow[] {
  if (!s) return [];
  const rows: BrainStatusRow[] = [];
  if (s.counts.pendingReviewItems > 0) rows.push({ icon: 'inventory_2', label: `${s.counts.pendingReviewItems} item${s.counts.pendingReviewItems === 1 ? '' : 's'} to review`, detail: 'Notes, proposed tasks and decision drafts waiting for a yes', href: '/portal/brain/tasks?tab=review' });
  if (s.overdueTasks.length > 0) rows.push({ icon: 'warning', label: `${s.overdueTasks.length} task${s.overdueTasks.length === 1 ? '' : 's'} overdue`, detail: titles(s.overdueTasks), href: '/portal/brain/tasks' });
  if (s.blockedTasks.length > 0) rows.push({ icon: 'block', label: `${s.blockedTasks.length} blocked`, detail: titles(s.blockedTasks), href: '/portal/brain/tasks' });
  if (s.upcomingTasks.length > 0) rows.push({ icon: 'task_alt', label: `${s.upcomingTasks.length} task${s.upcomingTasks.length === 1 ? '' : 's'} due this week`, detail: titles(s.upcomingTasks), href: '/portal/brain/tasks' });
  if (s.counts.goalsAtRisk > 0) rows.push({ icon: 'flag', label: `${s.counts.goalsAtRisk} goal${s.counts.goalsAtRisk === 1 ? '' : 's'} at risk`, detail: 'Behind on the check-ins', href: '/portal/brain/goals' });
  if (s.counts.documentsRequiredReadsPending > 0) rows.push({ icon: 'menu_book', label: `${s.counts.documentsRequiredReadsPending} required read${s.counts.documentsRequiredReadsPending === 1 ? '' : 's'} pending`, detail: 'Documents someone still has to acknowledge', href: '/portal/brain/documents' });
  return rows;
}

export function brainHomeNotes(notes: NoteLike[], now = new Date()): BrainHomeNote[] {
  return notes.map((n) => {
    const type = noteType(n);
    return { id: n.id, title: n.title, type, icon: NOTE_TYPE_ICON[type], when: ago(new Date(n.updatedAt), now), needsReview: n.needsReview, href: `/portal/brain/knowledge/${n.id}` };
  });
}

/** Proposed decisions, ownerless first — "needs an owner" is decision_maker_id IS NULL (not a column). */
export function brainNeedsOwner(decisions: DecisionLike[], now = new Date()): BrainHomeDecision[] {
  return [...decisions]
    .sort((a, b) => Number(!!a.decisionMakerId) - Number(!!b.decisionMakerId))
    .map((d) => ({ id: d.id, title: d.title, owned: !!d.decisionMakerId, when: ago(new Date(d.createdAt), now), href: `/portal/brain/decisions/${d.id}` }));
}

export function brainActiveRun(runs: RunLike[]): BrainHomeRun | null {
  const r = runs[0];
  return r ? { id: r.id, name: r.playbookName, done: r.stepProgress.completed, total: r.stepProgress.total, href: `/portal/brain/playbook-runs/${r.id}` } : null;
}
