/**
 * PUX-184 (design doc screen 43): a page's status as three words. Pure.
 * "Pending approval" = a pending mcp_pending_changes row targeting the post
 * (entityType 'post', the post's id); posts carry no editor id, so "last
 * edited" is the date alone, and there is no per-page analytics source.
 */

export type PageStatus = 'published' | 'draft' | 'pending';

export function pageStatus(published: boolean, pendingPostIds: ReadonlySet<number>, postId: number): PageStatus {
  if (pendingPostIds.has(postId)) return 'pending';
  return published ? 'published' : 'draft';
}

export const PAGE_STATUS_LABEL: Record<PageStatus, string> = { published: 'Published', draft: 'Draft', pending: 'Pending approval' };

export function typeCounts<T extends { postType: string }>(rows: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.postType] = (out[r.postType] ?? 0) + 1;
  return out;
}
