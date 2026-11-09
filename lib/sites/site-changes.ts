/**
 * PUX-183 (design doc screen 42): which pending changes belong to THIS site.
 * mcp_pending_changes has no website column — entityId is polymorphic — so a
 * change is this site's when it targets the site row itself or one of the
 * site's posts. Pure; the caller passes the tenant's pending rows.
 */

export interface PendingLike { entityType: string; entityId: number | null }

export function changesForSite<T extends PendingLike>(rows: T[], siteId: number, postIds: number[]): T[] {
  const posts = new Set(postIds);
  return rows.filter((r) =>
    (r.entityType === 'site' && r.entityId === siteId) ||
    ((r.entityType === 'post' || r.entityType === 'post_taxonomy') && r.entityId != null && posts.has(r.entityId)),
  );
}
