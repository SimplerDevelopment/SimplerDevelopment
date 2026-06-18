/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
async function main() {
  const { db } = await import('../../../lib/db');
  const { clientWebsites, users, storeSettings } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  console.log('DB host:', (process.env.DATABASE_URL||'').split('@')[1]?.split('/')[0]);
  const sub = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, 'scribble'));
  console.log('subdomain=scribble count:', sub.length, JSON.stringify(sub.map(s=>({id:s.id,clientId:s.clientId,name:s.name}))));
  const u = await db.select().from(users).where(eq(users.email, 'scribble@simplerdevelopment.com'));
  console.log('users email match count:', u.length);
  console.log('storeSettings export present:', !!storeSettings);
  process.exit(0);
}
main().catch(e=>{console.error('ERR', e.message); process.exit(1);});
