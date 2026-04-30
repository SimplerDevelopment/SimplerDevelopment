/**
 * Roll up phone numbers from contacts to their firm row when the firm row
 * is missing a phone. Many AAML-derived firms have no phone but their
 * attorneys all share the firm switchboard number.
 *
 * Strategy:
 *   • For each firm with no phone, look at its contacts' phones.
 *   • If at least 2 contacts share the same formatted phone → use it.
 *   • Else if exactly 1 contact has a phone → use it (lower confidence,
 *     still a useful default).
 *
 * Idempotent.
 *
 *   npx tsx scripts/migrations/crosscap/rollup-firm-contact-info.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmCompanies, crmContacts } = await import('../../../lib/db/schema');
  const { and, eq, isNull, isNotNull } = await import('drizzle-orm');

  const firmsNoPhone = await db.select().from(crmCompanies)
    .where(and(eq(crmCompanies.clientId, clientId), isNull(crmCompanies.phone)));
  console.log(`Firms with no phone: ${firmsNoPhone.length}`);

  let setFromConsensus = 0, setFromSingleton = 0;
  for (const firm of firmsNoPhone) {
    const contacts = await db.select({ phone: crmContacts.phone }).from(crmContacts).where(and(
      eq(crmContacts.clientId, clientId),
      eq(crmContacts.companyId, firm.id),
      isNotNull(crmContacts.phone),
    ));
    if (contacts.length === 0) continue;

    // Tally phones
    const counts = new Map<string, number>();
    for (const c of contacts) {
      if (!c.phone) continue;
      counts.set(c.phone, (counts.get(c.phone) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const [topPhone, topCount] = sorted[0];

    if (topCount >= 2) {
      await db.update(crmCompanies).set({ phone: topPhone, updatedAt: new Date() }).where(eq(crmCompanies.id, firm.id));
      setFromConsensus += 1;
    } else if (sorted.length === 1) {
      // Only one phone in evidence, set with lower confidence
      await db.update(crmCompanies).set({ phone: topPhone, updatedAt: new Date() }).where(eq(crmCompanies.id, firm.id));
      setFromSingleton += 1;
    }
  }

  console.log(`\n=== ROLLUP DONE ===`);
  console.log(`Phones set via consensus (≥2 contacts agree): ${setFromConsensus}`);
  console.log(`Phones set from singleton contact:            ${setFromSingleton}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
