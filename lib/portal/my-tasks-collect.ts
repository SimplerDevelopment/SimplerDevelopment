import { db } from '@/lib/db';
import {
  projects,
  kanbanCards,
  kanbanColumns,
  kanbanCardAssignees,
  kanbanCardLabels,
  kanbanLabels,
  kanbanCardChecklistItems,
  clients,
  brainTasks,
  crmDeals,
  crmCompanies,
} from '@/lib/db/schema';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import {
  brainGroupId,
  brainTaskLinkUrl,
  kanbanCardLinkUrl,
  statusToColumn,
  type MyTaskCard,
  type MyTaskGroup,
} from './my-tasks-shape';

// Re-export shape types/helpers so call sites can import from one module.
export {
  brainGroupId,
  brainTaskLinkUrl,
  kanbanCardLinkUrl,
  statusToColumn,
  type MyTaskCard,
  type MyTaskCardSource,
  type MyTaskGroup,
} from './my-tasks-shape';

interface CollectOpts {
  userId: number;
  isStaff: boolean;
  openOnly: boolean;
}

// ── Kanban collector (extracted from app/api/portal/my-tasks/route.ts) ───────

/**
 * Collect kanban cards assigned to the user, grouped by project. Mirrors the
 * legacy logic in app/api/portal/my-tasks/route.ts exactly — same SQL shape,
 * same filter, same sort.
 */
export async function collectKanbanTasks(opts: CollectOpts): Promise<MyTaskGroup[]> {
  const { userId, isStaff, openOnly } = opts;

  // Cards where I'm an assignee
  const assignments = await db
    .select({ cardId: kanbanCardAssignees.cardId })
    .from(kanbanCardAssignees)
    .where(eq(kanbanCardAssignees.userId, userId));
  const cardIds = assignments.map((a) => a.cardId);
  if (cardIds.length === 0) return [];

  // Staff can see any card; clients only their own projects
  let visibleCards;
  if (isStaff) {
    visibleCards = await db
      .select({
        id: kanbanCards.id,
        projectId: kanbanCards.projectId,
        columnId: kanbanCards.columnId,
        columnName: kanbanColumns.name,
        columnIsDone: kanbanColumns.isDone,
        number: kanbanCards.number,
        title: kanbanCards.title,
        priority: kanbanCards.priority,
        dueDate: kanbanCards.dueDate,
      })
      .from(kanbanCards)
      .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
      .where(inArray(kanbanCards.id, cardIds));
  } else {
    const client = await getPortalClient(userId);
    if (!client) return [];
    visibleCards = await db
      .select({
        id: kanbanCards.id,
        projectId: kanbanCards.projectId,
        columnId: kanbanCards.columnId,
        columnName: kanbanColumns.name,
        columnIsDone: kanbanColumns.isDone,
        number: kanbanCards.number,
        title: kanbanCards.title,
        priority: kanbanCards.priority,
        dueDate: kanbanCards.dueDate,
      })
      .from(kanbanCards)
      .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
      .innerJoin(projects, and(eq(projects.id, kanbanCards.projectId), eq(projects.clientId, client.id)))
      .where(inArray(kanbanCards.id, cardIds));
  }

  const filtered = openOnly ? visibleCards.filter((c) => !c.columnIsDone) : visibleCards;
  if (filtered.length === 0) return [];

  const visibleCardIds = filtered.map((c) => c.id);
  const projectIds = Array.from(new Set(filtered.map((c) => c.projectId)));

  // Project info
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      projectKey: projects.projectKey,
      clientId: projects.clientId,
      clientName: clients.company,
    })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(inArray(projects.id, projectIds));

  // Labels
  const labelRows = await db
    .select({
      cardId: kanbanCardLabels.cardId,
      id: kanbanLabels.id,
      name: kanbanLabels.name,
      color: kanbanLabels.color,
    })
    .from(kanbanCardLabels)
    .innerJoin(kanbanLabels, eq(kanbanLabels.id, kanbanCardLabels.labelId))
    .where(inArray(kanbanCardLabels.cardId, visibleCardIds));
  const labelsByCard = labelRows.reduce<Record<number, { id: number; name: string; color: string }[]>>((acc, l) => {
    (acc[l.cardId] ??= []).push({ id: l.id, name: l.name, color: l.color });
    return acc;
  }, {});

  // Checklist progress
  const checklistRows = await db
    .select({
      cardId: kanbanCardChecklistItems.cardId,
      completed: kanbanCardChecklistItems.completed,
    })
    .from(kanbanCardChecklistItems)
    .where(inArray(kanbanCardChecklistItems.cardId, visibleCardIds));
  const checklistByCard = checklistRows.reduce<Record<number, { total: number; done: number }>>((acc, i) => {
    const r = (acc[i.cardId] ??= { total: 0, done: 0 });
    r.total += 1;
    if (i.completed) r.done += 1;
    return acc;
  }, {});

  const byProject = new Map<number, { project: typeof projectRows[number]; cards: MyTaskCard[] }>();
  for (const p of projectRows) byProject.set(p.id, { project: p, cards: [] });
  for (const c of filtered.sort((a, b) => {
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return ad - bd;
  })) {
    const slot = byProject.get(c.projectId);
    if (!slot) continue;
    slot.cards.push({
      id: c.id,
      source: 'kanban',
      key: slot.project.projectKey && c.number != null ? `${slot.project.projectKey}-${c.number}` : null,
      title: c.title,
      priority: c.priority,
      dueDate: c.dueDate,
      columnName: c.columnName,
      columnIsDone: c.columnIsDone ?? false,
      labels: labelsByCard[c.id] ?? [],
      checklist: checklistByCard[c.id] ?? null,
      linkUrl: kanbanCardLinkUrl(c.projectId, c.id),
    });
  }

  return Array.from(byProject.values())
    .filter((p) => p.cards.length > 0)
    .map<MyTaskGroup>((p) => ({
      id: p.project.id,
      source: 'kanban',
      name: p.project.name,
      projectKey: p.project.projectKey,
      clientName: p.project.clientName,
      cards: p.cards,
    }));
}

