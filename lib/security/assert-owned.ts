import { db } from '@/lib/db';
import {
  crmPipelines, crmPipelineStages, crmContacts, crmCompanies,
} from '@/lib/db/schema/crm';
import { kanbanColumns, projects } from '@/lib/db/schema';
import { clientMembers } from '@/lib/db/schema/sites';
import { users } from '@/lib/db/schema/auth';
import { and, eq } from 'drizzle-orm';

/**
 * Tenant-ownership assertions for foreign-key writes.
 *
 * Mass-assignment of `body.fooId` into Drizzle `.set({ fooId })` calls is the
 * dominant cross-tenant write primitive. Use these helpers BEFORE the write to
 * verify the supplied id belongs to the active client.
 *
 * Helpers throw `OwnershipError` on failure; callers should translate to 4xx.
 */

export class OwnershipError extends Error {
  constructor(public field: string, public id: number | string) {
    super(`Forbidden: ${field}=${id} not in active client.`);
  }
}

export async function assertPipelineInClient(pipelineId: number, clientId: number): Promise<void> {
  const [row] = await db.select({ id: crmPipelines.id }).from(crmPipelines)
    .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.clientId, clientId))).limit(1);
  if (!row) throw new OwnershipError('pipelineId', pipelineId);
}

export async function assertStageInClient(stageId: number, clientId: number): Promise<void> {
  const [row] = await db
    .select({ id: crmPipelineStages.id })
    .from(crmPipelineStages)
    .innerJoin(crmPipelines, eq(crmPipelines.id, crmPipelineStages.pipelineId))
    .where(and(eq(crmPipelineStages.id, stageId), eq(crmPipelines.clientId, clientId)))
    .limit(1);
  if (!row) throw new OwnershipError('stageId', stageId);
}

export async function assertContactInClient(contactId: number, clientId: number): Promise<void> {
  const [row] = await db.select({ id: crmContacts.id }).from(crmContacts)
    .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, clientId))).limit(1);
  if (!row) throw new OwnershipError('contactId', contactId);
}

export async function assertCompanyInClient(companyId: number, clientId: number): Promise<void> {
  const [row] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
    .where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.clientId, clientId))).limit(1);
  if (!row) throw new OwnershipError('companyId', companyId);
}

export async function assertColumnInProject(columnId: number, projectId: number): Promise<void> {
  const [row] = await db.select({ id: kanbanColumns.id }).from(kanbanColumns)
    .where(and(eq(kanbanColumns.id, columnId), eq(kanbanColumns.projectId, projectId))).limit(1);
  if (!row) throw new OwnershipError('columnId', columnId);
}

export async function assertProjectInClient(projectId: number, clientId: number): Promise<void> {
  const [row] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
  if (!row) throw new OwnershipError('projectId', projectId);
}

/**
 * Verify the user is either a member of the active client or a staff user
 * (admin/editor/employee). Used for ownerId / assignedTo / mentions fields.
 */
export async function assertUserVisibleToClient(userId: number, clientId: number): Promise<void> {
  const [member] = await db.select({ id: clientMembers.id }).from(clientMembers)
    .where(and(eq(clientMembers.userId, userId), eq(clientMembers.clientId, clientId))).limit(1);
  if (member) return;
  const [staff] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (staff && (staff.role === 'admin' || staff.role === 'editor' || staff.role === 'employee')) return;
  throw new OwnershipError('userId', userId);
}

/** Filter a list of userIds to those visible to the active client. */
export async function filterUserIdsVisibleToClient(userIds: number[], clientId: number): Promise<number[]> {
  if (userIds.length === 0) return [];
  const allowed = new Set<number>();
  const memberRows = await db.select({ userId: clientMembers.userId }).from(clientMembers)
    .where(eq(clientMembers.clientId, clientId));
  for (const r of memberRows) allowed.add(r.userId);
  const staffRows = await db.select({ id: users.id, role: users.role }).from(users);
  for (const r of staffRows) {
    if (r.role === 'admin' || r.role === 'editor' || r.role === 'employee') allowed.add(r.id);
  }
  return userIds.filter((id) => allowed.has(id));
}
