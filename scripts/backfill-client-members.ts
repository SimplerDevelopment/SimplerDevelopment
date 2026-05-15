/**
 * Backfill `client_members` for orphan clients.
 *
 * Background: `clients.user_id` is the legacy 1:1 owner column. The newer
 * `client_members` table is what every auth / portal lookup actually reads from.
 * A handful of live clients have a `user_id` but zero `client_members` rows —
 * which silently locks them out of the portal because the membership check
 * returns nothing.
 *
 * This script finds every client with zero membership rows and inserts a
 * `role='owner'` row using the existing `clients.user_id`. Idempotent —
 * re-running prints "Backfilled 0 clients".
 *
 * Usage:
 *   bun scripts/backfill-client-members.ts
 *
 * Picks up DATABASE_URL from the environment via lib/db (.env is loaded by
 * dotenv below to match other one-off scripts in scripts/).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function main() {
  const { db } = await import('../lib/db');
  const { clients, clientMembers } = await import('../lib/db/schema');
  const { eq, sql } = await import('drizzle-orm');

  // Select clients that currently have zero rows in client_members.
  const orphans = await db
    .select({ id: clients.id, userId: clients.userId, company: clients.company })
    .from(clients)
    .where(sql`NOT EXISTS (SELECT 1 FROM ${clientMembers} WHERE ${clientMembers.clientId} = ${clients.id})`);

  if (orphans.length === 0) {
    console.log('Backfilled 0 clients');
    process.exit(0);
  }

  const inserted: Array<{ clientId: number; userId: number; company: string | null }> = [];
  for (const c of orphans) {
    if (!c.userId) {
      console.warn(`  skip client ${c.id} (${c.company ?? 'no company'}) — clients.user_id is NULL`);
      continue;
    }
    // Defense in depth: an `ON CONFLICT DO NOTHING` would require a unique
    // constraint we don't have, so just check first. This branch shouldn't
    // fire because we filtered for zero members above, but keep it safe in
    // case a parallel run inserted while we were iterating.
    const [existing] = await db
      .select({ id: clientMembers.id })
      .from(clientMembers)
      .where(eq(clientMembers.clientId, c.id))
      .limit(1);
    if (existing) continue;

    await db.insert(clientMembers).values({
      clientId: c.id,
      userId: c.userId,
      role: 'owner',
    });
    inserted.push({ clientId: c.id, userId: c.userId, company: c.company });
  }

  console.log(`Backfilled ${inserted.length} clients`);
  for (const row of inserted) {
    console.log(`  client ${row.clientId} (${row.company ?? 'no company'}) -> user ${row.userId} role=owner`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
