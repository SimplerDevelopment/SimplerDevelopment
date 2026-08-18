// Keeps `block_template_usages` in sync with a post's saved block content.
//
// Template insertion (components/blocks/TemplateLibrary.tsx `handleInsert`)
// stamps every TOP-LEVEL inserted block with `templateId: template.id` (see
// `BaseBlock.templateId` in types/blocks/base.ts — nested children are left
// unstamped). This helper is the other half of the loop: called from a post
// save path AFTER a successful `posts.content` write, it walks the saved
// tree for any block still carrying a `templateId` (top-level OR nested —
// the editor doesn't strip the field when a stamped block is later dragged
// into a column/tab/section/sticky-scroll-tabs panel) and makes the usages
// table match exactly what's on the page:
//
//   - a stamped block with no existing row at its path  -> insert a usage row
//   - a stamped block whose templateId changed at a path -> update that row
//   - a usage row whose blockPath no longer appears       -> delete it
//     (covers both "block deleted" and "block moved" — a move re-inserts
//     under the new path in the same pass)
//
// The deletion guards this table exists to serve
// (lib/sites/publish-block-template.ts `publishBlockTemplate`'s
// `pendingDelete` branch, and `DELETE /api/block-templates/[id]`) both do a
// plain `SELECT ... WHERE template_id = ?` — as long as saves call this
// helper, those guards see real counts instead of the permanent zero they
// saw before this file existed.
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { blockTemplateUsages, blockTemplates } from '@/lib/db/schema';

interface FoundUsage {
  templateId: number;
  blockPath: string;
}

/**
 * @param postId The post whose content was just saved.
 * @param content Either the raw `posts.content` string
 *   (`JSON.stringify({ blocks, version })`, as written by
 *   `serializeBlocksForSave`), an already-parsed `{ blocks }` object, or a
 *   bare `Block[]` array (accepted directly so callers/tests that already
 *   hold the parsed tree don't have to round-trip through JSON).
 */
export async function syncTemplateUsages(postId: number, content: unknown): Promise<void> {
  const blocks = extractBlocksArray(content);
  const found: FoundUsage[] = [];
  walkBlocks(blocks, '', found);

  // Batch-fetch current versions for every distinct template referenced.
  // Doubles as existence check: a templateId with no matching row means the
  // source template was hard-deleted while a stale copy of it is still
  // embedded in this post's content — `blockTemplateUsages.templateId` has
  // an FK to `blockTemplates.id`, so inserting it would fail anyway, and the
  // usage-count guard this table serves has nothing to gain from tracking a
  // template that can no longer be deleted. Drop it.
  const templateIds = [...new Set(found.map((f) => f.templateId))];
  const templateRows = templateIds.length
    ? await db
        .select({ id: blockTemplates.id, version: blockTemplates.version })
        .from(blockTemplates)
        .where(inArray(blockTemplates.id, templateIds))
    : [];
  const versionById = new Map(templateRows.map((t) => [t.id, t.version]));
  const valid = found.filter((f) => versionById.has(f.templateId));

  const existingRows = await db
    .select({
      id: blockTemplateUsages.id,
      blockPath: blockTemplateUsages.blockPath,
      templateId: blockTemplateUsages.templateId,
    })
    .from(blockTemplateUsages)
    .where(eq(blockTemplateUsages.postId, postId));

  const existingByPath = new Map(existingRows.map((r) => [r.blockPath, r]));
  const foundPaths = new Set(valid.map((f) => f.blockPath));

  const staleIds = existingRows.filter((r) => !foundPaths.has(r.blockPath)).map((r) => r.id);
  if (staleIds.length) {
    await db.delete(blockTemplateUsages).where(inArray(blockTemplateUsages.id, staleIds));
  }

  for (const f of valid) {
    const existing = existingByPath.get(f.blockPath);
    if (existing) {
      // Same path, same template — leave `syncedVersion` untouched. It's an
      // insertion-time snapshot of the template's version, deliberately not
      // re-stamped on every save: comparing it against the live
      // `blockTemplates.version` is how a future reader detects drift
      // ("this embedded copy predates the template's current version").
      // Re-stamping here on every save would erase that signal. Only bump
      // it when the block at this path now points at a *different*
      // template (effectively a fresh usage that happens to reuse the row).
      if (existing.templateId !== f.templateId) {
        await db
          .update(blockTemplateUsages)
          .set({ templateId: f.templateId, syncedVersion: versionById.get(f.templateId) ?? 1 })
          .where(eq(blockTemplateUsages.id, existing.id));
      }
      continue;
    }
    await db.insert(blockTemplateUsages).values({
      templateId: f.templateId,
      postId,
      blockPath: f.blockPath,
      syncedVersion: versionById.get(f.templateId) ?? 1,
    });
  }
}

/** Normalizes the three accepted `content` shapes down to a bare block array. */
function extractBlocksArray(content: unknown): unknown[] {
  let parsed: unknown = content;
  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(content);
    } catch {
      return [];
    }
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).blocks)) {
    return (parsed as Record<string, unknown>).blocks as unknown[];
  }
  return [];
}

/**
 * Recursively walks a block tree collecting `{ templateId, blockPath }` for
 * every block that carries a `templateId`. `blockPath` is a dot-joined chain
 * of the numeric index at each level of nesting (e.g. a top-level block is
 * `'2'`; a block inside the second column of that block is `'2.1.0'`) — a
 * stable-enough key to detect "same slot, still stamped" vs. "moved" across
 * saves. Only recurses through the container shapes the block system
 * actually has: `columns[].blocks` (ColumnsBlock), `tabs[].blocks`
 * (TabsBlock), `panels[].blocks` (StickyScrollTabsBlock), and `blocks`
 * (SectionBlock).
 */
function walkBlocks(blocks: unknown, pathPrefix: string, out: FoundUsage[]): void {
  if (!Array.isArray(blocks)) return;
  blocks.forEach((block, index) => {
    if (!block || typeof block !== 'object') return;
    const path = pathPrefix ? `${pathPrefix}.${index}` : `${index}`;
    const b = block as Record<string, unknown>;

    if (typeof b.templateId === 'number') {
      out.push({ templateId: b.templateId, blockPath: path });
    }

    if (Array.isArray(b.columns)) {
      (b.columns as unknown[]).forEach((col, colIndex) => {
        const colBlocks = col && typeof col === 'object' ? (col as Record<string, unknown>).blocks : undefined;
        if (Array.isArray(colBlocks)) walkBlocks(colBlocks, `${path}.${colIndex}`, out);
      });
    } else if (Array.isArray(b.tabs)) {
      (b.tabs as unknown[]).forEach((tab, tabIndex) => {
        const tabBlocks = tab && typeof tab === 'object' ? (tab as Record<string, unknown>).blocks : undefined;
        if (Array.isArray(tabBlocks)) walkBlocks(tabBlocks, `${path}.${tabIndex}`, out);
      });
    } else if (Array.isArray(b.panels)) {
      (b.panels as unknown[]).forEach((panel, panelIndex) => {
        const panelBlocks = panel && typeof panel === 'object' ? (panel as Record<string, unknown>).blocks : undefined;
        if (Array.isArray(panelBlocks)) walkBlocks(panelBlocks, `${path}.${panelIndex}`, out);
      });
    } else if (Array.isArray(b.blocks)) {
      // SectionBlock — a single unnamed lane, no extra index level.
      walkBlocks(b.blocks, path, out);
    }
  });
}
