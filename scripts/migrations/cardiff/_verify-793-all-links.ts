/** READ-ONLY. Extract EVERY internal path in post 793 (incl. html-render raw HTML) and flag 404s. */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { eq } from 'drizzle-orm';

// Known non-post routes that resolve on a client site (not in posts table).
const KNOWN_ROUTES = new Set<string>(['/', '/apply', '/contact-us', '/book', '/s']);

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  const all = await db.select({ slug: posts.slug, published: posts.published }).from(posts).where(eq(posts.websiteId, site!.id));
  const valid = new Set<string>(['/']);
  for (const p of all) valid.add(`/${p.slug}`.replace(/\/+/g, '/'));

  const [home] = await db.select({ content: posts.content, published: posts.published }).from(posts).where(eq(posts.id, 793));
  console.log(`post 793 published=${home!.published}`);
  const c = home!.content;

  // Match both JSON-escaped (href=\"/x\") and plain ("/x") internal paths.
  const paths = new Set<string>();
  // href="..." / href=\"...\" inside html-render
  for (const m of c.matchAll(/href=\\?"(\/[^"\\?#]*)/g)) paths.add(m[1]);
  // JSON fields
  for (const m of c.matchAll(/"(?:href|url|link|to|cta\w*|destination|button\w*)"\s*:\s*"(\/[^"?#]*)"/gi)) paths.add(m[1]);

  const broken: string[] = [];
  for (const p of [...paths].sort()) {
    const norm = p.replace(/\/$/, '') || '/';
    const top = '/' + norm.split('/')[1];
    if (valid.has(norm) || KNOWN_ROUTES.has(norm) || KNOWN_ROUTES.has(top)) continue;
    broken.push(p);
  }
  console.log(`distinct internal paths in post 793: ${paths.size}`);
  console.log('paths:', [...paths].sort().join('  '));
  console.log(`\nBROKEN (no matching slug/route): ${broken.length ? broken.join(', ') : 'NONE — all homepage links resolve'}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
