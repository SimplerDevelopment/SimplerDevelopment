/**
 * Add info@danielpcoyle.com (user id 181 — Dan Coyle) to the cardiff client
 * portal as an admin.
 *
 * The cardiff site is `clientWebsites.subdomain='cardiff-main'`, which is owned
 * by `clientId=146` (company "cardiff"). Dan already has admin membership on
 * 6 other clients but not on Cardiff yet.
 *
 * Idempotent: looks for an existing row first.
 */
import { db } from '../../../lib/db';
import { users } from '../../../lib/db/schema/auth';
import { clientMembers, clientWebsites } from '../../../lib/db/schema/sites';
import { eq, and } from 'drizzle-orm';

const EMAIL = 'info@danielpcoyle.com';
const ROLE = 'admin';
const CARDIFF_SUBDOMAIN = 'cardiff-main';

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.subdomain, CARDIFF_SUBDOMAIN)).limit(1);
  if (!site) throw new Error(`Site with subdomain '${CARDIFF_SUBDOMAIN}' not found`);
  const cardiffClientId = site.clientId;
  if (!cardiffClientId) throw new Error(`Site '${CARDIFF_SUBDOMAIN}' has no clientId`);
  console.log(`Cardiff websiteId=${site.id} → clientId=${cardiffClientId} (${site.name})`);

  const [u] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
  if (!u) throw new Error(`User ${EMAIL} not found in users table`);
  console.log(`User: ${u.name} (id ${u.id}, role ${u.role})`);

  const [existing] = await db
    .select()
    .from(clientMembers)
    .where(and(eq(clientMembers.userId, u.id), eq(clientMembers.clientId, cardiffClientId)))
    .limit(1);

  if (existing) {
    console.log(`Already a member: id=${existing.id}, role=${existing.role} — no change.`);
    process.exit(0);
  }

  const [row] = await db
    .insert(clientMembers)
    .values({ userId: u.id, clientId: cardiffClientId, role: ROLE })
    .returning();
  console.log(`Added clientMembers row id=${row.id} (userId=${u.id}, clientId=${cardiffClientId}, role=${row.role})`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
