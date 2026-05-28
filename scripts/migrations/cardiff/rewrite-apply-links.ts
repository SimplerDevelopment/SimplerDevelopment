/**
 * Rewrite every cardiff-main link that points at the external cardiff.co
 * apply funnel so it lands on the local /apply page instead.
 *
 * Covers:
 *   - posts.content (recursive walk of block JSON — catches *any* string field:
 *     ctaUrl, primaryUrl, secondaryUrl, href, url, button.url, html template
 *     literals, html-render `values`, etc.)
 *   - site_navigation.href (top nav "Apply Now" CTA)
 *
 * Rewrites:
 *   https://cardiff.co/business/apply       -> /apply
 *   https://cardiff.co/business/apply/      -> /apply
 *   http://cardiff.co/business/apply        -> /apply
 *   http://cardiff.co/business/apply/       -> /apply
 *   //cardiff.co/business/apply             -> /apply
 *   //cardiff.co/business/apply/            -> /apply
 *   /business/apply                         -> /apply
 *   /business/apply/                        -> /apply
 *
 * Idempotent: re-running finds nothing to rewrite.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites, siteNavigation } from '../../../lib/db/schema/sites';
import { eq, and, like } from 'drizzle-orm';

const APPLY_RE = /(?:https?:)?\/\/cardiff\.co\/business\/apply\/?|(?<![A-Za-z0-9_-])\/business\/apply\/?/g;
const TARGET = '/apply';

function rewriteString(s: string): { value: string; changed: number } {
  let changed = 0;
  const value = s.replace(APPLY_RE, () => {
    changed += 1;
    return TARGET;
  });
  return { value, changed };
}

function walk(node: unknown, counter: { n: number }): unknown {
  if (typeof node === 'string') {
    const { value, changed } = rewriteString(node);
    counter.n += changed;
    return value;
  }
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, counter));
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = walk(v, counter);
    }
    return out;
  }
  return node;
}

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site) throw new Error('cardiff-main site not found');
  const websiteId = site.id;
  console.log(`cardiff-main websiteId=${websiteId}`);

  // --- 1. posts.content ---
  const rows = await db.select({ id: posts.id, slug: posts.slug, content: posts.content }).from(posts).where(eq(posts.websiteId, websiteId));
  console.log(`Scanning ${rows.length} posts...`);
  let postsTouched = 0;
  let postLinksRewritten = 0;
  for (const row of rows) {
    if (!row.content) continue;
    if (!row.content.includes('/business/apply')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.content);
    } catch {
      console.warn(`  post ${row.id} (${row.slug}): content not JSON, skipping`);
      continue;
    }
    const counter = { n: 0 };
    const next = walk(parsed, counter);
    if (counter.n === 0) continue;
    await db.update(posts).set({ content: JSON.stringify(next), updatedAt: new Date() }).where(eq(posts.id, row.id));
    postsTouched += 1;
    postLinksRewritten += counter.n;
    console.log(`  post ${row.id} (${row.slug}): rewrote ${counter.n} link${counter.n === 1 ? '' : 's'}`);
  }
  console.log(`Posts: ${postsTouched} touched, ${postLinksRewritten} links rewritten.`);

  // --- 2. site_navigation.href ---
  const navRows = await db.select().from(siteNavigation).where(and(eq(siteNavigation.websiteId, websiteId), like(siteNavigation.href, '%/business/apply%')));
  console.log(`Scanning ${navRows.length} matching nav items...`);
  let navTouched = 0;
  for (const item of navRows) {
    const { value, changed } = rewriteString(item.href);
    if (changed === 0) continue;
    await db.update(siteNavigation).set({ href: value, updatedAt: new Date() }).where(eq(siteNavigation.id, item.id));
    navTouched += 1;
    console.log(`  nav ${item.id} (${item.label}): "${item.href}" -> "${value}"`);
  }
  console.log(`Nav: ${navTouched} touched.`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
