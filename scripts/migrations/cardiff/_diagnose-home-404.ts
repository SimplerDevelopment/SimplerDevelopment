/**
 * READ-ONLY diagnostic. Finds every internal link on the cardiff-main homepage
 * (block content) + the global site navigation, and reports which ones do not
 * resolve to a real published post slug on this site (i.e. render the soft-404).
 * No writes. Run against whichever DB DATABASE_URL points at.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites, siteNavigation } from '../../../lib/db/schema/sites';
import { eq } from 'drizzle-orm';

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site) throw new Error('cardiff-main not found in this DB');
  console.log(`site id=${site.id} subdomain=${site.subdomain} clientId=${(site as any).clientId}`);

  const allPosts = await db
    .select({ id: posts.id, slug: posts.slug, title: posts.title, published: posts.published, content: posts.content })
    .from(posts)
    .where(eq(posts.websiteId, site.id));

  const validSlugs = new Set<string>();
  for (const p of allPosts) {
    if (p.slug != null) validSlugs.add(`/${p.slug}`.replace(/\/+/g, '/'));
  }
  validSlugs.add('/'); // home

  // Identify homepage: slug '' or 'home' or a homepage flag.
  const home = allPosts.find(p => p.slug === '' || p.slug === 'home' || (p as any).isHomepage === true)
    || allPosts.find(p => (p as any).isHomepage)
    || null;
  console.log(`homepage candidate: ${home ? `id=${home.id} slug="${home.slug}" title="${home.title}"` : 'NONE — will scan nav only'}`);

  const linkRe = /\/[A-Za-z0-9][A-Za-z0-9\/_-]*/g;
  const hrefRe = /"(?:href|url|link|to)"\s*:\s*"(\/[^"]*)"/g;

  // --- Nav links ---
  const nav = await db.select().from(siteNavigation).where(eq(siteNavigation.websiteId, site.id));
  console.log(`\n=== NAV (${nav.length} rows) ===`);
  const navBroken: string[] = [];
  for (const n of nav) {
    const href = (n as any).href as string | null;
    if (!href || !href.startsWith('/')) continue;
    const norm = href.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
    const ok = validSlugs.has(norm);
    if (!ok) navBroken.push(`nav#${n.id} parent=${(n as any).parentId ?? '-'} label="${(n as any).label}" -> ${href}`);
  }
  console.log(navBroken.length ? navBroken.join('\n') : '  (no broken nav hrefs)');

  // --- Homepage content links ---
  if (home && home.content) {
    const found = new Set<string>();
    let m;
    while ((m = hrefRe.exec(home.content)) !== null) found.add(m[1]);
    console.log(`\n=== HOMEPAGE content links (post ${home.id}) — ${found.size} distinct ===`);
    const broken: string[] = [];
    for (const href of [...found].sort()) {
      const norm = href.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
      if (!validSlugs.has(norm)) broken.push(href);
    }
    console.log('broken (no matching post slug):');
    console.log(broken.length ? broken.map(b => '  ' + b).join('\n') : '  (none)');
  }

  // --- Any /products/* anywhere on site (the reported pattern) ---
  console.log(`\n=== /products/* occurrences across ALL posts ===`);
  for (const p of allPosts) {
    if (!p.content) continue;
    const hits = [...new Set((p.content.match(/\/products\/[A-Za-z0-9_-]+/g) || []))];
    if (hits.length) console.log(`  post ${p.id} (${p.slug}): ${hits.join(', ')}`);
  }
  const navProducts = nav.filter(n => /\/products\//.test((n as any).href || ''));
  if (navProducts.length) {
    console.log('  NAV /products/*:');
    for (const n of navProducts) console.log(`    nav#${n.id} label="${(n as any).label}" -> ${(n as any).href}`);
  }

  console.log(`\nvalid slugs (${validSlugs.size}): ${[...validSlugs].sort().join(' ')}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
