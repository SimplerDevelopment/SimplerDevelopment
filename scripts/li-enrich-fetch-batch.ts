/**
 * Fetch a batch of CRM contacts that still have NULL linkedin_url.
 * Usage: npx tsx --env-file=.env scripts/li-enrich-fetch-batch.ts <limit> <offset> > .planning/li-enrich/batch.json
 */
import { db } from '@/lib/db';
import { crmContacts, crmCompanies } from '@/lib/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';

const CLIENT_ID = 100;

async function main() {
  const limit = Number(process.argv[2] ?? 50);
  const offset = Number(process.argv[3] ?? 0);

  const rows = await db
    .select({
      id: crmContacts.id,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      email: crmContacts.email,
      title: crmContacts.title,
      companyName: crmCompanies.name,
    })
    .from(crmContacts)
    .leftJoin(crmCompanies, eq(crmContacts.companyId, crmCompanies.id))
    .where(and(eq(crmContacts.clientId, CLIENT_ID), isNull(crmContacts.linkedinUrl)))
    .orderBy(crmContacts.id)
    .limit(limit)
    .offset(offset);

  process.stdout.write(JSON.stringify(rows, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
