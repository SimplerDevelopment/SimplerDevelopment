import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
import { db } from '@/lib/db';
import { clients, crmContacts, crmCompanies, clientWebsites } from '@/lib/db/schema';
import { eq, and, isNull, or, ilike, sql } from 'drizzle-orm';

// ponytail: set via SITE_SLUG env var or first CLI arg; no client default
const SITE_SLUG = process.env.SITE_SLUG ?? process.argv[2];
if (!SITE_SLUG) {
  console.error('Usage: SITE_SLUG=<slug> tsx scripts/li-enrich-inspect.ts\n  or: tsx scripts/li-enrich-inspect.ts <slug>');
  process.exit(1);
}

async function main() {
  const sites = await db.select().from(clientWebsites).where(
    or(
      ilike(clientWebsites.domain, `%${SITE_SLUG}%`),
      ilike(clientWebsites.subdomain, `%${SITE_SLUG}%`),
      ilike(clientWebsites.name, `%${SITE_SLUG}%`),
    )!
  );

  const clientIds = Array.from(new Set(sites.map(s => s.clientId)));
  console.log(`${SITE_SLUG} site -> clientId mapping:`);
  for (const cid of clientIds) {
    const [c] = await db.select().from(clients).where(eq(clients.id, cid));
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
      .from(crmContacts).where(eq(crmContacts.clientId, cid));
    const [{ missing }] = await db.select({ missing: sql<number>`count(*)::int` })
      .from(crmContacts)
      .where(and(eq(crmContacts.clientId, cid), isNull(crmContacts.linkedinUrl)));
    console.log(`  clientId=${cid} company="${c?.company ?? '?'}" contacts=${total} missing_linkedin=${missing}`);
  }

  // Pick the clientId with the most contacts
  let best = clientIds[0];
  let bestCount = -1;
  for (const cid of clientIds) {
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
      .from(crmContacts).where(eq(crmContacts.clientId, cid));
    if (total > bestCount) { bestCount = total; best = cid; }
  }
  console.log(`\nChosen clientId for ${SITE_SLUG}: ${best} (${bestCount} contacts)`);

  // Sample 10 contacts to eyeball shape
  const sample = await db.select({
    id: crmContacts.id,
    firstName: crmContacts.firstName,
    lastName: crmContacts.lastName,
    email: crmContacts.email,
    title: crmContacts.title,
    companyId: crmContacts.companyId,
  }).from(crmContacts)
    .where(and(eq(crmContacts.clientId, best), isNull(crmContacts.linkedinUrl)))
    .limit(10);

  console.log('\nSample contacts missing linkedin_url:');
  for (const s of sample) {
    let co = '';
    if (s.companyId) {
      const [c] = await db.select({ name: crmCompanies.name }).from(crmCompanies).where(eq(crmCompanies.id, s.companyId));
      co = c?.name ?? '';
    }
    console.log(`  id=${s.id} "${s.firstName} ${s.lastName ?? ''}" email=${s.email ?? '-'} title=${s.title ?? '-'} company="${co}"`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
