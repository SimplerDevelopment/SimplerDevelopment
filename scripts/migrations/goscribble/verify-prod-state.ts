/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env' });
async function main(){
  const { db } = await import('../../../lib/db');
  const { clientWebsites, posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [w] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, 3));
  const ps = await db.select().from(posts).where(eq(posts.websiteId, 3));
  console.log('host:', (process.env.DATABASE_URL||'').split('@')[1]?.split('/')[0]);
  console.log('website 3 publicAccess:', w.publicAccess, '| name:', w.name, '| brandingProfileId:', w.brandingProfileId);
  console.log('posts count:', ps.length, '| published true count:', ps.filter(p=>p.published).length);
  console.log('slugs:', ps.map(p=>p.slug).sort().join(', '));
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
