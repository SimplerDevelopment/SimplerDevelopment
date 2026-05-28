// Publishing Command Center — per-client board bootstrap.
//
// On first visit to /portal/publishing, the client needs:
//   1. A `projects` row flagged `system_kind = 'publishing'`
//   2. Six `kanban_columns` matching PUBLISHING_STAGES (one per stage, in order)
//   3. The `clients.publishing_project_id` pointer set so subsequent visits
//      skip the bootstrap
//
// `getOrCreatePublishingProject` is idempotent and safe to call on every page
// load: if the client already has a Publishing project the function returns
// the existing one without touching anything.

import { db } from '@/lib/db';
import { projects, kanbanColumns, clients } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { PUBLISHING_SYSTEM_KIND, PUBLISHING_STAGES } from './constants';

export interface PublishingProject {
  id: number;
  clientId: number;
  /** kanban_columns rows in stage order, with the stage key embedded so
   *  consumers can route by stage without re-parsing column names. */
  columns: Array<{
    id: number;
    stageKey: string;
    name: string;
    order: number;
    color: string;
    isDone: boolean;
  }>;
}

/** Returns the per-client Publishing project, creating it (and its six
 *  default stage columns) on first call. Idempotent. */
export async function getOrCreatePublishingProject(
  clientId: number,
  createdByUserId: number,
): Promise<PublishingProject> {
  const existing = await findPublishingProject(clientId);
  if (existing) return existing;
  return createPublishingProject(clientId, createdByUserId);
}

async function findPublishingProject(clientId: number): Promise<PublishingProject | null> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.clientId, clientId), eq(projects.systemKind, PUBLISHING_SYSTEM_KIND)))
    .limit(1);
  if (rows.length === 0) return null;
  const projectId = rows[0].id;
  const columns = await db
    .select()
    .from(kanbanColumns)
    .where(eq(kanbanColumns.projectId, projectId))
    .orderBy(kanbanColumns.order);
  return {
    id: projectId,
    clientId,
    columns: columns.map((c) => ({
      id: c.id,
      stageKey: mapColumnNameToStageKey(c.name),
      name: c.name,
      order: c.order,
      color: c.color ?? '#6b7280',
      isDone: c.isDone,
    })),
  };
}

async function createPublishingProject(
  clientId: number,
  createdByUserId: number,
): Promise<PublishingProject> {
  // Transactional so a partially-bootstrapped client never exists; if any
  // step fails, the whole thing rolls back and the next visit retries.
  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        clientId,
        name: 'Publishing',
        description:
          'Multi-channel publishing workflow. One card per outbound content piece. ' +
          'Stages: Idea → Draft → In Review → Scheduled → Published → Archived.',
        systemKind: PUBLISHING_SYSTEM_KIND,
        status: 'active',
        createdBy: createdByUserId,
      })
      .returning({ id: projects.id });

    const insertedColumns = await tx
      .insert(kanbanColumns)
      .values(
        PUBLISHING_STAGES.map((stage, idx) => ({
          projectId: project.id,
          name: stage.name,
          order: idx,
          color: stage.color,
          isDone: stage.isDone,
        })),
      )
      .returning();

    await tx
      .update(clients)
      .set({ publishingProjectId: project.id, updatedAt: new Date() })
      .where(eq(clients.id, clientId));

    return {
      id: project.id,
      clientId,
      columns: insertedColumns.map((c) => ({
        id: c.id,
        stageKey: mapColumnNameToStageKey(c.name),
        name: c.name,
        order: c.order,
        color: c.color ?? '#6b7280',
        isDone: c.isDone,
      })),
    };
  });
}

/** Reverse-lookup from human column name back to the stable stage key. The
 *  bootstrap writes column names from PUBLISHING_STAGES; admins editing the
 *  column name in the kanban UI would break this mapping. Stage customization
 *  is explicitly a phase-2 unlock — for v1 we trust the bootstrap names. */
function mapColumnNameToStageKey(name: string): string {
  const stage = PUBLISHING_STAGES.find((s) => s.name === name);
  return stage?.key ?? 'unknown';
}
