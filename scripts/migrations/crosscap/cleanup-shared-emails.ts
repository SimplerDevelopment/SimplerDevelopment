/**
 * Clear firm-wide / shared mailbox emails from individual contact rows.
 *
 * Scrapers sometimes pick up `info@firm.com` or `office@firm.com` from a
 * profile page's footer rather than the attorney's personal email. These
 * are useless for personal outreach and create false-positive duplicates.
 *
 * Policy:
 *   1. Any email starting with one of the generic local-parts
 *      (info, admin, hello, contact, office, firm, legal, mail, attorneys,
 *      reception, intake) → null out on the contact.
 *   2. Any email that is shared by ≥3 contacts in the same client → null
 *      out on the dups (kept on no-one — likely a shared mailbox).
 *
 * Idempotent.
 *
 *   npx tsx scripts/migrations/crosscap/cleanup-shared-emails.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const GENERIC_LOCALS = new Set([
  'info','admin','hello','contact','office','firm','legal','mail','reception',
  'intake','support','reach','sales','marketing','attorney','attorneys','lawyer','lawyers',
  'team','frontdesk','front-desk','enquiries','inquiries','noreply','no-reply',
  'webmaster','newclient','newclients','newinquiry',
]);

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmContacts } = await import('../../../lib/db/schema');
  const { and, eq, sql, isNotNull, inArray } = await import('drizzle-orm');

  // Pass 1: generic local-parts
  const all = await db.select({ id: crmContacts.id, email: crmContacts.email }).from(crmContacts)
    .where(and(eq(crmContacts.clientId, clientId), isNotNull(crmContacts.email)));

  const genericIds: number[] = [];
  for (const c of all) {
    if (!c.email) continue;
    const local = c.email.split('@')[0]?.toLowerCase().replace(/[._-].*$/, '');
    if (local && GENERIC_LOCALS.has(local)) genericIds.push(c.id);
  }
  if (genericIds.length > 0) {
    await db.update(crmContacts).set({ email: null, updatedAt: new Date() })
      .where(and(eq(crmContacts.clientId, clientId), inArray(crmContacts.id, genericIds)));
  }
  console.log(`Pass 1 — generic local-parts cleared: ${genericIds.length}`);

  // Pass 2: emails shared by ≥3 contacts
  const dupRows = await db.select({ email: crmContacts.email, c: sql<number>`count(*)::int` })
    .from(crmContacts)
    .where(and(eq(crmContacts.clientId, clientId), isNotNull(crmContacts.email)))
    .groupBy(crmContacts.email)
    .having(sql`count(*) >= 3`);
  const dupEmails = dupRows.map(r => r.email).filter((e): e is string => !!e);

  let dupCleared = 0;
  if (dupEmails.length > 0) {
    const r = await db.update(crmContacts).set({ email: null, updatedAt: new Date() })
      .where(and(eq(crmContacts.clientId, clientId), inArray(crmContacts.email, dupEmails)))
      .returning({ id: crmContacts.id });
    dupCleared = r.length;
  }
  console.log(`Pass 2 — emails shared by ≥3 contacts cleared: ${dupCleared} contacts (across ${dupEmails.length} emails)`);

  // Pass 3: emails shared by exactly 2 — leave alone if both are at same firm (could be plausible) but clear if at different firms
  const dup2Rows = await db.select({ email: crmContacts.email, c: sql<number>`count(*)::int` })
    .from(crmContacts)
    .where(and(eq(crmContacts.clientId, clientId), isNotNull(crmContacts.email)))
    .groupBy(crmContacts.email)
    .having(sql`count(*) = 2`);
  const dup2Emails = dup2Rows.map(r => r.email).filter((e): e is string => !!e);
  let dup2Cleared = 0;
  for (const email of dup2Emails) {
    const rows = await db.select({ id: crmContacts.id, companyId: crmContacts.companyId }).from(crmContacts)
      .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.email, email)));
    if (rows.length !== 2) continue;
    const sameFirm = rows[0].companyId !== null && rows[0].companyId === rows[1].companyId;
    if (!sameFirm) {
      // different firms → almost certainly a shared mailbox lookup error
      await db.update(crmContacts).set({ email: null, updatedAt: new Date() })
        .where(inArray(crmContacts.id, rows.map(r => r.id)));
      dup2Cleared += rows.length;
    } else {
      // same firm → keep one (lower id), null the other
      const [keep, drop] = rows.sort((a, b) => a.id - b.id);
      await db.update(crmContacts).set({ email: null, updatedAt: new Date() })
        .where(eq(crmContacts.id, drop.id));
      dup2Cleared += 1;
      void keep;
    }
  }
  console.log(`Pass 3 — duplicates of size 2 resolved: ${dup2Cleared} contacts`);

  console.log('\n=== EMAIL CLEANUP DONE ===');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
