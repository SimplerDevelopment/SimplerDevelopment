/**
 * Tenancy-scoped aggregation behind the Projects Dashboard (PUX-029 step 1).
 *
 * QUERY PLAN — a handful of set-based queries, never a per-project loop:
 *
 *   1. `projects` WHERE clientId = X                          → the ONLY place
 *      clientId is read from. Yields `projectIds`.
 *   2. `kanbanColumns`, `kanbanCards`, `sprints` WHERE projectId IN projectIds
 *      (parallel) — every one of these is scoped through the tenant's own
 *      `projectIds`, never re-derived from a fresh clientId filter.
 *   3. `kanbanCardDependencies`, `kanbanCardActivities`, `kanbanCardAssignees`
 *      WHERE cardId IN cardIds (parallel, cardIds from step 2) — scoped
 *      through the tenant's own `cardIds`.
 *   4. `users` WHERE id IN assigneeUserIds (names for the workload widget).
 *
 * That's 8 queries total regardless of how many projects/cards the client
 * has, vs. one round-trip per project. All bucketing, staleness, sprint-status
 * and milestone logic below is pure JS over the fetched rows — no further DB
 * access — which is what makes it unit-testable without booting Postgres.
 *
 * BLOCKER RESOLUTION NOTE: a blocker card's "done" status is resolved by
 * looking it up in the SAME cards/columns maps already fetched for this
 * client (no extra join needed — kanban_card_dependencies has no FK
 * enforcing same-project, but a same-client cross-project blocker still
 * resolves correctly since we fetched every card across the client's
 * projects). A blocker id that isn't in that map at all (i.e. it belongs to
 * a card outside this client's project set, or was deleted) is treated as
 * UNRESOLVED — we can't prove it's done, so we fail closed and keep the
 * dependent card in the `blocked` bucket rather than silently dropping it.
 */

import { db } from '@/lib/db';
import { projects, kanbanColumns, kanbanCards, kanbanCardDependencies, kanbanCardActivities, kanbanCardAssignees, sprints, users } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

// ── Row shapes (plain, DB-decoupled — what the pure helpers operate on) ────

export interface ProjectRow { id: number; name: string; clientId: number; dueDate: Date | string | null }
export interface ColumnRow { id: number; projectId: number; name: string; isDone: boolean; wipLimit: number | null }
export interface CardRow {
  id: number; projectId: number; columnId: number; title: string;
  dueDate: Date | string | null; storyPoints: number | null; sprintId: number | null;
  workflowState: string; updatedAt: Date | string;
}
export interface DependencyRow { blockedCardId: number; blockerCardId: number }
export interface ActivityRow { id: number; cardId: number; type: string; actorId: number | null; createdAt: Date | string }
export interface AssigneeRow { cardId: number; userId: number }
export interface UserRow { id: number; name: string }
export interface SprintRow { id: number; projectId: number; name: string; startDate: Date | string | null; endDate: Date | string | null; status: string }

// ── Response shapes ─────────────────────────────────────────────────────────

export interface DashboardCardRef {
  cardId: number;
  title: string;
  projectId: number;
  projectName: string;
  columnName: string | null;
  dueDate?: string | null;
  assigneeIds?: number[];
  blockedBy?: number[];
}

export interface WipBreach {
  projectId: number;
  projectName: string;
  columnId: number;
  columnName: string;
  wipLimit: number;
  count: number;
}

export interface AttentionQueue {
  blocked: DashboardCardRef[];
  overdue: DashboardCardRef[];
  dueThisWeek: DashboardCardRef[];
  wipBreaches: WipBreach[];
  stale: DashboardCardRef[];
  validating: DashboardCardRef[];
}

export type SprintHealthStatus = 'on_track' | 'at_risk' | 'none';

export interface ProjectHealth {
  projectId: number;
  name: string;
  totalCards: number;
  shippedCards: number;
  pctShipped: number;
  inFlight: number;
  blockedCount: number;
  lastActivityAt: string | null;
  sprint: { id: number | null; name: string | null; endDate: string | null; status: SprintHealthStatus };
}

