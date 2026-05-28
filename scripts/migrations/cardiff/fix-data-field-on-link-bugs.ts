/**
 * Site-wide fix for the `data-field`-on-link bug.
 *
 * Background: the html-render template engine treats `data-field="name"` as a
 * content-swap directive — it replaces the element's inner HTML with the
 * value stored in `values[name]`. When the field is a URL (link, ctaUrl,
 * ctaHref, btnHref, etc.) the button or anchor ends up showing the URL string
 * ("/APPLY" or "https://www.google.com/...") instead of its label.
 *
 * The fix is to STRIP `data-field` from `<a>` / `<button>` elements whose
 * field name targets a URL. The `href="{{X}}"` placeholder we already have on
 * those elements continues to set the link target — no link information is
 * lost.
 *
 * For non-URL text fields on links (ctaText, readMoreText, phoneDisplay, …)
 * we leave data-field intact — those work as intended.
 *
 * Idempotent.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { eq } from 'drizzle-orm';

interface Block { id?: string; type?: string; blocks?: Block[]; html?: string; }

const URL_FIELD_NAME = /^(?:href|url|link|ctaUrl|ctaHref|btnHref|cta_url|cta_href|btn_href|imageUrl|photoUrl|videoUrl|src)$/i;

function isUrlValue(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  return /^\/[^\s]*$/.test(s) || /^https?:\/\//i.test(s) || /^mailto:/i.test(s) || /^tel:/i.test(s);
}

function walk(node: Block, fn: (b: Block) => boolean): boolean {
  let changed = fn(node);
  if (Array.isArray(node.blocks)) for (const c of node.blocks) if (walk(c, fn)) changed = true;
  return changed;
}

/**
 * Strip `data-field="X"` from any `<a>` or `<button>` element where X is a
 * URL-shaped field name OR where the value stored at X looks like a URL.
 *
 * Operates on a single html-render block's html + values payload.
 */
function fixHtml(html: string, values: Record<string, unknown> | undefined): { html: string; n: number } {
  // Match the OPENING tag of <a> and <button> elements (greedy on attributes,
  // stops at the first `>`). Capture data-field="X" within. We re-emit the
  // tag with the data-field attribute stripped when it points at a URL.
  let n = 0;
  const valuesObj = values || {};
  // Build a quick lookup: scan repeat-item arrays so dotted access works.
  function valueLooksLikeUrl(field: string): boolean {
    const top = valuesObj[field];
    if (top !== undefined && isUrlValue(top)) return true;
    // Look inside arrays for matching sub-key
    for (const v of Object.values(valuesObj)) {
      if (Array.isArray(v)) {
        for (const item of v as Record<string, unknown>[]) {
          if (item && typeof item === 'object' && field in item && isUrlValue(item[field])) return true;
        }
      }
    }
    return false;
  }
  const out = html.replace(/<(a|button)\b([^>]*)>/gi, (full, tag, attrs) => {
    const dfMatch = attrs.match(/\s+data-field="([a-zA-Z_][a-zA-Z0-9_-]*)"/);
    if (!dfMatch) return full;
    const field = dfMatch[1];
    // Strip if the field name itself is URL-shaped, OR the value at that field
    // resolves to a URL string.
    if (URL_FIELD_NAME.test(field) || valueLooksLikeUrl(field)) {
      n += 1;
      const cleanAttrs = attrs.replace(/\s+data-field="[a-zA-Z_][a-zA-Z0-9_-]*"/, '');
      return `<${tag}${cleanAttrs}>`;
    }
    return full;
  });
  return { html: out, n };
}

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site) throw new Error('cardiff-main not found');
  const rows = await db.select({ id: posts.id, slug: posts.slug, content: posts.content }).from(posts).where(eq(posts.websiteId, site.id));
  console.log(`Scanning ${rows.length} posts...`);
  let postsTouched = 0;
  let totalFixed = 0;
  for (const r of rows) {
    if (!r.content) continue;
    let parsed: { blocks?: Block[] };
    try { parsed = JSON.parse(r.content); } catch { continue; }
    let postChanged = false;
    let postCount = 0;
    for (const top of parsed.blocks || []) {
      walk(top, (b) => {
        if (b.type !== 'html-render' || !b.html) return false;
        const { html, n } = fixHtml(b.html, (b as Block & { values?: Record<string, unknown> }).values);
        if (n === 0) return false;
        b.html = html;
        postCount += n;
        return true;
      });
    }
    if (postCount > 0) {
      postChanged = true;
      await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, r.id));
      console.log(`  post ${r.id} (${r.slug}): stripped data-field from ${postCount} link${postCount === 1 ? '' : 's'}`);
    }
    if (postChanged) { postsTouched += 1; totalFixed += postCount; }
  }
  console.log(`\nDone. Posts touched: ${postsTouched}. data-field strips: ${totalFixed}.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
