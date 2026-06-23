import type { Block, BlockEditorData } from '@/types/blocks';

/**
 * Generate a URL-safe slug from a free-text title. Used in create mode to
 * auto-fill the slug as the user types — and on the post-type-fork API to
 * derive a stable identifier for the new content type.
 */
export function generateSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Snake_case slug for custom-field names. Custom fields use underscore-style
 * slugs because they double as object keys when posts are serialized to
 * structured-data feeds.
 */
export function generateCustomFieldSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Sanitize a slug as the user types it directly. Lowercases, strips
 * everything that isn't `[a-z0-9-]`, and collapses runs of dashes.
 */
export function sanitizeSlugInput(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
}

/**
 * Parse a JSON-encoded post body into the block array. Falls back to an
 * empty array on any parse error so the editor still mounts.
 */
export function parseContentToBlocks(content: string): Block[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as BlockEditorData;
    return parsed.blocks || [];
  } catch {
    return [];
  }
}

/**
 * Stringify the current block tree for save. Centralized so the wire format
 * (`{ blocks, version }`) is owned by one module.
 */
export function serializeBlocksForSave(blocks: Block[]): string {
  const data: BlockEditorData = { blocks, version: '1.0' };
  return JSON.stringify(data);
}

/**
 * Compute a stable fingerprint of every html-render block's `loop` config.
 * Used by the orchestrator to detect when an html-render loop changes —
 * autosave's postMessage path can't propagate loop expansion (server-only),
 * so a loop edit must trigger a manual save + iframe reload.
 */
export function fingerprintLoops(blocks: Block[]): string {
  const out: string[] = [];
  const visit = (list: Block[]) => {
    for (const b of list) {
      if (b.type === 'html-render') {
        const loop = (b as { loop?: unknown }).loop;
        if (loop) out.push(`${b.id}:${JSON.stringify(loop)}`);
      }
      if (b.type === 'columns') {
        (b as { columns: { blocks: Block[] }[] }).columns.forEach((c) => visit(c.blocks || []));
      }
      if (b.type === 'tabs') {
        (b as { tabs: { blocks: Block[] }[] }).tabs.forEach((t) => visit(t.blocks || []));
      }
      if (b.type === 'section') {
        visit((b as { blocks: Block[] }).blocks || []);
      }
    }
  };
  visit(blocks);
  return out.join('|');
}