export interface ActivityFeedItem {
  id: number;
  cardId: number;
  cardTitle: string;
  projectId: number;
  projectName: string;
  type: string;
  actorId: number | null;
  createdAt: string;
}

export interface WorkloadItem {
  userId: number;
  name: string;
  openCards: number;
  overdue: number;
}

export interface Milestone {
  kind: 'project_due' | 'sprint_end';
  projectId: number;
  projectName: string;
  name: string;
  date: string;
}

export interface ProjectsDashboard {
  attention: AttentionQueue;
  health: ProjectHealth[];
  activity: ActivityFeedItem[];
  workload: WorkloadItem[];
  milestones: Milestone[];
}

// ── Date helpers ─────────────────────────────────────────────────────────

function toMs(d: Date | string | number | null | undefined): number | null {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : typeof d === 'number' ? d : new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
}

function toIso(d: Date | string | number | null | undefined): string | null {
  const ms = toMs(d);
  return ms == null ? null : new Date(ms).toISOString();
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Pure bucketing / status helpers (unit-testable without a DB) ──────────

export function isCardDone(card: CardRow, columnsById: Map<number, ColumnRow>): boolean {
  return columnsById.get(card.columnId)?.isDone === true;
}

/** Overdue: not-done, dueDate < now. Due this week: not-done, now <= dueDate <= now+7d. */
export function bucketOverdueAndDueThisWeek(
  cards: CardRow[],
  columnsById: Map<number, ColumnRow>,
  now: Date,
): { overdue: CardRow[]; dueThisWeek: CardRow[] } {
  const nowMs = now.getTime();
  const weekMs = nowMs + 7 * DAY_MS;
  const overdue: CardRow[] = [];
  const dueThisWeek: CardRow[] = [];
  for (const card of cards) {
    if (isCardDone(card, columnsById)) continue;
    const due = toMs(card.dueDate);
    if (due == null) continue;
    if (due < nowMs) overdue.push(card);
    else if (due <= weekMs) dueThisWeek.push(card);
  }
  return { overdue, dueThisWeek };
}

/**
 * blockedCardId -> unresolved blockerCardIds. Mirrors the blocker-chain
 * pattern in lib/mcp/tools/kanban-artifacts.ts:347-368 (unresolved = blocker's
 * column isDone is false/unknown), generalized to run over every card in the
 * client's projects in one pass instead of one project's backlog.
 */
export function computeBlockedMap(
  deps: DependencyRow[],
  cardsById: Map<number, CardRow>,
  columnsById: Map<number, ColumnRow>,
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const dep of deps) {
    const blocker = cardsById.get(dep.blockerCardId);
    const resolved = blocker ? isCardDone(blocker, columnsById) : false; // unknown blocker => fail closed
    if (resolved) continue;
    const arr = map.get(dep.blockedCardId) ?? [];
    arr.push(dep.blockerCardId);
    map.set(dep.blockedCardId, arr);
  }
  return map;
}

export function computeWipBreaches(
  columns: ColumnRow[],
  cards: CardRow[],
  projectsById: Map<number, ProjectRow>,
): WipBreach[] {
  const countByColumn = new Map<number, number>();
  for (const c of cards) countByColumn.set(c.columnId, (countByColumn.get(c.columnId) ?? 0) + 1);
  const breaches: WipBreach[] = [];
  for (const col of columns) {
    if (col.wipLimit == null) continue;
    const count = countByColumn.get(col.id) ?? 0;
    if (count > col.wipLimit) {
      breaches.push({
        projectId: col.projectId,
        projectName: projectsById.get(col.projectId)?.name ?? '',
        columnId: col.id,
        columnName: col.name,
        wipLimit: col.wipLimit,
        count,
      });
    }
  }
  return breaches;
}

