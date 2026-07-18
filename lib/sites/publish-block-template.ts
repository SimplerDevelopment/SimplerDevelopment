// Server-only helper that promotes `block_templates.draft` → live columns.
// Factored out so the admin REST endpoint
// (`/api/block-templates/[id]/publish`) AND the MCP `applyPendingChange`
// `block_template:publish` case (lib/mcp/approvals.ts) can share the same
// exact write. The approvals case currently inlines this logic; it MAY switch
// to this helper in a follow-up.

import { db } from '@/lib/db';
import {
  blockTemplates,
  blockTemplateUsages,
  type BlockTemplateDraft,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type PublishBlockTemplateResult =
  | { id: number; deleted: true }
  | { id: number; noop: true }
  | { id: number; published: true; row: typeof blockTemplates.$inferSelect };

/**
 * Promote a single block template's draft → live. Semantics:
 * - `draft.pendingDelete` → re-checks usage count (refuses if any global
 *   usages still exist) then deletes the row.
 * - Otherwise → draft fields are merged onto live columns. When `draft.blocks`
 *   is set, `version` is bumped (downstream usages key off this to detect
 *   drift). Draft is cleared.
 *
 * Throws if the template does not exist, or if a pendingDelete is refused
 * because of remaining global usages.
 */
export async function publishBlockTemplate(id: number): Promise<PublishBlockTemplateResult> {
  const [existing] = await db
    .select()
    .from(blockTemplates)
    .where(eq(blockTemplates.id, id))
    .limit(1);
  if (!existing) throw new Error('Template not found');

  const draft: BlockTemplateDraft | null = existing.draft;
  if (!draft) return { id, noop: true };

  if (draft.pendingDelete) {
    // Re-check usage at apply time — a usage could have been created between
    // stage and publish.
    const usages = await db
      .select({ id: blockTemplateUsages.id })
      .from(blockTemplateUsages)
      .where(eq(blockTemplateUsages.templateId, id));
    if (usages.length > 0) {
      throw new Error(
        `Cannot delete: template is used in ${usages.length} post(s). Remove usages first or convert to non-global.`,
      );
    }
    await db.delete(blockTemplates).where(eq(blockTemplates.id, id));
    return { id, deleted: true };
  }

  const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
  if (draft.name !== undefined) patch.name = draft.name;
  if (draft.description !== undefined) patch.description = draft.description;
  if (draft.category !== undefined) patch.category = draft.category;
  if (draft.scope !== undefined) patch.scope = draft.scope;
  if (draft.thumbnail !== undefined) patch.thumbnail = draft.thumbnail;
  if (draft.tags !== undefined) patch.tags = draft.tags;
  if (draft.lockedFields !== undefined) patch.lockedFields = draft.lockedFields;
  if (draft.blocks !== undefined) {
    patch.blocks = draft.blocks;
    // Bump version on block-tree changes — global usages key off this to
    // detect drift between the embedded copy and the source.
    patch.version = existing.version + 1;
  }

  const [row] = await db
    .update(blockTemplates)
    .set(patch)
    .where(eq(blockTemplates.id, id))
    .returning();
  return { id, published: true, row };
}
