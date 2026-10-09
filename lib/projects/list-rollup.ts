// Per-project roll-up for the projects LIST (PUX-151, design doc screen 10):
// progress, lane counts, last activity and members, read from each board.
// Four fixed queries for the whole page, never one per project. Every query
// joins `projects` and filters on clientId as well as the id list, so a
// foreign project id in `ids` yields nothing rather than another tenant's
// board. (The dashboard's lib/projects/dashboard-aggregate.ts computes a
// sibling shape — progress + last activity, no lanes, no members — for a
// different screen; it is a pinned file, hence a small module beside it.)
import { db } from '@/lib/db';
import { kanbanCardActivities, kanbanCardAssignees, kanbanCards, kanbanColumns, projects, users } from '@/lib/db/schema';
import { and, count, eq, inArray, max } from 'drizzle-orm';
import { shapeProjectRollup, type ProjectRollup } from './list-rollup-shape';

export type { ProjectRollup } from './list-rollup-shape';

export async function getProjectListRollup(clientId: number, ids: number[]): Promise<Record<number, ProjectRollup>> {
  if (ids.length === 0) return {};
  const scope = and(eq(projects.clientId, clientId), inArray(projects.id, ids));

  const [lanes, activity, touched, members] = await Promise.all([
    db
      .select({ projectId: projects.id, name: kanbanColumns.name, order: kanbanColumns.order, isDone: kanbanColumns.isDone, count: count(kanbanCards.id) })
      .from(kanbanColumns)
      .innerJoin(projects, eq(projects.id, kanbanColumns.projectId))
      .leftJoin(kanbanCards, eq(kanbanCards.columnId, kanbanColumns.id))
      .where(scope)
      .groupBy(projects.id, kanbanColumns.id, kanbanColumns.name, kanbanColumns.order, kanbanColumns.isDone),
    db
      .select({ projectId: projects.id, at: max(kanbanCardActivities.createdAt) })
      .from(kanbanCardActivities)
      .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardActivities.cardId))
      .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
      .where(scope)
      .groupBy(projects.id),
    db
      .select({ projectId: projects.id, at: max(kanbanCards.updatedAt) })
      .from(kanbanCards)
      .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
      .where(scope)
      .groupBy(projects.id),
    db
      .selectDistinct({ projectId: projects.id, userId: users.id, name: users.name })
      .from(kanbanCardAssignees)
      .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardAssignees.cardId))
      .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
      .innerJoin(users, eq(users.id, kanbanCardAssignees.userId))
      .where(scope),
  ]);

  return shapeProjectRollup(lanes.map((l) => ({ ...l, count: Number(l.count) })), [...activity, ...touched], members);
}
