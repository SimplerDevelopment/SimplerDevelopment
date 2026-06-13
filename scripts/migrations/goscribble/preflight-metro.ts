/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env' });
async function main() {
  const { db } = await import('../../../lib/db');
  const { clientWebsites, users, storeSettings, clients } = await import('../../../lib/db/schema');
  const { eq, ilike, sql } = await import('drizzle-orm');
  console.log('connected host:', (process.env.DATABASE_URL||'').split('@')[1]?.split('/')[0]);
  const wc = await db.execute(sql`select count(*)::int n, max(id)::int maxid from client_websites`);
  console.log('client_websites:', JSON.stringify((wc as any).rows ?? wc));
  const w144 = await db.select({id:clientWebsites.id,name:clientWebsites.name,sub:clientWebsites.subdomain}).from(clientWebsites).where(eq(clientWebsites.id,144));
  console.log('site 144 (Post Captain expected):', JSON.stringify(w144));
  const pc = await db.select({id:clients.id,company:clients.company}).from(clients).where(ilike(clients.company,'%post captain%'));
  console.log('post captain client:', JSON.stringify(pc));
  const sub = await db.select({id:clientWebsites.id}).from(clientWebsites).where(eq(clientWebsites.subdomain,'scribble'));
  console.log('scribble subdomain collision:', sub.length);
  const u = await db.select({id:users.id}).from(users).where(eq(users.email,'scribble@simplerdevelopment.com'));
  console.log('scribble email collision:', u.length);
  console.log('storeSettings export ok:', !!storeSettings);
  process.exit(0);
}
main().catch(e=>{console.error('ERR',e.message);process.exit(1);});
