/**
 * Pure serializer for the `posts.content` column. Lives in its own leaf module
 * so callers that only need this cannot drag in the rest of lib/mcp/types,
 * which imports portal-auth -> auth -> db and therefore requires DATABASE_URL
 * at import time. lib/mcp/post-update-patch.ts depends on this and is unit
 * tested without a database.
 *
 * Re-exported from lib/mcp/types for existing importers.
 */
/**
 * Posts in this app store BlockEditorData JSON in the `content` column:
 *   { blocks: Block[], version: '1.0' }
 * The visual editor parses `content` as JSON; raw HTML/markdown renders as
 * "No blocks yet". This helper accepts either a structured `blocks` array or a
 * plain string (wrapped into a single text block) and serializes correctly.
 */
export function serializePostContent(args: { blocks?: unknown; content?: string }): string {
  if (Array.isArray(args.blocks) && args.blocks.length > 0) {
    return JSON.stringify({ blocks: args.blocks, version: '1.0' });
  }
  const raw = args.content ?? '';
  if (!raw.trim()) return JSON.stringify({ blocks: [], version: '1.0' });
  return JSON.stringify({
    blocks: [{ id: `block-${Date.now()}`, type: 'text', order: 0, content: raw }],
    version: '1.0',
  });
}
