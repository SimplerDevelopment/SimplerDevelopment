import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites, siteNavigation } from '../../../lib/db/schema/sites';
import { eq } from 'drizzle-orm';

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site) throw new Error('cardiff-main not found');
  const rows = await db.select({ id: posts.id, slug: posts.slug, content: posts.content }).from(posts).where(eq(posts.websiteId, site.id));

  const urlRe = /(?:https?:)?\/\/(?:www\.)?cardiff\.co\/[^\s"'<>)]*/gi;
  const tally = new Map<string, number>();
  const perPost = new Map<number, number>();
  for (const r of rows) {
    if (!r.content) continue;
    const matches = r.content.match(urlRe);
    if (!matches) continue;
    perPost.set(r.id, matches.length);
    for (const m of matches) {
      const clean = m.replace(/[",;)]+$/, '');
      tally.set(clean, (tally.get(clean) || 0) + 1);
    }
  }
  // Top URLs
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  console.log('--- Distinct cardiff.co URLs in posts.content (top 40) ---');
  for (const [url, n] of sorted.slice(0, 40)) {
    console.log(`  ${String(n).padStart(4)}  ${url}`);
  }
  console.log(`\nTotal distinct URLs: ${tally.size}`);
  console.log(`Total occurrences: ${sorted.reduce((s, [, n]) => s + n, 0)}`);
  console.log(`Posts containing cardiff.co URLs: ${perPost.size}`);

  // Nav check
  const nav = await db.select().from(siteNavigation).where(eq(siteNavigation.websiteId, site.id));
  const navMatches = nav.filter(n => /cardiff\.co/i.test(n.href));
  console.log(`\nNav items linking to cardiff.co: ${navMatches.length}`);
  for (const n of navMatches.slice(0, 30)) {
    console.log(`  nav ${n.id} (${n.label}) -> ${n.href}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
