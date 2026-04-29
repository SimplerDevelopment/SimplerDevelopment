import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmContacts, crmCompanies, crmCustomFields, crmCustomFieldValues } =
    await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const fields = await db.select().from(crmCustomFields).where(eq(crmCustomFields.clientId, clientId));
  const statusFieldId = fields.find(f => f.fieldName === 'Website Crawl Status' && f.entityType === 'company')!.id;
  const fieldById = new Map(fields.map(f => [f.id, f]));

  // Find firms with status = "Success" — pick the most data-rich (firm with most new contacts).
  const successRows = await db.select().from(crmCustomFieldValues)
    .where(and(eq(crmCustomFieldValues.customFieldId, statusFieldId), eq(crmCustomFieldValues.value, 'Success')));

  console.log(`Firms with successful crawl so far: ${successRows.length}\n`);

  // Pick top 3 by # of contacts
  const ranked: Array<{ firm: any; nContacts: number }> = [];
  for (const r of successRows) {
    const [firm] = await db.select().from(crmCompanies).where(eq(crmCompanies.id, r.entityId)).limit(1);
    if (!firm) continue;
    const contacts = await db.select().from(crmContacts).where(and(
      eq(crmContacts.clientId, clientId),
      eq(crmContacts.companyId, firm.id),
    ));
    ranked.push({ firm, nContacts: contacts.length });
  }
  ranked.sort((a, b) => b.nContacts - a.nContacts);

  for (const { firm, nContacts } of ranked.slice(0, 3)) {
    console.log('═'.repeat(78));
    console.log(`${firm.name}  (firm id=${firm.id}, ${nContacts} contacts in CRM)`);
    console.log('─'.repeat(78));
    console.log(`  Website : ${firm.website}`);
    console.log(`  LinkedIn: ${firm.linkedinUrl ?? '–'}`);
    console.log(`  Twitter : ${firm.twitterUrl ?? '–'}`);
    console.log(`  Facebook: ${firm.facebookUrl ?? '–'}`);

    const vals = await db.select().from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.entityId, firm.id),
      eq(crmCustomFieldValues.entityType, 'company'),
    ));
    console.log(`  Custom fields:`);
    for (const v of vals) {
      const f = fieldById.get(v.customFieldId);
      if (!f) continue;
      console.log(`    ${f.fieldName.padEnd(38)}: ${(v.value ?? '').slice(0, 110)}`);
    }

    // Show contacts
    const contacts = await db.select().from(crmContacts).where(and(
      eq(crmContacts.clientId, clientId),
      eq(crmContacts.companyId, firm.id),
    ));
    console.log(`  Contacts (${contacts.length}):`);
    for (const c of contacts) {
      const li = c.linkedinUrl ? ' · LI:' + c.linkedinUrl.replace('https://www.linkedin.com', '') : '';
      console.log(`    • ${(c.firstName + ' ' + (c.lastName ?? '')).padEnd(28)} ${(c.email ?? '–').padEnd(34)} ${c.phone ?? '–'} [${c.source}]${li}`);
    }
    console.log();
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
