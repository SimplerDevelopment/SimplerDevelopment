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

  // Sample contacts added by firm-site crawl.
  const newOnes = await db.select().from(crmContacts)
    .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.source, 'firm-site')))
    .limit(5);

  console.log(`Sample firm-crawl contacts: ${newOnes.length}`);
  for (const c of newOnes) {
    console.log(`\n  • ${c.firstName} ${c.lastName ?? ''} (id=${c.id})`);
    console.log(`    email: ${c.email ?? '–'}`);
    console.log(`    phone: ${c.phone ?? '–'}`);
    console.log(`    li:    ${c.linkedinUrl ?? '–'}`);
    console.log(`    notes: ${(c.notes ?? '').slice(0, 200)}`);
  }

  // Sample firm + custom field values for first 3 crawled firms.
  const fields = await db.select().from(crmCustomFields).where(eq(crmCustomFields.clientId, clientId));
  const fieldById = new Map(fields.map(f => [f.id, f]));

  console.log('\n\nSample crawled firms with custom field values:');
  const crawledFieldId = fields.find(f => f.fieldName === 'Website Crawled At' && f.entityType === 'company')!.id;
  const crawledRows = await db.select().from(crmCustomFieldValues)
    .where(eq(crmCustomFieldValues.customFieldId, crawledFieldId))
    .limit(5);

  for (const r of crawledRows) {
    const [firm] = await db.select().from(crmCompanies).where(eq(crmCompanies.id, r.entityId)).limit(1);
    if (!firm) continue;
    console.log(`\n  ─ ${firm.name} (id=${firm.id})`);
    console.log(`    site:     ${firm.website}`);
    console.log(`    linkedin: ${firm.linkedinUrl ?? '–'}`);
    console.log(`    twitter:  ${firm.twitterUrl ?? '–'}`);
    const vals = await db.select().from(crmCustomFieldValues)
      .where(and(eq(crmCustomFieldValues.entityId, firm.id), eq(crmCustomFieldValues.entityType, 'company')));
    for (const v of vals) {
      const f = fieldById.get(v.customFieldId);
      if (!f) continue;
      console.log(`    ${f.fieldName.padEnd(36)}: ${(v.value ?? '').slice(0, 100)}`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
