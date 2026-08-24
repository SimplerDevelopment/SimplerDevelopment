/**
 * The single source of truth for "what a posts_update actually changes".
 *
 * There are two paths into a post update and they must apply identical fields:
 *   - direct        — the apply-closure in lib/mcp/tools/cms.ts
 *   - approval mode — the `post:update` branch of applyPendingChange in
 *                     lib/mcp/approvals.ts
 *
 * They were hand-rolled separately and drifted. The approval path applied four
 * fields where the direct path applied twelve, so seoTitle / seoDescription /
 * ogImage / canonicalUrl / noIndex / customCss / customJs were silently
 * discarded whenever approval mode was on. Nothing surfaced it: the tool
 * returned pending, the reviewer approved, the row updated, and only the
 * rendered <title> disagreed with what the author submitted (PUX-096).
 *
 * A comment asking the two to stay in sync already existed and did not work.
 * Sharing the implementation is what actually makes them agree — adding a
 * field here reaches both callers, and there is no second place to forget.
 */
import { serializePostContent } from './serialize-post-content';

/**
 * Fields copied straight through when present. Adding a passthrough column to
 * posts means adding its name here and to the tool's inputSchema — nothing else.
 */
const PASSTHROUGH = [
  'customCss',
  'customJs',
  'seoTitle',
  'seoDescription',
  'ogImage',
  'canonicalUrl',
  'noIndex',
] as const;

/**
 * Build the Drizzle `set()` patch for a post update.
 *
 * `undefined` means "not supplied, leave alone"; `null` means "clear it", which
 * is why every check is `!== undefined` rather than a truthiness test — a
 * truthy check would make it impossible to clear an ogImage or unpublish.
 */
export function buildPostUpdatePatch(src: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (src.title !== undefined) patch.title = src.title;
  if (src.blocks !== undefined || src.content !== undefined) {
    patch.content = serializePostContent({
      blocks: src.blocks,
      content: src.content as string | undefined,
    });
  }
  if (src.excerpt !== undefined) patch.excerpt = src.excerpt;
  if (src.published !== undefined) {
    patch.published = src.published;
    // Only stamp publishedAt on the transition to published; unpublishing
    // leaves the original date so re-publishing does not look like new content.
    if (src.published) patch.publishedAt = new Date();
  }
  for (const field of PASSTHROUGH) {
    if (src[field] !== undefined) patch[field] = src[field];
  }

  return patch;
}