/** Stale: not-done, no activity (falling back to updatedAt) in `staleAfterDays`. */
export function bucketStale(
  cards: CardRow[],
  columnsById: Map<number, ColumnRow>,
  lastActivityByCard: Map<number, number>,
  now: Date,
  staleAfterDays: number,
): CardRow[] {
  const cutoff = now.getTime() - staleAfterDays * DAY_MS;
  const stale: CardRow[] = [];
  for (const card of cards) {
    if (isCardDone(card, columnsById)) continue;
    const lastActivity = lastActivityByCard.get(card.id) ?? toMs(card.updatedAt) ?? 0;
    if (lastActivity < cutoff) stale.push(card);
  }
  return stale;
}

export function isValidatingColumn(col: ColumnRow): boolean {
  return !col.isDone && col.name.trim().toLowerCase() === 'validating';
}

export function bucketValidating(cards: CardRow[], columns: ColumnRow[]): CardRow[] {
  const validatingColumnIds = new Set(columns.filter(isValidatingColumn).map((c) => c.id));
  return cards.filter((c) => validatingColumnIds.has(c.columnId));
}

/**
 * Sprint at-risk formula: assume a linear burn from sprint.startDate to
 * sprint.endDate. At the current elapsed-time fraction, the *expected*
 * remaining amount (points, or cards when no points are tracked) is
 * `total * (1 - elapsedFraction)`. `at_risk` when the ACTUAL remaining
 * amount exceeds that projection — i.e. the sprint is burning down slower
 * than a straight line to zero at endDate would require. Sprints with no
 * usable start/end window, or with nothing to burn, are reported `on_track`
 * (there's nothing to be at risk of).
 */
export function computeSprintStatus(input: {
  startDate: Date | string | null;
  endDate: Date | string | null;
  totalPoints: number;
  remainingPoints: number;
  totalCards: number;
  remainingCards: number;
  now: Date;
}): SprintHealthStatus {
  const startMs = toMs(input.startDate);
  const endMs = toMs(input.endDate);
  if (startMs == null || endMs == null || endMs <= startMs) return 'on_track';

  const nowMs = input.now.getTime();
  const elapsedFraction = Math.min(1, Math.max(0, (nowMs - startMs) / (endMs - startMs)));
  const expectedRemainingFraction = 1 - elapsedFraction;

  if (input.totalPoints > 0) {
    return input.remainingPoints > input.totalPoints * expectedRemainingFraction ? 'at_risk' : 'on_track';
  }
  if (input.totalCards > 0) {
    return input.remainingCards > input.totalCards * expectedRemainingFraction ? 'at_risk' : 'on_track';
  }
  return 'on_track';
}

export function computeProjectHealth(
  project: ProjectRow,
  projectCards: CardRow[],
  columnsById: Map<number, ColumnRow>,
  blockedCardIds: Set<number>,
  lastActivityByCard: Map<number, number>,
  activeSprint: SprintRow | null,
  now: Date,
): ProjectHealth {
  const totalCards = projectCards.length;
  const shippedCards = projectCards.filter((c) => isCardDone(c, columnsById)).length;
  const pctShipped = totalCards === 0 ? 0 : Math.round((shippedCards / totalCards) * 100);
  const inFlight = totalCards - shippedCards;
  const blockedCount = projectCards.filter((c) => blockedCardIds.has(c.id)).length;

  let lastActivityMs: number | null = null;
  for (const c of projectCards) {
    const t = lastActivityByCard.get(c.id) ?? toMs(c.updatedAt);
    if (t != null && (lastActivityMs == null || t > lastActivityMs)) lastActivityMs = t;
  }

  let sprint: ProjectHealth['sprint'];
  if (activeSprint) {
    const sprintCards = projectCards.filter((c) => c.sprintId === activeSprint.id);
    const remaining = sprintCards.filter((c) => !isCardDone(c, columnsById));
    const totalPoints = sprintCards.reduce((s, c) => s + (c.storyPoints ?? 0), 0);
    const remainingPoints = remaining.reduce((s, c) => s + (c.storyPoints ?? 0), 0);
    const status = computeSprintStatus({
      startDate: activeSprint.startDate,
      endDate: activeSprint.endDate,
      totalPoints,
      remainingPoints,
      totalCards: sprintCards.length,
      remainingCards: remaining.length,
      now,
    });
    sprint = { id: activeSprint.id, name: activeSprint.name, endDate: toIso(activeSprint.endDate), status };
  } else {
    sprint = { id: null, name: null, endDate: null, status: 'none' };
  }

  return {
    projectId: project.id,
    name: project.name,
    totalCards,
    shippedCards,
    pctShipped,
    inFlight,
    blockedCount,
    lastActivityAt: toIso(lastActivityMs),
    sprint,
  };
}

