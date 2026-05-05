/**
 * Server-side expansion of `data-loop="posts"` regions in html-render blocks.
 *
 * Authors mark a repeating element with `data-loop="posts"` and write
 * placeholders like `{{post.title}}` / `{{post.url}}` / `{{post.coverImage}}`
 * inside it. The block carries a `loop` config (source/postType/limit/orderBy/
 * exclude). At render time we:
 *
 *   1. Fetch matching posts from the same site
 *   2. Find each `data-loop="posts"` element in the template
 *   3. Replace it with N copies of itself, one per item, with `{{post.X}}`
 *      substituted
 *
 * Output is plain HTML — by the time it reaches the client renderer there is
 * no loop logic left to evaluate. Static fields/placeholders outside the loop
 * are untouched and continue to flow through `renderHtmlTemplate`.
 */

import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { and, asc, desc, eq, inArray, ne, notInArray } from 'drizzle-orm';
import type { Block, HtmlRenderBlock, HtmlRenderLoop } from '@/types/blocks';

interface LoopItem {
  id: number;
  title: string;
  slug: string;
  url: string;
  excerpt: string;
  coverImage: string;
  publishedAt: string;
  postType: string;
  /** Per-field values from the post's first html-render block (if it exists),
   *  exposed as `{{post.values.X}}` so the loop can pull custom card text. */
  values: Record<string, string>;
}

/**
 * Resolve a post's URL by post type. Mirrors the routing in
 * app/sites/[domain]/[[...slug]]/page.tsx.
 */
function postUrl(postType: string, slug: string): string {
  if (postType === 'blog') return `/blog/${slug}`;
  return `/${slug}`;
}

/**
 * Pull the per-field values from a post's html-render blocks. Walks all
 * blocks and merges their `values` maps (later blocks win on key collision).
 * Lets `{{post.values.X}}` reach into the target post's authored content.
 */
function collectPostValues(content: string): Record<string, string> {
  if (!content) return {};
  let blocks: Block[] = [];
  try { blocks = JSON.parse(content).blocks || []; } catch { return {}; }
  const merged: Record<string, string> = {};
  for (const b of blocks) {
    if (b.type === 'html-render') {
      const v = (b as HtmlRenderBlock).values;
      if (v) Object.assign(merged, v);
    }
  }
  return merged;
}

/**
 * Fetch the items for one loop config + map them to the placeholder shape.
 */
async function fetchLoopItems(siteId: number, loop: HtmlRenderLoop): Promise<LoopItem[]> {
  const limit = Math.max(1, Math.min(loop.limit ?? 3, 24));
  const conditions = [
    eq(posts.websiteId, siteId),
    eq(posts.postType, loop.postType),
    eq(posts.published, true),
  ];
  if (loop.exclude && loop.exclude.length > 0) {
    conditions.push(notInArray(posts.id, loop.exclude));
  }
  const orderCol = loop.orderBy === 'title' ? asc(posts.title)
    : loop.orderBy === 'oldest' ? asc(posts.publishedAt)
    : desc(posts.publishedAt);

  const rows = await db.select({
    id: posts.id,
    title: posts.title,
    slug: posts.slug,
    excerpt: posts.excerpt,
    coverImage: posts.coverImage,
    publishedAt: posts.publishedAt,
    postType: posts.postType,
    content: posts.content,
  }).from(posts).where(and(...conditions)).orderBy(orderCol).limit(limit);

  return rows.map(r => ({
    id: r.id,
    title: r.title || '',
    slug: r.slug || '',
    url: postUrl(r.postType, r.slug),
    excerpt: r.excerpt || '',
    coverImage: r.coverImage || '',
    publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : '',
    postType: r.postType,
    values: collectPostValues(r.content || ''),
  }));
}

/** HTML-escape values destined for attributes/text outside richtext fields. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Substitute `{{post.X}}` (and `{{post.values.X}}`) with the given item's
 * values. Used inside a single loop iteration.
 *
 * Escaping rule: built-in scalar properties (title, slug, url, etc.) are
 * HTML-attribute-escaped because they may land inside `href="…"` or `alt="…"`.
 * `post.values.X` values come from authored richtext fields — they are HTML
 * by design, so we pass them through verbatim. `post.excerpt` is text, but
 * may contain HTML from migrated content; escape to be safe.
 */