// ── Brain task collector ─────────────────────────────────────────────────────

/**
 * Collect Brain tasks owned by the user, grouped by their CRM linkage. Skips
 * brain tasks already promoted to a kanban card (those surface via the kanban
 * collector instead — no double-counting).
 */
export async function collectBrainTasks(opts: CollectOpts): Promise<MyTaskGroup[]> {
  const { userId, isStaff, openOnly } = opts;

  // Scope: own tasks; for non-staff, also constrained to active client.
  let clientId: number | null = null;
  if (!isStaff) {
    const client = await getPortalClient(userId);
    if (!client) return [];
    clientId = client.id;
  }

  const conditions = [
    eq(brainTasks.ownerId, userId),
    isNull(brainTasks.linkedKanbanCardId),
  ];
  if (clientId !== null) conditions.push(eq(brainTasks.clientId, clientId));
  if (openOnly) conditions.push(ne(brainTasks.status, 'done'));

  const taskRows = await db
    .select({
      id: brainTasks.id,
      clientId: brainTasks.clientId,
      title: brainTasks.title,
      status: brainTasks.status,
      priority: brainTasks.priority,
      dueDate: brainTasks.dueDate,
      dealId: brainTasks.dealId,
      companyId: brainTasks.companyId,
    })
    .from(brainTasks)
    .where(and(...conditions));

  if (taskRows.length === 0) return [];

  // Batch-resolve referenced deals + companies + clients (for clientName).
  const dealIds = Array.from(new Set(taskRows.map((t) => t.dealId).filter((x): x is number => x != null)));
  const companyIds = Array.from(new Set(taskRows.map((t) => t.companyId).filter((x): x is number => x != null)));
  const clientIds = Array.from(new Set(taskRows.map((t) => t.clientId)));

  const [dealRows, companyRows, clientRows] = await Promise.all([
    dealIds.length
      ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals).where(inArray(crmDeals.id, dealIds))
      : Promise.resolve([] as { id: number; title: string }[]),
    companyIds.length
      ? db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies).where(inArray(crmCompanies.id, companyIds))
      : Promise.resolve([] as { id: number; name: string }[]),
    clientIds.length
      ? db.select({ id: clients.id, company: clients.company }).from(clients).where(inArray(clients.id, clientIds))
      : Promise.resolve([] as { id: number; company: string | null }[]),
  ]);
  const dealById = new Map(dealRows.map((d) => [d.id, d.title]));
  const companyById = new Map(companyRows.map((c) => [c.id, c.name]));
  const clientById = new Map(clientRows.map((c) => [c.id, c.company]));

  // Bucket into groups.
  const groupMap = new Map<string, MyTaskGroup>();
  for (const t of taskRows) {
    const groupId = brainGroupId({ dealId: t.dealId, companyId: t.companyId });
    let group = groupMap.get(groupId);
    if (!group) {
      let name = 'Brain tasks';
      if (t.dealId) {
        const title = dealById.get(t.dealId) ?? `Deal #${t.dealId}`;
        name = `${title} · CRM Deal`;
      } else if (t.companyId) {
        const cname = companyById.get(t.companyId) ?? `Company #${t.companyId}`;
        name = `${cname} · CRM Company`;
      }
      group = {
        id: groupId,
        source: 'brain',
        name,
        projectKey: null,
        clientName: clientById.get(t.clientId) ?? null,
        cards: [],
      };
      groupMap.set(groupId, group);
    }
    group.cards.push({
      id: t.id,
      source: 'brain',
      key: `BRAIN-${t.id}`,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
      columnName: statusToColumn(t.status),
      columnIsDone: t.status === 'done',
      labels: [],
      checklist: null,
      linkUrl: brainTaskLinkUrl(t.id),
    });
  }

  // Sort cards within each group by dueDate ASC NULLS LAST (mirrors kanban path).
  for (const g of groupMap.values()) {
    g.cards.sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ad - bd;
    });
  }

  return Array.from(groupMap.values());
}