export function buildActivityFeed(
  activities: ActivityRow[],
  cardsById: Map<number, CardRow>,
  projectsById: Map<number, ProjectRow>,
  limit: number,
): ActivityFeedItem[] {
  const sorted = [...activities].sort((a, b) => (toMs(b.createdAt) ?? 0) - (toMs(a.createdAt) ?? 0));
  const out: ActivityFeedItem[] = [];
  for (const a of sorted) {
    if (out.length >= limit) break;
    const card = cardsById.get(a.cardId);
    if (!card) continue; // defensive — activity for a card outside this client's fetched set
    out.push({
      id: a.id,
      cardId: a.cardId,
      cardTitle: card.title,
      projectId: card.projectId,
      projectName: projectsById.get(card.projectId)?.name ?? '',
      type: a.type,
      actorId: a.actorId,
      createdAt: toIso(a.createdAt)!,
    });
  }
  return out;
}

export function buildWorkload(
  cards: CardRow[],
  columnsById: Map<number, ColumnRow>,
  assignees: AssigneeRow[],
  usersById: Map<number, UserRow>,
  now: Date,
): WorkloadItem[] {
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const openCardsByUser = new Map<number, number>();
  const overdueByUser = new Map<number, number>();
  const nowMs = now.getTime();
  for (const a of assignees) {
    const card = cardsById.get(a.cardId);
    if (!card || isCardDone(card, columnsById)) continue;
    openCardsByUser.set(a.userId, (openCardsByUser.get(a.userId) ?? 0) + 1);
    const due = toMs(card.dueDate);
    if (due != null && due < nowMs) overdueByUser.set(a.userId, (overdueByUser.get(a.userId) ?? 0) + 1);
  }
  const out: WorkloadItem[] = [];
  for (const [userId, openCards] of openCardsByUser) {
    out.push({ userId, name: usersById.get(userId)?.name ?? `User ${userId}`, openCards, overdue: overdueByUser.get(userId) ?? 0 });
  }
  out.sort((a, b) => b.openCards - a.openCards);
  return out;
}

export function buildMilestones(
  projectRows: ProjectRow[],
  sprintRows: SprintRow[],
  now: Date,
  horizonDays = 60,
): Milestone[] {
  const nowMs = now.getTime();
  const horizonMs = nowMs + horizonDays * DAY_MS;
  const projectsById = new Map(projectRows.map((p) => [p.id, p]));
  const out: Milestone[] = [];
  for (const p of projectRows) {
    const due = toMs(p.dueDate);
    if (due != null && due >= nowMs && due <= horizonMs) {
      out.push({ kind: 'project_due', projectId: p.id, projectName: p.name, name: p.name, date: toIso(p.dueDate)! });
    }
  }
  for (const s of sprintRows) {
    const end = toMs(s.endDate);
    if (end != null && end >= nowMs && end <= horizonMs) {
      out.push({ kind: 'sprint_end', projectId: s.projectId, projectName: projectsById.get(s.projectId)?.name ?? '', name: s.name, date: toIso(s.endDate)! });
    }
  }
  out.sort((a, b) => (toMs(a.date) ?? 0) - (toMs(b.date) ?? 0));
  return out;
}

