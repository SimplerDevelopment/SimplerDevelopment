import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts, clientWebsites } = await import('../../../lib/db/schema');
  const { eq, and, like, or } = await import('drizzle-orm');

  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'cardiff-main'));
  if (!site) { console.error('site cardiff-main not found'); process.exit(1); }
  console.log('site:', { id: site.id, clientId: site.clientId, subdomain: site.subdomain });

  const rows = await db.select({ id: posts.id, slug: posts.slug, title: posts.title, postType: posts.postType, websiteId: posts.websiteId, updatedAt: posts.updatedAt })
    .from(posts)
    .where(and(
      eq(posts.websiteId, site.id),
      or(
        like(posts.slug, '%restaur%'),
        like(posts.title, '%estaurant%'),
        like(posts.slug, '%food%'),
        like(posts.slug, '%hospitality%')
      )
    ));
  console.log('matches:', rows.length);
  for (const r of rows) console.log(r);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
