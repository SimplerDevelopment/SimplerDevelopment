/**
 * Turning a post's stored content into blocks you can render.
 *
 * THE GOTCHA THIS EXISTS FOR: the SDK types `Post.content` as `string`, but a
 * SimplerDevelopment post does not store HTML there — it stores the block
 * document as JSON, shaped `{ blocks: Block[], version: '1.0' }`. So `content`
 * has to be parsed before it means anything, and anything that renders it
 * directly will print raw JSON onto the page.
 *
 * Everything here is deliberately forgiving. A CMS is edited by people, content
 * predates schema changes, and a malformed block document should cost you one
 * section — never the whole page.
 */

/** A block as it arrives from the CMS. Only `type` is guaranteed. */
export interface StarterBlock {
  type: string;
  id?: string;
  order?: number;
  [key: string]: unknown;
}

function isBlock(value: unknown): value is StarterBlock {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/**
 * Parse a post's `content` into an ordered block list.
 *
 * Returns `[]` rather than throwing for every malformed case — empty content,
 * invalid JSON, an unexpected shape. A page that renders nothing is a bug you
 * can see and fix; a page that 500s in production is an outage.
 *
 * Accepts both the documented `{ blocks: [...] }` envelope and a bare array,
 * because hand-authored and older content is sometimes stored as the latter.
 */
export function parseBlocks(content: string | null | undefined): StarterBlock[] {
  if (!content || typeof content !== 'string' || content.trim() === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Not JSON at all — most likely legacy HTML from before the block editor.
    // Callers that want to support that can fall back to `content` themselves.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[starter] post content is not valid JSON; rendering no blocks.');
    }
    return [];
  }

  const raw = Array.isArray(parsed)
    ? parsed
    : (parsed as { blocks?: unknown })?.blocks;

  if (!Array.isArray(raw)) return [];

  const blocks = raw.filter(isBlock);

  // `order` is authoritative when present — the array is not guaranteed sorted.
  // Blocks without one keep their array position, which `sort` preserves.
  return blocks.every(b => typeof b.order === 'number')
    ? [...blocks].sort((a, b) => (a.order as number) - (b.order as number))
    : blocks;
}

/**
 * True when the content looks like legacy HTML rather than a block document —
 * useful if you want to render older posts with `dangerouslySetInnerHTML`
 * instead of dropping them. Sanitise before you do.
 */
export function isLegacyHtml(content: string | null | undefined): boolean {
  if (!content || content.trim() === '') return false;
  try {
    JSON.parse(content);
    return false;
  } catch {
    return true;
  }
}
