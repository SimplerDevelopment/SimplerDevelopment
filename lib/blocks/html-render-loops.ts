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
import { posts, postTypes, customFields, postCustomFieldValues } from '@/lib/db/schema';
import { and, asc, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import type { Block, HtmlRenderBlock, HtmlRenderLoop } from '@/types/blocks';

/**
 * Per-request pagination context threaded down from the page route. Lets a
 * `data-loop="posts"` block compute its offset from the URL's `?page=N` query
 * param and emit a `data-pagination` UI whose prev/next/numbered links survive
 * the rest of the page's query string. Stays optional — calls that don't pass
 * a context fall back to page 1 with no offset, preserving the old behavior.
 */
export interface LoopPaginationContext {
  /** Path the user is on (no query string). Used to build `?page=N` URLs that
   *  preserve the current path. */
  pathname: string;
  /** 1-indexed current page. Caller is responsible for clamping to ≥1. */
  page: number;
  /** Other query params on the current URL. Re-serialized into each generated
   *  pagination link so filters/search/etc. survive page navigation. */
  extraParams?: Record<string, string>;
}

interface LoopItem {
  id: number;
  title: string;
  slug: string;
  url: string;
  excerpt: string;
  coverImage: string;
  /** ISO-8601 string (e.g. `2026-05-19T00:00:00.000Z`). Useful when authors
   *  want to feed it into a client-side date parser via `data-iso` or similar. */
  publishedAt: string;
  /** Friendly long-form date (e.g. `May 19, 2026`) localized to en-US. Most
   *  list templates want this for `{{post.publishedDate}}` — the ISO string
   *  reads poorly in card copy. */
  publishedDate: string;
  postType: string;
  /** Per-field values from the post's first html-render block (if it exists),
   *  exposed as `{{post.values.X}}` so the loop can pull custom card text. */
  values: Record<string, string>;
  /** Typed CMS custom-field values (slug → value). Sourced from the
   *  `customFields` + `postCustomFieldValues` tables joined to the post's
   *  postType. Exposed as `{{post.fields.X}}` so loop templates can read
   *  the typed schema directly without re-authoring the values into
   *  per-post html-render blocks. Empty when the post type has no fields
   *  or the post has no values stored. */
  fields: Record<string, string>;
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
 * Build a `postId → { fieldSlug → value }` map for the given post type +
 * post ids. Joins `customFields` (the schema for this postType) with
 * `postCustomFieldValues` (the per-post values), producing a flat
 * lookup keyed by post id. Returns an empty map when the post type has
 * no schema or no values are stored.
 *
 * Two-step: first resolve the postType slug → id (custom fields are keyed
 * by id, but the loop config carries the slug), then run a single batch
 * query for all values across the requested post ids. Site-scoped lookup
 * mirrors how `/api/post-types?websiteId=X` resolves the type.
 */
async function fetchPostCustomFields(siteId: number, postTypeSlug: string, postIds: number[]): Promise<Map<number, Record<string, string>>> {
  const out = new Map<number, Record<string, string>>();
  if (postIds.length === 0) return out;
  // Look up the postType row for this site + slug. The site-scoped lookup
  // matches the create/list pattern used by /api/post-types and avoids
  // accidentally pulling another tenant's matching slug.
  const ptRows = await db.select({ id: postTypes.id })
    .from(postTypes)
    .where(and(eq(postTypes.websiteId, siteId), eq(postTypes.slug, postTypeSlug)))
    .limit(1);
  if (ptRows.length === 0) return out;
  const postTypeId = ptRows[0].id;

  // Pull the field schema for this post type (slug → id map).
  const fieldRows = await db.select({ id: customFields.id, slug: customFields.slug })
    .from(customFields)
    .where(eq(customFields.postTypeId, postTypeId));
  if (fieldRows.length === 0) return out;
  const slugByFieldId = new Map(fieldRows.map(f => [f.id, f.slug]));

  // Single batched lookup of all values for these posts × these fields.
  const valueRows = await db.select({
    postId: postCustomFieldValues.postId,
    customFieldId: postCustomFieldValues.customFieldId,
    value: postCustomFieldValues.value,
  })
    .from(postCustomFieldValues)
    .where(and(
      inArray(postCustomFieldValues.postId, postIds),
      inArray(postCustomFieldValues.customFieldId, fieldRows.map(f => f.id)),
    ));

  for (const row of valueRows) {
    const slug = slugByFieldId.get(row.customFieldId);
    if (!slug) continue;
    const bucket = out.get(row.postId) ?? {};
    bucket[slug] = row.value ?? '';
    out.set(row.postId, bucket);
  }
  return out;
}

/**
 * Fetch the items for one loop config + map them to the placeholder shape.
 */
async function fetchLoopItems(
  siteId: number,
  loop: HtmlRenderLoop,
  offset = 0,
): Promise<{ items: LoopItem[]; total: number; limit: number }> {
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

  // Run the page-of-rows fetch and the total-count in parallel. The count is
  // unconstrained by limit/offset and used to compute totalPages for the
  // `data-pagination` UI.
  const safeOffset = Math.max(0, offset);
  const [rows, countRows] = await Promise.all([
    db.select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      coverImage: posts.coverImage,
      publishedAt: posts.publishedAt,
      postType: posts.postType,
      content: posts.content,
    }).from(posts).where(and(...conditions)).orderBy(orderCol).limit(limit).offset(safeOffset),
    db.select({ c: sql<number>`count(*)::int` }).from(posts).where(and(...conditions)),
  ]);
  const total = countRows[0]?.c ?? 0;

  // Resolve typed custom-field values in a single batched lookup keyed by
  // the post type slug. Empty map when the post type has no schema or the
  // posts have no stored values — `{{post.fields.X}}` then resolves to ''.
  const fieldsByPostId = await fetchPostCustomFields(siteId, loop.postType, rows.map(r => r.id));

  // Pre-build a localized formatter once per fetch so we don't allocate a
  // new Intl instance per row. en-US long form (`May 19, 2026`) is the
  // shape every Cardiff card and most existing list templates expect.
  const dateFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const items = rows.map(r => ({
    id: r.id,
    title: r.title || '',
    slug: r.slug || '',
    url: postUrl(r.postType, r.slug),
    excerpt: r.excerpt || '',
    coverImage: r.coverImage || '',
    publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : '',
    publishedDate: r.publishedAt ? dateFmt.format(new Date(r.publishedAt)) : '',
    postType: r.postType,
    values: collectPostValues(r.content || ''),
    fields: fieldsByPostId.get(r.id) ?? {},
  }));

  return { items, total, limit };
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
    // post.fields.X — typed CMS custom-field value (text/url/image/number/etc).
    // Custom fields are stored as plain strings in the postCustomFieldValues
    // table; escape for safe attribute/text landing (an `image` field's URL
    // can land in `src="..."`, a `text` field can land in markup). If a future
    // field type stores HTML deliberately we'd add a per-type pass-through,
    // but today every field type round-trips as an attribute-safe string.
    if (path.startsWith('fields.')) {
      const key = path.slice('fields.'.length);
      const v = item.fields[key];
      return v == null ? '' : esc(String(v));
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
  return findRegionsByAttr(html, /\bdata-loop="posts"/);
}

/**
 * Generic version of {@link findLoopRegions}: locate every element whose
 * opening tag matches `attrTest`, returning each element's outer-HTML span.
 * Used to share the depth-tracking walker between the posts loop, the
 * pagination wrapper, and the pagination-pages numbered-link template.
 */
function findRegionsByAttr(html: string, attrTest: RegExp): Array<{ start: number; end: number; tag: string; openLen: number }> {
  const tagRx = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'param', 'track']);
  const regions: Array<{ start: number; end: number; tag: string; openLen: number }> = [];
  let m: RegExpExecArray | null;
  // We track depth from the start of a matched element until its matching close.
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
        if (attrTest.test(attrs)) {
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
 * Substitute `{{pagination.X}}` placeholders inside a slice of pagination
 * markup (the outer `data-pagination` wrapper, NOT the inner numbered-link
 * template). Boolean keys (`hasPrev`/`hasNext`) emit `"true"` or empty
 * string so authors can write conditional CSS or use them as `data-*` flags.
 * URL/text values are escaped — they may land inside `href="…"`.
 */
function substitutePaginationVars(html: string, ctx: {
  currentPage: number;
  totalPages: number;
  prevUrl: string;
  nextUrl: string;
  hasPrev: boolean;
  hasNext: boolean;
  currentUrl: string;
}): string {
  return html.replace(/\{\{\s*pagination\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_full, key: string) => {
    switch (key) {
      case 'currentPage': return String(ctx.currentPage);
      case 'totalPages': return String(ctx.totalPages);
      case 'prevUrl': return esc(ctx.prevUrl);
      case 'nextUrl': return esc(ctx.nextUrl);
      case 'currentUrl': return esc(ctx.currentUrl);
      case 'hasPrev': return ctx.hasPrev ? 'true' : '';
      case 'hasNext': return ctx.hasNext ? 'true' : '';
      default: return '';
    }
  });
}

/**
 * Substitute the per-page placeholders inside a single iteration of the
 * `data-pagination-pages` template: `{{page.number}}`, `{{page.url}}`,
 * `{{page.isCurrent}}`. Each iteration also gets the `is-current` class
 * appended to the outer tag when the iteration represents the active page.
 */
function substitutePageItem(html: string, item: { number: number; url: string; isCurrent: boolean }): string {
  return html.replace(/\{\{\s*page\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_full, key: string) => {
    switch (key) {
      case 'number': return String(item.number);
      case 'url': return esc(item.url);
      case 'isCurrent': return item.isCurrent ? 'true' : '';
      default: return '';
    }
  });
}

/**
 * Build a `?page=N` URL on the current pathname, preserving any extra query
 * params the page route surfaced. `page=1` is emitted as a bare pathname so
 * the default landing URL doesn't sprout `?page=1` after navigation.
 */
function buildPageUrl(pathname: string, page: number, extraParams?: Record<string, string>): string {
  const params: string[] = [];
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (k === 'page') continue; // never leak the inbound page param
      params.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    }
  }
  if (page > 1) params.push(`page=${page}`);
  return params.length === 0 ? pathname : `${pathname}?${params.join('&')}`;
}

/**
 * Expand every `data-pagination` region inside `html` into a fully-populated
 * pagination UI. Each region:
 *   - has `{{pagination.currentPage}}` / `{{pagination.totalPages}}` /
 *     `{{pagination.prevUrl}}` / `{{pagination.nextUrl}}` /
 *     `{{pagination.hasPrev}}` / `{{pagination.hasNext}}` substituted in-place
 *   - has any `data-pagination-pages` descendant replaced by N copies of its
 *     inner template, one per page (1..totalPages), with `{{page.number}}`,
 *     `{{page.url}}`, `{{page.isCurrent}}` substituted, and an `is-current`
 *     class added to the active iteration's outer tag
 *   - has the `data-pagination` and `data-pagination-pages` attributes
 *     stripped from the emitted markup so the edit-iframe doesn't try to
 *     make the wrappers editable
 * When `totalPages <= 1` the entire `data-pagination` element is removed —
 * single-page lists don't need a pager.
 */
function expandPaginationRegions(
  html: string,
  pagination: { currentPage: number; totalPages: number; pathname: string; extraParams?: Record<string, string> },
): string {
  const regions = findRegionsByAttr(html, /\bdata-pagination(?!-)/);
  if (regions.length === 0) return html;

  const { currentPage, totalPages, pathname, extraParams } = pagination;
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;
  const prevUrl = hasPrev ? buildPageUrl(pathname, currentPage - 1, extraParams) : '#';
  const nextUrl = hasNext ? buildPageUrl(pathname, currentPage + 1, extraParams) : '#';
  const currentUrl = buildPageUrl(pathname, currentPage, extraParams);

  let out = html;
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    const fullElement = out.slice(r.start, r.end);

    // Drop the entire pagination element when there's nothing to page through.
    if (totalPages <= 1) {
      out = out.slice(0, r.start) + out.slice(r.end);
      continue;
    }

    // Strip the data-pagination attribute itself so the iframe edit layer
    // doesn't treat the wrapper as an editable static field.
    let region = fullElement.replace(/\s+data-pagination(?!-)(="[^"]*")?/, '');

    // 1) Expand inner data-pagination-pages template (back-to-front).
    const pageRegions = findRegionsByAttr(region, /\bdata-pagination-pages\b/);
    for (let j = pageRegions.length - 1; j >= 0; j--) {
      const pr = pageRegions[j];
      const pageWrapper = region.slice(pr.start, pr.end);
      // Pull the inner template (between opening + closing tags) and use it
      // as the per-page repeater. The wrapper element itself is preserved.
      const innerStart = pr.openLen;
      const closeTagLen = `</${pr.tag}>`.length;
      const innerEnd = pageWrapper.length - closeTagLen;
      const itemTemplate = pageWrapper.slice(innerStart, innerEnd);
      const wrapperOpen = pageWrapper.slice(0, innerStart).replace(/\s+data-pagination-pages(="[^"]*")?/, '');
      const wrapperClose = pageWrapper.slice(innerEnd);

      const pagesHtml: string[] = [];
      for (let p = 1; p <= totalPages; p++) {
        const isCurrent = p === currentPage;
        const pageUrl = buildPageUrl(pathname, p, extraParams);
        let iter = substitutePageItem(itemTemplate, { number: p, url: pageUrl, isCurrent });
        if (isCurrent) {
          // Inject is-current onto the outer-most tag's class list. If there's
          // no class attr yet, add one. Only the first tag inside the iteration
          // template is touched — this matches how the post loop annotates
          // its outer tag with `data-loop-item`.
          iter = iter.replace(/^(\s*)<([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)>/, (m, ws, tag, attrs) => {
            if (/\bclass="[^"]*"/.test(attrs)) {
              return `${ws}<${tag}${attrs.replace(/\bclass="([^"]*)"/, 'class="$1 is-current"')}>`;
            }
            return `${ws}<${tag}${attrs} class="is-current">`;
          });
        }
        pagesHtml.push(iter);
      }
      region = region.slice(0, pr.start) + wrapperOpen + pagesHtml.join('') + wrapperClose + region.slice(pr.end);
    }

    // 2) Substitute the wrapper-level pagination placeholders.
    region = substitutePaginationVars(region, { currentPage, totalPages, prevUrl, nextUrl, hasPrev, hasNext, currentUrl });

    out = out.slice(0, r.start) + region + out.slice(r.end);
  }
  return out;
}

/**
 * Replace every `data-loop="posts"` region in the block's html with N copies
 * (one per fetched item). The container element is preserved; only its inner
 * HTML repeats. The data-loop attribute itself is dropped from the output so
 * the iframe edit layer doesn't try to make the wrapper editable.
 */
export async function expandHtmlRenderLoops(siteId: number, block: HtmlRenderBlock, currentPostId?: number, pagination?: LoopPaginationContext): Promise<HtmlRenderBlock> {
  if (!block.loop || block.loop.source !== 'posts') return block;
  const html = block.html || '';
  const regions = findLoopRegions(html);
  const paginationRegions = findRegionsByAttr(html, /\bdata-pagination(?!-)/);
  // Bail when there's neither a loop region nor a pagination region — nothing
  // for this block to do even if the author set a loop config.
  if (regions.length === 0 && paginationRegions.length === 0) return block;

  // Auto-exclude the current post unless the author explicitly excluded it
  const exclude = new Set(block.loop.exclude || []);
  if (currentPostId) exclude.add(currentPostId);

  // Compute the offset from the request's `?page=N`. Default page=1, offset=0
  // matches the pre-pagination behavior when no context is passed.
  const currentPage = Math.max(1, pagination?.page ?? 1);
  const { items, total, limit: effectiveLimit } = await fetchLoopItems(
    siteId,
    { ...block.loop, exclude: Array.from(exclude) },
    (currentPage - 1) * Math.max(1, Math.min(block.loop.limit ?? 3, 24)),
  );
  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));

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

  // Pagination UI expansion — needs pathname to build links. When the page
  // route didn't supply a context (e.g. preview render outside a request) we
  // fall back to the post's slug-less root so links are at least clickable.
  if (paginationRegions.length > 0) {
    const pathname = pagination?.pathname ?? '/';
    out = expandPaginationRegions(out, {
      currentPage,
      totalPages,
      pathname,
      extraParams: pagination?.extraParams,
    });
  }

  return { ...block, html: out };
}

