// Server-only helper that promotes the per-site DRAFT custom CSS/JS into the
// live columns and clears the draft state. Factored out so both the portal
// REST endpoint (`/api/portal/cms/websites/[siteId]/code/publish`) AND the
// MCP `applyPendingChange` `site:publish` case (lib/mcp/approvals.ts) can
// share the same exact write. Tenancy guard is the caller's responsibility —
// this helper trusts that the caller already verified `clientId` ownership.

import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface PublishCustomCodeResult {
  customCss: string;
  customJs: string;
}

/**
 * Copies `draft_custom_css` → `custom_css` and `draft_custom_js` → `custom_js`
 * on the given site, then clears `draft_custom_css`, `draft_custom_js`,
 * `draft_updated_at`, `draft_updated_by`. Returns the new live values.
 *
 * Throws when the site does not exist. Caller MUST scope the lookup to the
 * acting client first (see usage in app/api/portal/...).
 */
export async function publishSiteCustomCode(siteId: number): Promise<PublishCustomCodeResult> {
  const [existing] = await db
    .select({
      id: clientWebsites.id,
      draftCustomCss: clientWebsites.draftCustomCss,
      draftCustomJs: clientWebsites.draftCustomJs,
    })
    .from(clientWebsites)
    .where(eq(clientWebsites.id, siteId))
    .limit(1);
  if (!existing) throw new Error('Site not found');

  const [row] = await db
    .update(clientWebsites)
    .set({
      customCss: existing.draftCustomCss,
      customJs: existing.draftCustomJs,
      draftCustomCss: null,
      draftCustomJs: null,
      draftUpdatedAt: null,
      draftUpdatedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(clientWebsites.id, siteId))
    .returning();

  return {
    customCss: row.customCss || '',
    customJs: row.customJs || '',
  };
}

/**
 * Clears the draft custom CSS/JS without touching live. Used by the portal
 * "Discard draft" affordance. Caller must scope to the acting client first.
 */
export async function discardSiteCustomCodeDraft(siteId: number): Promise<void> {
  await db
    .update(clientWebsites)
    .set({
      draftCustomCss: null,
      draftCustomJs: null,
      draftUpdatedAt: null,
      draftUpdatedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(clientWebsites.id, siteId));
}
