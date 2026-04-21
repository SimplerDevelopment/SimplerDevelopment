import { db } from '@/lib/db';
import { clients, clientWebsites } from '@/lib/db/schema';
import { ilike, or, eq } from 'drizzle-orm';

async function main() {
  const all = await db.select().from(clientWebsites).where(
    or(
      ilike(clientWebsites.domain, '%postcaptain%'),
      ilike(clientWebsites.subdomain, '%postcaptain%'),
      ilike(clientWebsites.subdomain, '%post-captain%'),
      ilike(clientWebsites.name, '%post%captain%'),
      ilike(clientWebsites.description, '%postcaptain%'),
    )!
  );
  console.log('All postcaptain-related websites:');
  for (const w of all) {
    const [c] = await db.select().from(clients).where(eq(clients.id, w.clientId));
    console.log(`  id=${w.id} name="${w.name}" domain="${w.domain}" subdomain="${w.subdomain}" clientId=${w.clientId} (${c?.company || '?'}) brandingProfileId=${w.brandingProfileId}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
