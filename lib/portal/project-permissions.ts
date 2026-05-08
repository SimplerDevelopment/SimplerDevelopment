// Pure role helpers. Importable from unit tests without a DB connection.
// DB-touching resolvers live in lib/portal/project-access.ts.

export type ProjectRole = 'owner' | 'editor' | 'commenter' | 'viewer';

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 0,
  commenter: 1,
  editor: 2,
  owner: 3,
};

export const ROLE_OPTIONS: ProjectRole[] = ['viewer', 'commenter', 'editor', 'owner'];

/** Lower-bound role check. roleAtLeast(role, 'editor') is true for editor + owner. */
export function roleAtLeast(role: ProjectRole | null, min: ProjectRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export const canViewProject = (role: ProjectRole | null) => roleAtLeast(role, 'viewer');
export const canCommentOnProject = (role: ProjectRole | null) => roleAtLeast(role, 'commenter');
export const canEditProject = (role: ProjectRole | null) => roleAtLeast(role, 'editor');
export const canManageProject = (role: ProjectRole | null) => roleAtLeast(role, 'owner');
