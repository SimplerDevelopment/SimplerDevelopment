import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Make the SimplerDevelopment client (id 104) reachable as a tenant subdomain
 * so its published pitch decks resolve at
 *   https://simplerdevelopment.simplerdevelopment.com/slides/<slug>
 *
 * Without an active clientWebsites row, getClientWebsiteByDomain() returns
 * null and the public deck route 404s.
 *
 * Idempotent: re-running updates the existing row rather than duplicating.
 */

const CLIENT_ID = 104;
const SUBDOMAIN = 'simplerdevelopment';
const SITE_NAME = 'SimplerDevelopment';
const DOMAIN = 'simplerdevelopment.com';

async function main() {
  const { db } = await import('../../../lib/db');
  const { clientWebsites } = await import('../../../lib/db/schema/sites');
  const { eq, and } = await import('drizzle-orm');

  const existing = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, CLIENT_ID), eq(clientWebsites.subdomain, SUBDOMAIN)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(clientWebsites)
      .set({
        name: SITE_NAME,
        active: true,
        domain: DOMAIN,
        publicAccess: true,
        updatedAt: new Date(),
      })
      .where(eq(clientWebsites.id, existing[0].id));
    console.log(`Updated clientWebsites row ${existing[0].id} for SimplerDevelopment.`);
  } else {
    const [row] = await db
      .insert(clientWebsites)
      .values({
        clientId: CLIENT_ID,
        name: SITE_NAME,
        subdomain: SUBDOMAIN,
        domain: DOMAIN,
        active: true,
        publicAccess: true,
        deploymentStatus: 'active',
      })
      .returning();
    console.log(`Created clientWebsites row ${row.id} for SimplerDevelopment.`);
  }

  console.log(`\nPublic deck URL should now resolve:`);
  console.log(`  https://${SUBDOMAIN}.simplerdevelopment.com/slides/crosscap-platform-pitch`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
