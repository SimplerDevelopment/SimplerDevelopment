import { db } from '@/lib/db';
import { clients, clientWebsites, users, brandingProfiles } from '@/lib/db/schema';
import { ilike, eq, or } from 'drizzle-orm';

async function main() {
  // Broader search — company name or owner email/name
  const byCompany = await db.select().from(clients).where(
    or(
      ilike(clients.company, '%cy%strategies%'),
      ilike(clients.company, '%cystrategies%'),
      ilike(clients.company, '%cody%'),
      ilike(clients.company, '%york%'),
    )!
  );
  console.log('Clients matching CY/Strategies/Cody/York:', JSON.stringify(byCompany, null, 2));

  // Also search users table
  const userMatches = await db.select().from(users).where(
    or(
      ilike(users.email, '%cystrategies%'),
      ilike(users.email, '%codyyork%'),
      ilike(users.name, '%cody%york%'),
    )!
  );
  console.log('\nUsers matching:', JSON.stringify(userMatches, null, 2));

  // For each found client, print sites + branding
  for (const c of byCompany) {
    const sites = await db.select().from(clientWebsites).where(eq(clientWebsites.clientId, c.id));
    console.log(`\nSites for client ${c.id} (${c.company}):`, JSON.stringify(sites, null, 2));
    if (c.userId) {
      const [u] = await db.select().from(users).where(eq(users.id, c.userId)).limit(1);
      console.log(`Owner user:`, u?.email, u?.name);
    }
    const profiles = await db.select().from(brandingProfiles).where(eq(brandingProfiles.clientId, c.id));
    console.log(`Existing branding profiles (${profiles.length}):`, profiles.map(p => ({ id: p.id, name: p.name, isDefault: p.isDefault })));
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