function substituteLoopItem(html: string, item: LoopItem): string {
  return html.replace(/\{\{\s*post\.([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g, (_full, path: string) => {
    // post.values.X — raw HTML from a richtext field, pass through
    if (path.startsWith('values.')) {
      const key = path.slice('values.'.length);
      return item.values[key] ?? '';
    }
    // post.X — single-level lookup, escape (these can land in attributes)
    const v = (item as unknown as Record<string, unknown>)[path];
    return v == null ? '' : esc(String(v));
  });
}

/**
 * Find each `<X data-loop="posts">…</X>` element and return its outer-HTML
 * span (start/end indices). Walks with a stack so nested elements within the
 * loop body don't confuse the bounds.
 */
function findLoopRegions(html: string): Array<{ start: number; end: number; tag: string; openLen: number }> {
  const tagRx = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'param', 'track']);
  const regions: Array<{ start: number; end: number; tag: string; openLen: number }> = [];
  let m: RegExpExecArray | null;
  // We track depth from the start of a loop element until its matching close.
  let activeStart = -1;
  let activeTag = '';
  let activeOpenLen = 0;
  let depth = 0;
  while ((m = tagRx.exec(html)) !== null) {
    const isClose = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3];
    const selfClose = m[4] === '/';
    if (selfClose || VOID.has(tag)) continue;
    if (!isClose) {
      if (activeStart === -1) {
        if (/\bdata-loop="posts"/.test(attrs)) {
          activeStart = m.index;
          activeTag = tag;
          activeOpenLen = m[0].length;
          depth = 1;
        }
      } else {
        if (tag === activeTag) depth++;
      }
    } else if (activeStart !== -1) {
      if (tag === activeTag) {
        depth--;
        if (depth === 0) {
          regions.push({ start: activeStart, end: m.index + m[0].length, tag: activeTag, openLen: activeOpenLen });
          activeStart = -1;
          activeTag = '';
          activeOpenLen = 0;
        }
      }
    }
  }
  return regions;
}

/**
 * Replace every `data-loop="posts"` region in the block's html with N copies
 * (one per fetched item). The container element is preserved; only its inner
 * HTML repeats. The data-loop attribute itself is dropped from the output so
 * the iframe edit layer doesn't try to make the wrapper editable.
 */
export async function expandHtmlRenderLoops(siteId: number, block: HtmlRenderBlock, currentPostId?: number): Promise<HtmlRenderBlock> {
  if (!block.loop || block.loop.source !== 'posts') return block;
  const html = block.html || '';
  const regions = findLoopRegions(html);
  if (regions.length === 0) return block;

  // Auto-exclude the current post unless the author explicitly excluded it
  const exclude = new Set(block.loop.exclude || []);
  if (currentPostId) exclude.add(currentPostId);
  const items = await fetchLoopItems(siteId, { ...block.loop, exclude: Array.from(exclude) });

  // Process regions back-to-front so earlier indices stay valid as we splice.
  // Each `data-loop` element is REPLACED by N copies of itself (the whole
  // element including its tag), one per item, with the data-loop attribute
  // stripped from each copy. Each copy gets `data-loop-item="N"` added so
  // the iframe edit layer can detect it's a dynamic loop iteration (and
  // skip making text/images editable — those values come from fetched
  // posts, not the block's stored values).
  let out = html;
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    const fullElement = out.slice(r.start, r.end);
    // Drop the data-loop attribute on every iteration's copy so the iframe
    // edit layer doesn't try to make the wrappers editable as static fields.
    const cleanElement = fullElement.replace(/\s+data-loop="posts"/, '');

    if (items.length === 0) {
      // Empty state — drop the element entirely. Authors can render a fallback
      // by placing static markup outside the loop.
      out = out.slice(0, r.start) + out.slice(r.end);
      continue;
    }

    const repeated = items.map((it, idx) => {
      // Annotate each copy's outer tag with data-loop-item="N" — see comment
      // above about the iframe edit layer skipping these.
      const tagged = cleanElement.replace(/^<([a-zA-Z][a-zA-Z0-9-]*)/, (_m, t) => `<${t} data-loop-item="${idx}"`);
      return substituteLoopItem(tagged, it);
    }).join('');
    out = out.slice(0, r.start) + repeated + out.slice(r.end);
  }

  return { ...block, html: out };
}

/**
 * Walk a block tree and expand loops + resolve `post` field references inside
 * every html-render block. Mutates a shallow-copied tree; the caller can
 * safely pass the result through the normal renderer.
 */
