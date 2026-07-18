// Server-only helpers that promote `site_navigation.draft` overlays into the
// live columns. Factored out so the portal REST endpoints
// (`/api/portal/websites/[siteId]/navigation/[itemId]/publish` and
// `…/navigation/publish-all`) AND the MCP `applyPendingChange`
// `site_nav:publish` / `site_nav:publish_all` cases (lib/mcp/approvals.ts) can
// share the same exact write. The approvals cases currently inline this logic;
// they MAY switch to these helpers in a follow-up.
//
// Tenancy is the caller's responsibility — the caller MUST verify that the
// website belongs to the acting client before calling these.

import { db } from '@/lib/db';
import { siteNavigation, type SiteNavigationDraft } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

export type PublishNavItemResult =
  | { id: number; deleted: true }
  | { id: number; noop: true }
  | { id: number; published: true; row: typeof siteNavigation.$inferSelect };

/**
 * Promote a single nav item's draft → live. Semantics:
 * - `draft.pendingDelete` → row is deleted.
 * - `draft.pendingCreate` (no pendingDelete) → draft is cleared and any
 *   provided fields are applied onto the live columns.
 * - Otherwise → draft fields are merged onto live columns, draft is cleared.
 *
 * Returns a discriminated result describing what happened.
 * Throws if the nav item does not exist.
 */
export async function publishNavItem(id: number): Promise<PublishNavItemResult> {
  const [navRow] = await db
    .select()
    .from(siteNavigation)
    .where(eq(siteNavigation.id, id))
    .limit(1);
  if (!navRow) throw new Error('Nav item not found');

  const draft: SiteNavigationDraft | null = navRow.draft;
  if (!draft) return { id, noop: true };

  if (draft.pendingDelete) {
    await db.delete(siteNavigation).where(eq(siteNavigation.id, id));
    return { id, deleted: true };
  }

  const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
  if (draft.label !== undefined) patch.label = draft.label;
  if (draft.href !== undefined) patch.href = draft.href;
  if (draft.parentId !== undefined) patch.parentId = draft.parentId;
  if (draft.sortOrder !== undefined) patch.sortOrder = draft.sortOrder;
  if (draft.openInNewTab !== undefined) patch.openInNewTab = draft.openInNewTab;
  if (draft.isButton !== undefined) patch.isButton = draft.isButton;
  if (draft.description !== undefined) patch.description = draft.description;
  if (draft.icon !== undefined) patch.icon = draft.icon;
  if (draft.featuredImage !== undefined) patch.featuredImage = draft.featuredImage;
  if (draft.columnGroup !== undefined) patch.columnGroup = draft.columnGroup;

  const [row] = await db
    .update(siteNavigation)
    .set(patch)
    .where(eq(siteNavigation.id, id))
    .returning();
  return { id, published: true, row };
}

export interface PublishNavAllResult {
  websiteId: number;
  total: number;
  deleted: number;
  published: number;
}

/**
 * Promote every nav row on a website that has a non-null draft. Same per-row
 * semantics as `publishNavItem`. Returns aggregate counts.
 */
export async function publishAllNavDrafts(websiteId: number): Promise<PublishNavAllResult> {
  const drafts = await db
    .select()
    .from(siteNavigation)
    .where(
      and(
        eq(siteNavigation.websiteId, websiteId),
        sql`${siteNavigation.draft} IS NOT NULL`,
      ),
    );

  let deleted = 0;
  let published = 0;
  for (const navRow of drafts) {
    const draft: SiteNavigationDraft | null = navRow.draft;
    if (!draft) continue;
    if (draft.pendingDelete) {
      await db.delete(siteNavigation).where(eq(siteNavigation.id, navRow.id));
      deleted += 1;
      continue;
    }
    const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
    if (draft.label !== undefined) patch.label = draft.label;
    if (draft.href !== undefined) patch.href = draft.href;
    if (draft.parentId !== undefined) patch.parentId = draft.parentId;
    if (draft.sortOrder !== undefined) patch.sortOrder = draft.sortOrder;
    if (draft.openInNewTab !== undefined) patch.openInNewTab = draft.openInNewTab;
    if (draft.isButton !== undefined) patch.isButton = draft.isButton;
    if (draft.description !== undefined) patch.description = draft.description;
    if (draft.icon !== undefined) patch.icon = draft.icon;
    if (draft.featuredImage !== undefined) patch.featuredImage = draft.featuredImage;
    if (draft.columnGroup !== undefined) patch.columnGroup = draft.columnGroup;
    await db.update(siteNavigation).set(patch).where(eq(siteNavigation.id, navRow.id));
    published += 1;
  }

  return { websiteId, total: drafts.length, deleted, published };
}
