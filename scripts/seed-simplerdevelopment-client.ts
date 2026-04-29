/**
 * Seed a "SimplerDevelopment" portal client for dogfooding integrations
 * (Drive, Calendar, Workspace, etc). Idempotent — safe to re-run.
 *
 * Creates:
 *   - users row "SimplerDevelopment" (placeholder owner; password is random &
 *     unused — you log in as your existing user and switch into this client)
 *   - clients row company="SimplerDevelopment", owned by that user
 *   - client_members row adding info@danielpcoyle.com as admin
 *   - sets info@danielpcoyle.com's default_client_id to the new client
 */

import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';

dotenv.config({ path: '.env' });

const TEAM_ADMIN_EMAIL = 'info@danielpcoyle.com';
const OWNER_EMAIL = 'simplerdevelopment@simplerdevelopment.com';
const COMPANY = 'SimplerDevelopment';

async function main() {
  const { db } = await import('../lib/db');
  const { users, clients, clientMembers } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  // 1. Resolve the team admin user (info@danielpcoyle.com) — must exist.
  const [teamAdmin] = await db.select().from(users).where(eq(users.email, TEAM_ADMIN_EMAIL)).limit(1);
  if (!teamAdmin) {
    throw new Error(`User ${TEAM_ADMIN_EMAIL} not found — create it first (login at least once via the admin portal).`);
  }
  console.log(`✓ Team admin resolved: user #${teamAdmin.id} ${teamAdmin.email}`);

  // 2. Get-or-create the placeholder owner user.
  const [existingOwner] = await db.select().from(users).where(eq(users.email, OWNER_EMAIL)).limit(1);
  let owner = existingOwner;
  if (!owner) {
    const placeholderPassword = randomBytes(24).toString('hex');
    const hashed = await hash(placeholderPassword, 10);
    [owner] = await db.insert(users).values({
      name: COMPANY,
      email: OWNER_EMAIL,
      password: hashed,
      role: 'client',
      active: true,
    }).returning();
    console.log(`✓ Created placeholder owner: user #${owner.id} ${owner.email}`);
  } else {
    console.log(`✓ Placeholder owner already exists: user #${owner.id}`);
  }

  // 3. Get-or-create the client row.
  const [existingClient] = await db.select().from(clients).where(eq(clients.userId, owner.id)).limit(1);
  let client = existingClient;
  if (!client) {
    [client] = await db.insert(clients).values({
      userId: owner.id,
      company: COMPANY,
      website: 'https://simplerdevelopment.com',
      notes: 'Internal SimplerDevelopment dogfood client — used for testing Workspace integrations against our own data.',
    }).returning();
    console.log(`✓ Created client: #${client.id} "${client.company}"`);
  } else {
    console.log(`✓ Client already exists: #${client.id} "${client.company}"`);
  }

  // 4. Make sure the team admin is an admin member of this client.
  const [existingMember] = await db.select().from(clientMembers)
    .where(eq(clientMembers.clientId, client.id))
    .limit(20)
    .then((rows) => rows.filter((r) => r.userId === teamAdmin.id));
  if (!existingMember) {
    await db.insert(clientMembers).values({
      clientId: client.id,
      userId: teamAdmin.id,
      role: 'admin',
      invitedBy: teamAdmin.id,
    });
    console.log(`✓ Added ${TEAM_ADMIN_EMAIL} as admin member`);
  } else {
    console.log(`✓ ${TEAM_ADMIN_EMAIL} already a member (role: ${existingMember.role})`);
  }

  // 5. Default the team admin to land on this client when they sign in.
  if (teamAdmin.defaultClientId !== client.id) {
    await db.update(users)
      .set({ defaultClientId: client.id, updatedAt: new Date() })
      .where(eq(users.id, teamAdmin.id));
    console.log(`✓ Set ${TEAM_ADMIN_EMAIL}'s default_client_id → ${client.id}`);
  } else {
    console.log(`✓ default_client_id already set`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SimplerDevelopment client ready');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Client ID:     ${client.id}`);
  console.log(`  Owner user:    #${owner.id} (${OWNER_EMAIL})`);
  console.log(`  Login as:      ${TEAM_ADMIN_EMAIL}`);
  console.log(`  Switch via:    Portal company switcher → "${COMPANY}"`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
