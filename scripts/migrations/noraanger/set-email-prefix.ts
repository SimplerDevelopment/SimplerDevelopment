/**
 * One-off migration: set emailPrefix='noraanger' on the noraanger client so
 * inbound mail to noraanger@simplerdevelopment.com routes to this client.
 *
 * Idempotent: running multiple times is safe.
 * Usage: npx tsx scripts/migrations/noraanger/set-email-prefix.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../../../lib/db');
  const { users, clients } = await import('../../../lib/db/schema');
  const { eq, and, ne } = await import('drizzle-orm');

  const email = 'noraanger@simplerdevelopment.com';
  const prefix = 'noraanger';

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`User not found: ${email}. Run setup-client.ts first.`);
    process.exit(1);
  }

  const [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) {
    console.error(`Client profile not found for user ${user.id}. Run setup-client.ts first.`);
    process.exit(1);
  }

  // Guard: ensure no other client has this prefix already
  const conflicts = await db.select({ id: clients.id, company: clients.company })
    .from(clients)
    .where(and(eq(clients.emailPrefix, prefix), ne(clients.id, client.id)));
  if (conflicts.length > 0) {
    console.error(`Prefix "${prefix}" is already used by another client:`, conflicts);
    process.exit(1);
  }

  if (client.emailPrefix === prefix) {
    console.log(`Already set: client ${client.id} (${client.company}) has emailPrefix="${prefix}".`);
    process.exit(0);
  }

  await db.update(clients)
    .set({ emailPrefix: prefix, updatedAt: new Date() })
    .where(eq(clients.id, client.id));

  console.log(`Updated: client ${client.id} (${client.company}) emailPrefix="${prefix}".`);
  console.log(`Inbound mail to ${prefix}@simplerdevelopment.com will now route to this client.`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
