/**
 * Read-only state check for postcaptain.com migration.
 * Run: npx tsx -r dotenv/config scripts/migrations/postcaptain/check-state-now.ts dotenv_config_path=.env
 */
import { db } from '@/lib/db';
import { clients, clientWebsites, users, brandingProfiles, clientMembers } from '@/lib/db/schema';
import { eq, ilike, or } from 'drizzle-orm';

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.domain, 'postcaptain.com'));
  console.log('Website (postcaptain.com):', site ? { id: site.id, name: site.name, clientId: site.clientId, brandingProfileId: site.brandingProfileId, subdomain: site.subdomain } : 'NOT FOUND');

  if (site) {
    const [owner] = await db.select().from(clients).where(eq(clients.id, site.clientId));
    console.log('Owning client:', owner ? { id: owner.id, company: owner.company, userId: owner.userId } : 'NOT FOUND');
    if (owner?.userId) {
      const [u] = await db.select().from(users).where(eq(users.id, owner.userId));
      console.log('Owner user:', u ? { id: u.id, email: u.email, name: u.name, role: u.role } : 'NOT FOUND');
    }
    if (site.brandingProfileId) {
      const [p] = await db.select().from(brandingProfiles).where(eq(brandingProfiles.id, site.brandingProfileId));
      console.log('Branding profile:', p ? { id: p.id, name: p.name, clientId: p.clientId, isDefault: p.isDefault } : 'NOT FOUND');
    }
  }

  const pcUsers = await db.select().from(users).where(
    or(ilike(users.email, '%postcaptain%'), ilike(users.email, '%post-captain%'))!,
  );
  console.log('\nExisting postcaptain users:', pcUsers.map(u => ({ id: u.id, email: u.email })));

  const pcClients = await db.select().from(clients).where(
    or(ilike(clients.company, '%post captain%'), ilike(clients.website, '%postcaptain.com%'))!,
  );
  console.log('Existing postcaptain clients:', pcClients.map(c => ({ id: c.id, company: c.company, userId: c.userId, website: c.website })));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
