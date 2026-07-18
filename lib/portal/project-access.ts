// DB-touching resolvers for per-project access. Imports the schema and the
// session, so anything that imports this module needs DATABASE_URL.

import { cache } from 'react';
import { db } from '@/lib/db';
import { projectMembers, projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { isPortalStaff } from '@/lib/portal';
import { getPortalClient } from '@/lib/portal-client';
import { roleAtLeast, type ProjectRole } from './project-permissions';

/**
 * One-liner used by API routes: given a non-staff user and a project they have
 * tenant-level access to, returns whether their role allows editing. Returns
 * false when the user has no project_members row.
 *
 * Wrapped in React.cache so repeated calls within the same RSC request reuse
 * the result instead of re-running the membership query.
 */
export const canUserEditProject = cache(async (userId: number, projectId: number): Promise<boolean> => {
  const [m] = await db.select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return roleAtLeast((m?.role as ProjectRole) ?? null, 'editor');
});

/**
 * Returns the highest role a user has on a project. Staff resolve to 'owner'
 * regardless of project_members rows. Returns null if the user has no access.
 *
 * Pass `staff=true` when the caller has already resolved staff status to avoid
 * a redundant role lookup.
 *
 * Wrapped in React.cache so the project detail RSC and any nested server
 * components that resolve role share a single membership query per request.
 * Note: the `opts` arg breaks raw memoization by reference identity for the
 * options object — callers that pass `{ staff: true }` short-circuit before
 * the DB hit anyway, so cache misses on options-object identity are harmless.
 */
export const getProjectRole = cache(async (
  userId: number,
  projectId: number,
  opts?: { staff?: boolean },
): Promise<ProjectRole | null> => {
  if (opts?.staff) return 'owner';
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  if (!row) return null;
  return (row.role as ProjectRole) ?? null;
});

/**
 * Resolves the active session user's role on a project, taking staff status
 * and tenant ownership into account. The shape `{ project, role }` is returned
 * so callers can avoid a second query for the project row.
 */
export async function resolveProjectAccess(projectId: number): Promise<
  | { project: typeof projects.$inferSelect; role: ProjectRole; staff: boolean }
  | null
> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;

  const staff = await isPortalStaff();
  if (staff) return { project, role: 'owner', staff: true };

  // Non-staff users must own a row in client_members or clients.userId for the
  // project's client. Without that, no project_members row should ever match.
  const client = await getPortalClient(userId);
  if (!client || client.id !== project.clientId) return null;

  const role = await getProjectRole(userId, projectId);
  if (!role) return null;
  return { project, role, staff: false };
}
