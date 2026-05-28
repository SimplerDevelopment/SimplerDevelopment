import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { clientWebsites } from '../../../lib/db/schema/sites';
import { eq } from 'drizzle-orm';

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main')).limit(1);
  if (!site) throw new Error('cardiff-main not found');
  const rows = await db.select().from(posts).where(eq(posts.websiteId, site.id));
  const byType = new Map<string, typeof rows>();
  for (const r of rows) {
    const t = r.postType || 'page';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(r);
  }
  for (const [type, items] of Array.from(byType).sort()) {
    console.log(`\n=== ${type} (${items.length}) ===`);
    for (const it of items.sort((a, b) => (a.slug || '').localeCompare(b.slug || ''))) {
      console.log(`  ${it.id.toString().padStart(4)}  /${it.slug}  [${it.published ? 'pub' : 'draft'}]  ${it.title?.slice(0, 60) ?? ''}`);
    }
  }
  console.log(`\nTotal non-trash: ${rows.length}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