/**
 * Walk a block tree and expand loops + resolve `post` field references inside
 * every html-render block. Mutates a shallow-copied tree; the caller can
 * safely pass the result through the normal renderer.
 */
export async function expandLoopsInBlocks(siteId: number, blocks: Block[], currentPostId?: number, pagination?: LoopPaginationContext): Promise<Block[]> {
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.type === 'html-render') {
      // Resolve post-field references first (turns ids → records), then loop expansion.
      let resolved = await resolvePostFields(siteId, b as HtmlRenderBlock);
      if ((resolved as HtmlRenderBlock).loop) {
        resolved = await expandHtmlRenderLoops(siteId, resolved, currentPostId, pagination);
      }
      out.push(resolved);
      continue;
    }
    // Recurse into containers
    if (b.type === 'columns' && Array.isArray((b as { columns?: Array<{ blocks?: Block[] }> }).columns)) {
      const cols = (b as unknown as { columns: Array<{ blocks: Block[] }> }).columns;
      const newCols = await Promise.all(cols.map(async c => ({ ...c, blocks: await expandLoopsInBlocks(siteId, c.blocks || [], currentPostId, pagination) })));
      out.push({ ...b, columns: newCols } as Block);
      continue;
    }
    if (b.type === 'tabs' && Array.isArray((b as { tabs?: Array<{ blocks?: Block[] }> }).tabs)) {
      const tabs = (b as unknown as { tabs: Array<{ blocks: Block[] }> }).tabs;
      const newTabs = await Promise.all(tabs.map(async t => ({ ...t, blocks: await expandLoopsInBlocks(siteId, t.blocks || [], currentPostId, pagination) })));
      out.push({ ...b, tabs: newTabs } as Block);
      continue;
    }
    if (b.type === 'section' && Array.isArray((b as { blocks?: Block[] }).blocks)) {
      const inner = (b as unknown as { blocks: Block[] }).blocks;
      out.push({ ...b, blocks: await expandLoopsInBlocks(siteId, inner, currentPostId, pagination) } as Block);
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

  // Group post ids by post type so we can do one batched custom-field lookup
  // per post type (mirrors the loop variant). For the single-post case there's
  // usually only one or two post types in play, so this is at most 2–3 queries.
  const idsByPostType = new Map<string, number[]>();
  for (const row of rows) {
    const bucket = idsByPostType.get(row.postType) ?? [];
    bucket.push(row.id);
    idsByPostType.set(row.postType, bucket);
  }
  const allCustomFields = new Map<number, Record<string, string>>();
  for (const [pt, idsForType] of idsByPostType) {
    const m = await fetchPostCustomFields(siteId, pt, idsForType);
    for (const [postId, fieldsMap] of m) allCustomFields.set(postId, fieldsMap);
  }

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
    // Build the resolved record. Top-level scalar fields (title/slug/url/etc)
    // are read by `{{name.title}}` etc.; the typed custom-field values are
    // exposed as a nested `fields` object so authors can use
    // `{{name.fields.<slug>}}` — same shape as the loop's
    // `{{post.fields.<slug>}}`.
    newValues[name] = {
      id: String(row.id),
      title: row.title || '',
      slug: row.slug || '',
      url: postUrl(row.postType, row.slug),
      excerpt: row.excerpt || '',
      coverImage: row.coverImage || '',
      publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : '',
      postType: row.postType,
      fields: allCustomFields.get(row.id) ?? {},
    };
  }
  return { ...block, values: newValues as HtmlRenderBlock['values'] };
}

/**
 * Convenience wrapper that takes a serialized BlockEditorData JSON, expands
 * loops, and returns a serialized JSON. Lets the page route plug this into
 * the existing pipeline alongside `wrapWithTypeTemplate` / `prefetchHtmlEmbeds`.
 */
export async function expandLoopsInContent(siteId: number, contentJson: string, currentPostId?: number, pagination?: LoopPaginationContext): Promise<string> {
  let parsed: { blocks?: Block[]; version?: string };
  try { parsed = JSON.parse(contentJson); } catch { return contentJson; }
  if (!parsed?.blocks?.length) return contentJson;
  const expanded = await expandLoopsInBlocks(siteId, parsed.blocks, currentPostId, pagination);
  return JSON.stringify({ blocks: expanded, version: parsed.version || '1.0' });
}