export async function expandLoopsInBlocks(siteId: number, blocks: Block[], currentPostId?: number): Promise<Block[]> {
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.type === 'html-render') {
      // Resolve post-field references first (turns ids → records), then loop expansion.
      let resolved = await resolvePostFields(siteId, b as HtmlRenderBlock);
      if ((resolved as HtmlRenderBlock).loop) {
        resolved = await expandHtmlRenderLoops(siteId, resolved, currentPostId);
      }
      out.push(resolved);
      continue;
    }
    // Recurse into containers
    if (b.type === 'columns' && Array.isArray((b as { columns?: Array<{ blocks?: Block[] }> }).columns)) {
      const cols = (b as unknown as { columns: Array<{ blocks: Block[] }> }).columns;
      const newCols = await Promise.all(cols.map(async c => ({ ...c, blocks: await expandLoopsInBlocks(siteId, c.blocks || [], currentPostId) })));
      out.push({ ...b, columns: newCols } as Block);
      continue;
    }
    if (b.type === 'tabs' && Array.isArray((b as { tabs?: Array<{ blocks?: Block[] }> }).tabs)) {
      const tabs = (b as unknown as { tabs: Array<{ blocks: Block[] }> }).tabs;
      const newTabs = await Promise.all(tabs.map(async t => ({ ...t, blocks: await expandLoopsInBlocks(siteId, t.blocks || [], currentPostId) })));
      out.push({ ...b, tabs: newTabs } as Block);
      continue;
    }
    if (b.type === 'section' && Array.isArray((b as { blocks?: Block[] }).blocks)) {
      const inner = (b as unknown as { blocks: Block[] }).blocks;
      out.push({ ...b, blocks: await expandLoopsInBlocks(siteId, inner, currentPostId) } as Block);
      continue;
    }
    out.push(b);
  }
  return out;
}

/**
 * For each `post`-typed field in this block, look up the saved post id and
 * rewrite `values[name]` from `"123"` into `{ id, title, slug, url, … }` so
 * `{{name.title}}`/`{{name.url}}` resolve through the top-level dotted
 * placeholder substitution. Posts that don't exist (or have empty value)
 * resolve to an empty object.
 */
async function resolvePostFields(siteId: number, block: HtmlRenderBlock): Promise<HtmlRenderBlock> {
  const fields = block.fields || [];
  const postFieldNames = fields.filter(f => f.type === 'post').map(f => f.name);
  if (postFieldNames.length === 0) return block;

  const oldValues = (block.values || {}) as Record<string, unknown>;
  const ids = postFieldNames
    .map(name => {
      const v = oldValues[name];
      return typeof v === 'string' && v ? parseInt(v, 10) : null;
    })
    .filter((n): n is number => Number.isFinite(n));
  if (ids.length === 0) return block;

  const rows = await db.select({
    id: posts.id, title: posts.title, slug: posts.slug, postType: posts.postType,
    excerpt: posts.excerpt, coverImage: posts.coverImage, publishedAt: posts.publishedAt,
  }).from(posts).where(and(eq(posts.websiteId, siteId), inArray(posts.id, Array.from(new Set(ids)))));
  const byId = new Map(rows.map(r => [r.id, r]));

  const newValues: Record<string, unknown> = { ...oldValues };
  for (const name of postFieldNames) {
    const idStr = oldValues[name];
    if (typeof idStr !== 'string' || !idStr) {
      newValues[name] = {};
      continue;
    }
    const id = parseInt(idStr, 10);
    const row = byId.get(id);
    if (!row) {
      newValues[name] = {};
      continue;
    }
    newValues[name] = {
      id: String(row.id),
      title: row.title || '',
      slug: row.slug || '',
      url: postUrl(row.postType, row.slug),
      excerpt: row.excerpt || '',
      coverImage: row.coverImage || '',
      publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : '',
      postType: row.postType,
    };
  }
  return { ...block, values: newValues as HtmlRenderBlock['values'] };
}

/**
 * Convenience wrapper that takes a serialized BlockEditorData JSON, expands
 * loops, and returns a serialized JSON. Lets the page route plug this into
 * the existing pipeline alongside `wrapWithTypeTemplate` / `prefetchHtmlEmbeds`.
 */
export async function expandLoopsInContent(siteId: number, contentJson: string, currentPostId?: number): Promise<string> {
  let parsed: { blocks?: Block[]; version?: string };
  try { parsed = JSON.parse(contentJson); } catch { return contentJson; }
  if (!parsed?.blocks?.length) return contentJson;
  const expanded = await expandLoopsInBlocks(siteId, parsed.blocks, currentPostId);
  return JSON.stringify({ blocks: expanded, version: parsed.version || '1.0' });
}
