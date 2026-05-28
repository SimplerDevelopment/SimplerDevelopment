/**
 * Cardiff migration — Step 2: Client + Website setup
 *
 * Creates (or reuses) the portal client for Cardiff and provisions a
 * client_websites record. Idempotent: re-running is safe.
 *
 * Run:  npx tsx scripts/migrations/cardiff/setup-client.ts
 */

import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// .env.local takes precedence — see memory feedback_sd2026_dotenv_override
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const COMPANY = 'Cardiff';
const SITE_NAME = 'Cardiff Marketing Site';
const SOURCE_URL = 'https://cardiff.co';
const CONTACT_NAME = 'Cardiff Owner';
const CONTACT_EMAIL = 'cardiff@simplerdevelopment.com';
const TEMP_PASSWORD = 'cardiff-temp-' + Math.random().toString(36).slice(2, 10);

async function main() {
  const { db } = await import('../../../lib/db');
  const { users, clients, clientMembers, clientWebsites } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { generateUniqueSubdomain } = await import('../../../lib/subdomain');

  // 1. user (create or find)
  const existingUser = await db.select().from(users).where(eq(users.email, CONTACT_EMAIL)).limit(1);
  let user = existingUser[0];
  if (!user) {
    const hashed = await hash(TEMP_PASSWORD, 10);
    [user] = await db.insert(users).values({
      name: CONTACT_NAME,
      email: CONTACT_EMAIL,
      password: hashed,
      role: 'client',
      active: true,
    }).returning();
    console.log(`✅ Created user id=${user.id} email=${CONTACT_EMAIL} tempPassword=${TEMP_PASSWORD}`);
  } else {
    console.log(`ℹ️  Found existing user id=${user.id} email=${CONTACT_EMAIL}`);
  }

  // 2. client (create or find)
  const existingClient = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  let client = existingClient[0];
  if (!client) {
    [client] = await db.insert(clients).values({
      userId: user.id,
      company: COMPANY,
      website: SOURCE_URL,
      notes: `Migrated from ${SOURCE_URL} on ${new Date().toISOString().slice(0, 10)}`,
    }).returning();
    console.log(`✅ Created client id=${client.id} company=${COMPANY}`);
  } else {
    console.log(`ℹ️  Found existing client id=${client.id} company=${client.company}`);
  }

  // 3. clientMembers (idempotent)
  const existingMember = await db.select().from(clientMembers)
    .where(eq(clientMembers.userId, user.id))
    .limit(1);
  if (!existingMember.length) {
    await db.insert(clientMembers).values({
      clientId: client.id,
      userId: user.id,
      role: 'owner',
    });
    console.log(`✅ Created client_members row (owner)`);
  } else {
    console.log(`ℹ️  client_members row already present`);
  }

  // 4. clientWebsites (look for an existing site matching cardiff.co)
  const existingSites = await db.select().from(clientWebsites)
    .where(eq(clientWebsites.clientId, client.id));
  let website = existingSites.find(s => s.domain === SOURCE_URL || s.name === SITE_NAME);
  if (!website) {
    const subdomain = await generateUniqueSubdomain(COMPANY, 'main');
    [website] = await db.insert(clientWebsites).values({
      clientId: client.id,
      name: SITE_NAME,
      domain: null,
      description: 'Business lending — working capital, lines of credit, SBA, equipment leasing, MCA, invoice financing for small businesses.',
      subdomain,
      vercelDomain: `${subdomain}.simplerdevelopment.com`,
      deploymentStatus: 'active',
      active: true,
      publicAccess: false, // gated until we explicitly enable for QA
    }).returning();
    console.log(`✅ Created clientWebsites id=${website.id} subdomain=${subdomain}`);
  } else {
    console.log(`ℹ️  Found existing website id=${website.id} subdomain=${website.subdomain}`);
  }

  // Persist IDs for downstream scripts
  const outDir = join(process.cwd(), 'scripts/migrations/cardiff/.state');
  mkdirSync(outDir, { recursive: true });
  const state = {
    userId: user.id,
    clientId: client.id,
    websiteId: website.id,
    subdomain: website.subdomain,
    company: COMPANY,
    sourceUrl: SOURCE_URL,
  };
  writeFileSync(join(outDir, 'ids.json'), JSON.stringify(state, null, 2));
  console.log(`\nSaved state to scripts/migrations/cardiff/.state/ids.json`);
  console.log(JSON.stringify(state, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
