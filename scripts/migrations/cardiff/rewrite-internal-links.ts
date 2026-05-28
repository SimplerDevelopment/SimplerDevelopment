/**
 * Rewrite remaining cardiff.co page links in posts.content to local slugs.
 *
 * Scope:
 *   - HTML page links (e.g. https://cardiff.co/newsroom/, https://cardiff.co/learn/faq/)
 *   - Skips asset URLs (wp-content/uploads/, assets/img/, anything ending in
 *     .jpg/.jpeg/.png/.svg/.webp/.gif/.mp4/.pdf/.ico) — those are CDN assets we
 *     don't host locally; leaving them keeps the visuals working.
 *
 * Path rewrites (cardiff.co tree → local slug):
 *   /                                      → /
 *   /<slug>/                               → /<slug>
 *   /learn/<slug>/                         → /<slug>            (we flatten learn/)
 *   /learn/news/<slug>/                    → /<slug>
 *   /industries/<vertical>/                → /industries-<vertical>  (with overrides)
 *   /faqs/                                 → /learn-faq
 *   /cardiff-coins/                        → no local equiv — leave external
 *   /industries/manufacturing/             → no local equiv — leave external
 *
 * Idempotent.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { eq } from 'drizzle-orm';

const ASSET_EXT = /\.(?:jpe?g|png|svg|webp|gif|mp4|webm|pdf|ico|css|js|woff2?|ttf)(?:\?[^"'\s]*)?$/i;
const ASSET_PATH = /\/(?:wp-content|assets|wp-includes)\//i;

// Pages that exist on cardiff.co but not in our port — leave external.
const LEAVE_EXTERNAL = new Set<string>([
  '/cardiff-coins',
  '/industries/manufacturing',
]);

// Special-case slug rewrites where the local slug differs from cardiff.co's URL path.
const PATH_OVERRIDES: Record<string, string> = {
  '/industries/contractors': '/industries-contracting',
  '/industries/salons': '/industries-beauty-salon',
  '/industries/agriculture': '/agriculture',
  '/faqs': '/learn-faq',
  '/learn/faq': '/learn-faq',
};

function mapPath(pathRaw: string): string | null {
  // Normalize: strip trailing slash, drop leading slash for matching
  let path = pathRaw.replace(/\/+$/, '');
  if (path === '') path = '/';
  if (path === '/') return '/';
  if (LEAVE_EXTERNAL.has(path)) return null;
  if (PATH_OVERRIDES[path]) return PATH_OVERRIDES[path];

  // /industries/<vertical> → /industries-<vertical>
  const indMatch = path.match(/^\/industries\/([^/]+)$/);
  if (indMatch) return `/industries-${indMatch[1]}`;

  // /learn/news/<slug> → /<slug>
  const learnNewsMatch = path.match(/^\/learn\/news\/([^/]+)$/);
  if (learnNewsMatch) return `/${learnNewsMatch[1]}`;

  // /learn/<slug> → /<slug>
  const learnMatch = path.match(/^\/learn\/([^/]+)$/);
  if (learnMatch) return `/${learnMatch[1]}`;

  // Top-level /<slug> stays /<slug>
  if (/^\/[^/]+$/.test(path)) return path;

  // Deeper paths we don't recognize — leave external
  return null;
}

function rewriteUrl(url: string): string | null {
  // Already-relative or asset URLs we leave alone (mapped upstream)
  if (ASSET_EXT.test(url) || ASSET_PATH.test(url)) return null;
  const m = url.match(/^(https?:)?\/\/(?:www\.)?cardiff\.co(\/[^\s"'<>)]*)?$/i);
  if (!m) return null;
  const pathRaw = m[2] || '/';
  return mapPath(pathRaw);
}

function walk(node: unknown, counter: { rewritten: number; preserved: number }): unknown {
  if (typeof node === 'string') {
    // Rewrite every cardiff.co URL inside the string (could be href attribute, html block, json field, etc.)
    let out = node;
    out = out.replace(/(?:https?:)?\/\/(?:www\.)?cardiff\.co\/[^\s"'<>)]*/gi, (match) => {
      // Trim trailing punctuation that isn't part of the URL
      const trimmed = match.replace(/[",;)]+$/, '');
      const trail = match.slice(trimmed.length);
      const next = rewriteUrl(trimmed);
      if (next == null) {
        counter.preserved += 1;
        return match;
      }
      counter.rewritten += 1;
      return next + trail;
    });
    return out;
  }
  if (Array.isArray(node)) return node.map((item) => walk(item, counter));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = walk(v, counter);
    return out;
  }
  return node;
}

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site) throw new Error('cardiff-main not found');
  const rows = await db.select({ id: posts.id, slug: posts.slug, content: posts.content }).from(posts).where(eq(posts.websiteId, site.id));
  console.log(`Scanning ${rows.length} posts for cardiff.co page links...`);
  let postsTouched = 0;
  let totalRewritten = 0;
  let totalPreserved = 0;
  for (const r of rows) {
    if (!r.content) continue;
    if (!r.content.includes('cardiff.co')) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(r.content); }
    catch { console.warn(`  post ${r.id} (${r.slug}): not JSON, skip`); continue; }
    const counter = { rewritten: 0, preserved: 0 };
    const next = walk(parsed, counter);
    totalPreserved += counter.preserved;
    if (counter.rewritten === 0) continue;
    await db.update(posts).set({ content: JSON.stringify(next), updatedAt: new Date() }).where(eq(posts.id, r.id));
    postsTouched += 1;
    totalRewritten += counter.rewritten;
    console.log(`  post ${r.id} (${r.slug}): rewrote ${counter.rewritten}, preserved ${counter.preserved}`);
  }
  console.log(`\nDone. Posts touched: ${postsTouched}. Links rewritten: ${totalRewritten}. Asset/unknown URLs preserved: ${totalPreserved}.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
