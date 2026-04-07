import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function main() {
  const { db } = await import('../../../lib/db');
  const { users, clients, clientWebsites, brandingProfiles } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const [u] = await db.select().from(users).where(eq(users.email, 'cystrategies@simplerdevelopment.com')).limit(1);
  if (!u) { console.log('No cystrategies user found'); process.exit(0); }
  const [c] = await db.select().from(clients).where(eq(clients.userId, u.id)).limit(1);
  const sites = await db.select().from(clientWebsites).where(eq(clientWebsites.clientId, c.id));
  const profiles = await db.select().from(brandingProfiles).where(eq(brandingProfiles.clientId, c.id));

  console.log('cystrategies userId:', u.id, 'clientId:', c.id);
  for (const s of sites) console.log('  site:', s.id, s.name, 'subdomain:', s.subdomain, 'brandingProfileId:', s.brandingProfileId);
  for (const p of profiles) console.log('  branding:', p.id, p.name);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
