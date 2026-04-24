/**
 * Reverse the earlier move: create a fresh PostCaptain client and move
 * postcaptain.com (website 144) + branding profile (id 7) + messaging
 * off CY Strategies (client 98) onto the new PostCaptain client.
 *
 * Idempotent — safe to re-run.
 *
 * Run: npx tsx -r dotenv/config scripts/migrations/postcaptain/reverse-to-new-client.ts dotenv_config_path=.env
 */
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import {
  clients,
  clientWebsites,
  clientMembers,
  users,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const WEBSITE_ID = 144;
const CURRENT_CLIENT_ID = 98;      // CY Strategies (current owner)
const BRANDING_PROFILE_ID = 7;     // Post Captain Brand
const NEW_OWNER_EMAIL = 'postcaptain@simplerdevelopment.com';
const NEW_OWNER_NAME = 'Post Captain Admin';
const NEW_CLIENT_COMPANY = 'Post Captain Consulting';

async function main() {
  const pg = await import('postgres');
  const rawSql = pg.default(process.env.DATABASE_URL!, { max: 1 });

  try {
    console.log('─── Pre-flight ───');
    const [website] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, WEBSITE_ID));
    if (!website) throw new Error(`Website ${WEBSITE_ID} (postcaptain.com) not found`);
    console.log(`  Website ${WEBSITE_ID}: clientId=${website.clientId}, brandingProfileId=${website.brandingProfileId}`);

    const [profileRow] = await rawSql<{ id: number; client_id: number; name: string; is_default: boolean }[]>`
      SELECT id, client_id, name, is_default FROM branding_profiles WHERE id = ${BRANDING_PROFILE_ID} LIMIT 1
    `;
    if (!profileRow) throw new Error(`Branding profile ${BRANDING_PROFILE_ID} not found`);
    console.log(`  Branding profile ${BRANDING_PROFILE_ID}: clientId=${profileRow.client_id}, name="${profileRow.name}", isDefault=${profileRow.is_default}`);

    console.log('\n─── 1. Ensure PostCaptain user exists ───');
    const [existingUser] = await db.select().from(users).where(eq(users.email, NEW_OWNER_EMAIL)).limit(1);
    let userId: number;
    if (existingUser) {
      userId = existingUser.id;
      console.log(`  ✓ Reusing user ${userId} (${NEW_OWNER_EMAIL})`);
    } else {
      const hashed = await hash('postcaptain-temp-2026', 10);
      const [u] = await db.insert(users).values({
        name: NEW_OWNER_NAME,
        email: NEW_OWNER_EMAIL,
        password: hashed,
        role: 'client' as const,
        active: true,
      }).returning();
      userId = u.id;
      console.log(`  ✓ Created user ${userId} (${NEW_OWNER_EMAIL})`);
    }

    console.log('\n─── 2. Ensure PostCaptain client exists ───');
    const [existingClient] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
    let newClientId: number;
    if (existingClient) {
      newClientId = existingClient.id;
      console.log(`  ✓ Reusing client ${newClientId} (${existingClient.company})`);
    } else {
      const [c] = await db.insert(clients).values({
        userId,
        company: NEW_CLIENT_COMPANY,
        phone: '',
        website: 'https://postcaptain.com',
        notes: 'Slate CRM consulting for higher education. Platinum Preferred Partner.',
      }).returning();
      newClientId = c.id;
      console.log(`  ✓ Created client ${newClientId} (${NEW_CLIENT_COMPANY})`);
    }

    if (newClientId === CURRENT_CLIENT_ID) {
      throw new Error(`Refusing to proceed: resolved new client id equals CURRENT_CLIENT_ID (${CURRENT_CLIENT_ID})`);
    }

    console.log('\n─── 3. Ensure owner membership ───');
    const [existingMember] = await db.select().from(clientMembers)
      .where(eq(clientMembers.clientId, newClientId)).limit(1);
    const alreadyOwner = existingMember && existingMember.userId === userId && existingMember.role === 'owner';
    if (alreadyOwner) {
      console.log(`  ✓ Owner membership already exists`);
    } else {
      await db.insert(clientMembers).values({ clientId: newClientId, userId, role: 'owner' })
        .onConflictDoNothing();
      console.log(`  ✓ Owner membership ensured`);
    }

    console.log('\n─── 4. Move website to new client ───');
    if (website.clientId === newClientId) {
      console.log(`  ✓ Website already on client ${newClientId}`);
    } else {
      await db.update(clientWebsites)
        .set({ clientId: newClientId, updatedAt: new Date() })
        .where(eq(clientWebsites.id, WEBSITE_ID));
      console.log(`  ✓ Moved website ${WEBSITE_ID} from client ${website.clientId} → ${newClientId}`);
    }

    console.log('\n─── 5. Move branding profile to new client ───');
    if (profileRow.client_id === newClientId) {
      console.log(`  ✓ Branding profile already on client ${newClientId}`);
    } else {
      // Raw SQL: staging DB missing button_presets col
      await rawSql`
        UPDATE branding_profiles
        SET client_id = ${newClientId},
            is_default = true,
            updated_at = now()
        WHERE id = ${BRANDING_PROFILE_ID}
      `;
      console.log(`  ✓ Moved branding profile ${BRANDING_PROFILE_ID} from client ${profileRow.client_id} → ${newClientId} (isDefault=true)`);
    }

    // Make sure website is linked to the profile
    if (website.brandingProfileId !== BRANDING_PROFILE_ID) {
      await db.update(clientWebsites)
        .set({ brandingProfileId: BRANDING_PROFILE_ID, updatedAt: new Date() })
        .where(eq(clientWebsites.id, WEBSITE_ID));
      console.log(`  ✓ Linked website ${WEBSITE_ID} → branding profile ${BRANDING_PROFILE_ID}`);
    }

    console.log('\n─── 6. Move branding_messaging to new client ───');
    const messagingRows = await rawSql<{ id: number; client_id: number }[]>`
      SELECT id, client_id FROM branding_messaging WHERE branding_profile_id = ${BRANDING_PROFILE_ID}
    `;
    if (messagingRows.length === 0) {
      console.log('  - No messaging row attached to this profile');
    } else {
      for (const m of messagingRows) {
        if (m.client_id === newClientId) {
          console.log(`  ✓ Messaging ${m.id} already on client ${newClientId}`);
        } else {
          await rawSql`UPDATE branding_messaging SET client_id = ${newClientId}, updated_at = now() WHERE id = ${m.id}`;
          console.log(`  ✓ Moved messaging ${m.id} from client ${m.client_id} → ${newClientId}`);
        }
      }
    }

    console.log('\n─── Verification ───');
    const [finalWebsite] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, WEBSITE_ID));
    const [finalProfile] = await rawSql<{ id: number; client_id: number; is_default: boolean; name: string }[]>`
      SELECT id, client_id, is_default, name FROM branding_profiles WHERE id = ${BRANDING_PROFILE_ID}
    `;
    const [finalClient] = await db.select().from(clients).where(eq(clients.id, newClientId));
    console.log(`  New client ${newClientId}: company="${finalClient?.company}", userId=${finalClient?.userId}`);
    console.log(`  Website ${WEBSITE_ID}: clientId=${finalWebsite?.clientId}, brandingProfileId=${finalWebsite?.brandingProfileId}`);
    console.log(`  Branding profile ${BRANDING_PROFILE_ID}: clientId=${finalProfile?.client_id}, isDefault=${finalProfile?.is_default}, name="${finalProfile?.name}"`);

    if (finalWebsite?.clientId !== newClientId) throw new Error('Website move failed');
    if (finalProfile?.client_id !== newClientId) throw new Error('Branding profile move failed');
    console.log('\n✓ Done');
  } finally {
    await rawSql.end();
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