function toCardRef(
  card: CardRow,
  columnsById: Map<number, ColumnRow>,
  projectsById: Map<number, ProjectRow>,
  assigneesByCard: Map<number, number[]>,
  blockedByCard?: Map<number, number[]>,
): DashboardCardRef {
  return {
    cardId: card.id,
    title: card.title,
    projectId: card.projectId,
    projectName: projectsById.get(card.projectId)?.name ?? '',
    columnName: columnsById.get(card.columnId)?.name ?? null,
    dueDate: toIso(card.dueDate),
    assigneeIds: assigneesByCard.get(card.id) ?? [],
    blockedBy: blockedByCard?.get(card.id),
  };
}

function emptyDashboard(): ProjectsDashboard {
  return {
    attention: { blocked: [], overdue: [], dueThisWeek: [], wipBreaches: [], stale: [], validating: [] },
    health: [],
    activity: [],
    workload: [],
    milestones: [],
  };
}

// ── Orchestrator ────────────────────────────────────────────────────────

export interface GetProjectsDashboardArgs {
  clientId: number;
  now?: Date;
  staleAfterDays?: number;
  limit?: number;
}

export async function getProjectsDashboard({
  clientId,
  now = new Date(),
  staleAfterDays = 14,
  limit = 50,
}: GetProjectsDashboardArgs): Promise<ProjectsDashboard> {
  // Query 1 — the tenant boundary. Nothing below re-derives clientId; every
  // other table is reached only through the projectIds/cardIds this yields.
  const projectRows: ProjectRow[] = await db
    .select({ id: projects.id, name: projects.name, clientId: projects.clientId, dueDate: projects.dueDate })
    .from(projects)
    .where(eq(projects.clientId, clientId));

  const projectIds = projectRows.map((p) => p.id);
  if (projectIds.length === 0) return emptyDashboard();

  const [columnRows, cardRows, sprintRows] = await Promise.all([
    db
      .select({ id: kanbanColumns.id, projectId: kanbanColumns.projectId, name: kanbanColumns.name, isDone: kanbanColumns.isDone, wipLimit: kanbanColumns.wipLimit })
      .from(kanbanColumns)
      .where(inArray(kanbanColumns.projectId, projectIds)) as Promise<ColumnRow[]>,
    db
      .select({
        id: kanbanCards.id, projectId: kanbanCards.projectId, columnId: kanbanCards.columnId, title: kanbanCards.title,
        dueDate: kanbanCards.dueDate, storyPoints: kanbanCards.storyPoints, sprintId: kanbanCards.sprintId,
        workflowState: kanbanCards.workflowState, updatedAt: kanbanCards.updatedAt,
      })
      .from(kanbanCards)
      .where(inArray(kanbanCards.projectId, projectIds)) as Promise<CardRow[]>,
    db
      .select({ id: sprints.id, projectId: sprints.projectId, name: sprints.name, startDate: sprints.startDate, endDate: sprints.endDate, status: sprints.status })
      .from(sprints)
      .where(inArray(sprints.projectId, projectIds)) as Promise<SprintRow[]>,
  ]);

  const cardIds = cardRows.map((c) => c.id);

  const [depRows, activityRows, assigneeRows]: [DependencyRow[], ActivityRow[], AssigneeRow[]] = cardIds.length
    ? await Promise.all([
        db
          .select({ blockedCardId: kanbanCardDependencies.blockedCardId, blockerCardId: kanbanCardDependencies.blockerCardId })
          .from(kanbanCardDependencies)
          .where(inArray(kanbanCardDependencies.blockedCardId, cardIds)) as Promise<DependencyRow[]>,
        db
          .select({ id: kanbanCardActivities.id, cardId: kanbanCardActivities.cardId, type: kanbanCardActivities.type, actorId: kanbanCardActivities.userId, createdAt: kanbanCardActivities.createdAt })
          .from(kanbanCardActivities)
          .where(inArray(kanbanCardActivities.cardId, cardIds)) as Promise<ActivityRow[]>,
        db
          .select({ cardId: kanbanCardAssignees.cardId, userId: kanbanCardAssignees.userId })
          .from(kanbanCardAssignees)
          .where(inArray(kanbanCardAssignees.cardId, cardIds)) as Promise<AssigneeRow[]>,
      ])
    : [[], [], []];

  const assigneeUserIds = [...new Set(assigneeRows.map((a) => a.userId))];
  const userRows: UserRow[] = assigneeUserIds.length
    ? ((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, assigneeUserIds))) as UserRow[])
    : [];

  // ── maps ──
  const projectsById = new Map(projectRows.map((p) => [p.id, p]));
  const columnsById = new Map(columnRows.map((c) => [c.id, c]));
  const cardsById = new Map(cardRows.map((c) => [c.id, c]));
  const usersById = new Map(userRows.map((u) => [u.id, u]));

  const assigneesByCard = new Map<number, number[]>();
  for (const a of assigneeRows) {
    const arr = assigneesByCard.get(a.cardId) ?? [];
    arr.push(a.userId);
    assigneesByCard.set(a.cardId, arr);
  }

  const lastActivityByCard = new Map<number, number>();
  for (const a of activityRows) {
    const t = toMs(a.createdAt);
    if (t == null) continue;
    const prev = lastActivityByCard.get(a.cardId);
    if (prev == null || t > prev) lastActivityByCard.set(a.cardId, t);
  }

  // ── attention queue ──
  const blockedMap = computeBlockedMap(depRows, cardsById, columnsById);
  const blockedCards = cardRows.filter((c) => !isCardDone(c, columnsById) && blockedMap.has(c.id));
  const { overdue, dueThisWeek } = bucketOverdueAndDueThisWeek(cardRows, columnsById, now);
  const wipBreaches = computeWipBreaches(columnRows, cardRows, projectsById);
  const staleCards = bucketStale(cardRows, columnsById, lastActivityByCard, now, staleAfterDays);
  const validatingCards = bucketValidating(cardRows, columnRows);

  const attention: AttentionQueue = {
    blocked: blockedCards.slice(0, limit).map((c) => toCardRef(c, columnsById, projectsById, assigneesByCard, blockedMap)),
    overdue: overdue.slice(0, limit).map((c) => toCardRef(c, columnsById, projectsById, assigneesByCard)),
    dueThisWeek: dueThisWeek.slice(0, limit).map((c) => toCardRef(c, columnsById, projectsById, assigneesByCard)),
    wipBreaches: wipBreaches.slice(0, limit),
    stale: staleCards.slice(0, limit).map((c) => toCardRef(c, columnsById, projectsById, assigneesByCard)),
    validating: validatingCards.slice(0, limit).map((c) => toCardRef(c, columnsById, projectsById, assigneesByCard)),
  };

  // ── per-project health ──
  const blockedCardIds = new Set(blockedCards.map((c) => c.id));
  const activeSprintByProject = new Map<number, SprintRow>();
  for (const s of sprintRows) {
    if (s.status === 'active' && !activeSprintByProject.has(s.projectId)) activeSprintByProject.set(s.projectId, s);
  }
  const cardsByProject = new Map<number, CardRow[]>();
  for (const c of cardRows) {
    const arr = cardsByProject.get(c.projectId) ?? [];
    arr.push(c);
    cardsByProject.set(c.projectId, arr);
  }
  const health = projectRows.map((p) =>
    computeProjectHealth(
      p,
      cardsByProject.get(p.id) ?? [],
      columnsById,
      blockedCardIds,
      lastActivityByCard,
      activeSprintByProject.get(p.id) ?? null,
      now,
    ),
  );

  // ── activity feed / workload / milestones ──
  const activity = buildActivityFeed(activityRows, cardsById, projectsById, limit);
  const workload = buildWorkload(cardRows, columnsById, assigneeRows, usersById, now);
  const milestones = buildMilestones(projectRows, sprintRows, now, 60);

  return { attention, health, activity, workload, milestones };
}
