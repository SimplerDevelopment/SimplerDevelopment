import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function move() {
  const { db } = await import('../../../lib/db');
  const { users, clients, clientMembers, clientWebsites, brandingProfiles, brandingMessaging } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const CYSTRATEGIES_CLIENT_ID = 98;

  // Current crosscap IDs
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const { websiteId, brandingProfileId, clientId: crosscapClientId, userId: crosscapUserId } = ids;

  console.log(`Moving website ${websiteId} and branding ${brandingProfileId} from client ${crosscapClientId} to client ${CYSTRATEGIES_CLIENT_ID}`);

  // 1. Move the website to cystrategies client
  await db.update(clientWebsites)
    .set({ clientId: CYSTRATEGIES_CLIENT_ID })
    .where(eq(clientWebsites.id, websiteId));
  console.log(`Website ${websiteId} moved to client ${CYSTRATEGIES_CLIENT_ID}`);

  // 2. Move the branding profile to cystrategies client
  await db.update(brandingProfiles)
    .set({ clientId: CYSTRATEGIES_CLIENT_ID })
    .where(eq(brandingProfiles.id, brandingProfileId));
  console.log(`Branding profile ${brandingProfileId} moved to client ${CYSTRATEGIES_CLIENT_ID}`);

  // 3. Move the branding messaging to cystrategies client
  await db.update(brandingMessaging)
    .set({ clientId: CYSTRATEGIES_CLIENT_ID })
    .where(eq(brandingMessaging.clientId, crosscapClientId));
  console.log('Branding messaging moved');

  // 4. Clean up the standalone crosscap client + user
  await db.delete(clientMembers).where(eq(clientMembers.clientId, crosscapClientId));
  console.log('Deleted crosscap client member');

  await db.delete(clients).where(eq(clients.id, crosscapClientId));
  console.log(`Deleted crosscap client ${crosscapClientId}`);

  await db.delete(users).where(eq(users.id, crosscapUserId));
  console.log(`Deleted crosscap user ${crosscapUserId}`);

  // 5. Update ids.json
  const newIds = {
    userId: 183,  // cystrategies user
    clientId: CYSTRATEGIES_CLIENT_ID,
    websiteId,
    brandingProfileId,
  };
  fs.writeFileSync(path.join(__dirname, 'ids.json'), JSON.stringify(newIds, null, 2));
  console.log('Updated ids.json');

  console.log('\n=== MOVE COMPLETE ===');
  console.log(`Website ${websiteId} now belongs to CY Strategies (client ${CYSTRATEGIES_CLIENT_ID})`);

  process.exit(0);
}

move().catch(e => { console.error(e); process.exit(1); });
