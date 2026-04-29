/**
 * Recreate the standalone Crossover Capital Advisors client and move the
 * existing website (id 143) + branding profile (id 6) + brand messaging back
 * out of cystrategies (client 98) into the new client.
 *
 * Reverses scripts/migrations/crosscap/move-to-cystrategies.ts.
 */
import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const CYSTRATEGIES_CLIENT_ID = 98;
const WEBSITE_ID = 143;
const BRANDING_PROFILE_ID = 6;

async function main() {
  const { db } = await import('../../../lib/db');
  const {
    users,
    clients,
    clientMembers,
    clientWebsites,
    brandingProfiles,
    brandingMessaging,
  } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const email = 'crosscapadvisors@simplerdevelopment.com';
  const companyName = 'Crossover Capital Advisors';

  // Sanity: confirm the website + branding actually live in cystrategies right now.
  const [website] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, WEBSITE_ID)).limit(1);
  if (!website) throw new Error(`Website ${WEBSITE_ID} not found`);
  if (website.clientId !== CYSTRATEGIES_CLIENT_ID) {
    console.warn(`Website ${WEBSITE_ID} is currently on client ${website.clientId}, expected ${CYSTRATEGIES_CLIENT_ID}. Continuing — will re-target.`);
  }

  const [brand] = await db.select().from(brandingProfiles).where(eq(brandingProfiles.id, BRANDING_PROFILE_ID)).limit(1);
  if (!brand) throw new Error(`Branding profile ${BRANDING_PROFILE_ID} not found`);

  // 1. User (idempotent).
  let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    const hashed = await hash('crosscap2026', 10);
    [user] = await db.insert(users).values({
      name: 'Crossover Capital',
      email,
      password: hashed,
      role: 'client' as const,
      active: true,
    }).returning();
    console.log(`User created: ID ${user.id}`);
  } else {
    console.log(`User exists: ID ${user.id}`);
  }

  // 2. Client (idempotent on userId).
  let [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) {
    [client] = await db.insert(clients).values({
      userId: user.id,
      company: companyName,
      phone: '215.396.5517',
      website: 'https://crosscapadvisors.com',
      notes: 'Crossover Capital Advisors — wealth management & financial planning. Yardley, PA. Family-attorney referral pipeline lives here.',
    }).returning();
    console.log(`Client created: ID ${client.id}`);
  } else {
    console.log(`Client exists: ID ${client.id}`);
  }

  // 3. Owner membership (idempotent).
  const existingMember = await db.select().from(clientMembers)
    .where(and(eq(clientMembers.clientId, client.id), eq(clientMembers.userId, user.id)))
    .limit(1);
  if (existingMember.length === 0) {
    await db.insert(clientMembers).values({ clientId: client.id, userId: user.id, role: 'owner' });
    console.log('Client member (owner) created');
  } else {
    console.log('Client member already exists');
  }

  // 4. Re-parent the website.
  await db.update(clientWebsites).set({ clientId: client.id }).where(eq(clientWebsites.id, WEBSITE_ID));
  console.log(`Website ${WEBSITE_ID} → client ${client.id}`);

  // 5. Re-parent the branding profile.
  await db.update(brandingProfiles).set({ clientId: client.id }).where(eq(brandingProfiles.id, BRANDING_PROFILE_ID));
  console.log(`Branding profile ${BRANDING_PROFILE_ID} → client ${client.id}`);

  // 6. Re-parent the matching brand messaging row(s).
  const moved = await db.update(brandingMessaging)
    .set({ clientId: client.id })
    .where(eq(brandingMessaging.brandingProfileId, BRANDING_PROFILE_ID))
    .returning({ id: brandingMessaging.id });
  console.log(`Brand messaging rows moved: ${moved.length}`);

  // 7. Persist IDs.
  const ids = {
    userId: user.id,
    clientId: client.id,
    websiteId: WEBSITE_ID,
    brandingProfileId: BRANDING_PROFILE_ID,
  };
  fs.writeFileSync(path.join(__dirname, 'ids.json'), JSON.stringify(ids, null, 2));
  console.log('\n=== RESTORED ===');
  console.log(JSON.stringify(ids, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
