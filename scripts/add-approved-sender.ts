/**
 * Add an approved email sender to a client account.
 *
 * Usage: npx tsx scripts/add-approved-sender.ts <email_prefix> <sender_email>
 * Example: npx tsx scripts/add-approved-sender.ts caq admin@simplerdevelopment.com
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function main() {
  const [prefix, senderEmail] = process.argv.slice(2);
  if (!prefix || !senderEmail) {
    console.error('Usage: npx tsx scripts/add-approved-sender.ts <email_prefix> <sender_email>');
    process.exit(1);
  }

  const { db } = await import('../lib/db');
  const { clients, users, clientMembers } = await import('../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');
  const { hash } = await import('bcryptjs');

  // Find client by email prefix
  const [client] = await db.select().from(clients)
    .where(eq(clients.emailPrefix, prefix)).limit(1);
  if (!client) {
    console.error(`No client found with emailPrefix "${prefix}"`);
    process.exit(1);
  }
  console.log(`Found client: ${client.company} (id=${client.id})`);

  // Find or create user with that email
  let [user] = await db.select().from(users)
    .where(eq(users.email, senderEmail.toLowerCase())).limit(1);

  if (!user) {
    const tempPassword = await hash(Math.random().toString(36).slice(2), 10);
    [user] = await db.insert(users).values({
      name: senderEmail.split('@')[0],
      email: senderEmail.toLowerCase(),
      password: tempPassword,
      role: 'client',
      active: true,
    }).returning();
    console.log(`Created user: ${user.email} (id=${user.id})`);
  } else {
    console.log(`User already exists: ${user.email} (id=${user.id})`);
  }

  // Check if already a member
  const [existing] = await db.select().from(clientMembers)
    .where(and(eq(clientMembers.clientId, client.id), eq(clientMembers.userId, user.id))).limit(1);
  if (existing) {
    console.log(`Already a member with role "${existing.role}" — nothing to do.`);
    process.exit(0);
  }

  // Add as member
  await db.insert(clientMembers).values({
    clientId: client.id,
    userId: user.id,
    role: 'admin',
  });

  console.log(`Added ${senderEmail} as admin member of "${client.company}" (prefix: ${prefix}@simplerdevelopment.com)`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
