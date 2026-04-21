import { db } from '@/lib/db';
import { clients, clientWebsites, users, brandingProfiles, brandingMessaging, siteBranding } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';

async function main() {
  // Look for the old Post Captain client (id 100 or email match)
  const pcUsers = await db.select().from(users).where(eq(users.email, 'postcaptain@simplerdevelopment.com'));
  console.log('Post Captain users:', pcUsers.map(u => ({ id: u.id, email: u.email, name: u.name })));

  // Look for any client tied to postcaptain
  const pcClients = await db.select().from(clients).where(eq(clients.website, 'https://postcaptain.com'));
  console.log('\nClients with postcaptain.com website:', pcClients.map(c => ({ id: c.id, company: c.company, userId: c.userId })));

  // Check website 144
  const [w144] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, 144));
  console.log('\nWebsite id 144:', w144 ? { id: w144.id, clientId: w144.clientId, name: w144.name, domain: w144.domain, subdomain: w144.subdomain } : 'NOT FOUND');

  // Check any website with postcaptain subdomain/domain under any client
  const pcWebsites = await db.select().from(clientWebsites).where(
    or(eq(clientWebsites.domain, 'postcaptain.com'), eq(clientWebsites.subdomain, 'postcaptain'), eq(clientWebsites.subdomain, 'post-captain'))!
  );
  console.log('\nWebsites matching postcaptain.com domain or subdomain:', pcWebsites);

  // Branding profile id 7+ for any postcaptain-related
  const pcProfiles = await db.select().from(brandingProfiles).where(eq(brandingProfiles.name, 'Post Captain Brand'));
  console.log('\nExisting "Post Captain Brand" profiles:', pcProfiles.map(p => ({ id: p.id, clientId: p.clientId, isDefault: p.isDefault })));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
