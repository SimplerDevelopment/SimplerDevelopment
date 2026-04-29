import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmContacts, crmCompanies } = await import('../../../lib/db/schema');
  const { eq, and, isNotNull, sql, count } = await import('drizzle-orm');

  const [{ n: total }]  = await db.select({ n: count() }).from(crmContacts).where(eq(crmContacts.clientId, clientId));
  const [{ n: firms }]  = await db.select({ n: count() }).from(crmCompanies).where(eq(crmCompanies.clientId, clientId));
  const [{ n: emails }] = await db.select({ n: count() }).from(crmContacts)
    .where(and(eq(crmContacts.clientId, clientId), isNotNull(crmContacts.email)));
  const [{ n: phones }] = await db.select({ n: count() }).from(crmContacts)
    .where(and(eq(crmContacts.clientId, clientId), isNotNull(crmContacts.phone)));
  const bySource = await db
    .select({ source: crmContacts.source, n: count() })
    .from(crmContacts)
    .where(eq(crmContacts.clientId, clientId))
    .groupBy(crmContacts.source);
  void sql;

  console.log(`Cross Cap Advisors CRM (clientId=${clientId})`);
  console.log(`  firms     : ${firms}`);
  console.log(`  contacts  : ${total}`);
  console.log(`  with email: ${emails}  (${total ? Math.round(emails*100/total) : 0}%)`);
  console.log(`  with phone: ${phones}  (${total ? Math.round(phones*100/total) : 0}%)`);

  console.log('\nBy source:');
  for (const r of bySource) console.log(`  ${r.source ?? '(null)'}: ${r.n}`);

  // 3 enriched samples
  const enriched = await db.select().from(crmContacts).where(and(
    eq(crmContacts.clientId, clientId),
    isNotNull(crmContacts.email),
    isNotNull(crmContacts.phone),
  )).limit(3);
  console.log('\nSample enriched contacts:');
  for (const c of enriched) {
    console.log(`  • ${c.firstName} ${c.lastName ?? ''} — ${c.email} — ${c.phone}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
