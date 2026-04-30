/**
 * Find firms that need a deep team-page crawl and reset their crawl
 * markers so the main crawler picks them up next time it runs.
 *
 * Targets:
 *   • firms with Website Crawl Status = "Success" but no firm-site-source
 *     contact attached (i.e., we got the homepage but never harvested attorneys)
 *   • firms newly-recovered by retry-fetch-failed (Status=Success but no
 *     Practice Areas (Crawled) — implies retry path which only ran the signal
 *     extractor)
 *
 * The script clears the "Website Crawled At" custom-field value for those
 * firms so the next main-crawler invocation will revisit them with the full
 * team-page + profile-page pipeline.
 *
 *   npx tsx scripts/migrations/crosscap/deep-crawl-recovered.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmCompanies, crmContacts, crmCustomFields, crmCustomFieldValues } = await import('../../../lib/db/schema');
  const { and, eq, isNotNull, inArray } = await import('drizzle-orm');

  const fields = await db.select().from(crmCustomFields).where(eq(crmCustomFields.clientId, clientId));
  const statusFid   = fields.find(f => f.entityType === 'company' && f.fieldName === 'Website Crawl Status')!.id;
  const crawledFid  = fields.find(f => f.entityType === 'company' && f.fieldName === 'Website Crawled At')!.id;
  const practiceFid = fields.find(f => f.entityType === 'company' && f.fieldName === 'Practice Areas (Crawled)')?.id;

  // 1) Successful firms
  const successRows = await db.select({ entityId: crmCustomFieldValues.entityId }).from(crmCustomFieldValues)
    .where(and(
      eq(crmCustomFieldValues.customFieldId, statusFid),
      eq(crmCustomFieldValues.entityType, 'company'),
      eq(crmCustomFieldValues.value, 'Success'),
    ));
  const successSet = new Set(successRows.map(r => r.entityId));

  // 2) Firms that have at least one firm-site-source contact (deep-crawl already done)
  const harvestedRows = await db.select({ companyId: crmContacts.companyId }).from(crmContacts)
    .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.source, 'firm-site'), isNotNull(crmContacts.companyId)));
  const harvestedSet = new Set(harvestedRows.map(r => r.companyId).filter((x): x is number => !!x));

  // 3) Firms that have Practice Areas (Crawled) — main crawler ran end-to-end
  let practiceSet = new Set<number>();
  if (practiceFid) {
    const rows = await db.select({ entityId: crmCustomFieldValues.entityId }).from(crmCustomFieldValues)
      .where(and(eq(crmCustomFieldValues.customFieldId, practiceFid), eq(crmCustomFieldValues.entityType, 'company')));
    practiceSet = new Set(rows.map(r => r.entityId));
  }

  // Targets: success AND (no firm-site contact OR no practice areas)
  // No firm-site contact alone is the strongest signal; couple with no practice areas to capture both buckets.
  const targets = Array.from(successSet).filter(id =>
    !harvestedSet.has(id) || !practiceSet.has(id)
  );
  console.log(`Success firms:              ${successSet.size}`);
  console.log(`  with firm-site contact:   ${Array.from(successSet).filter(id => harvestedSet.has(id)).length}`);
  console.log(`  with practice areas text: ${Array.from(successSet).filter(id => practiceSet.has(id)).length}`);
  console.log(`Targets for deep re-crawl:  ${targets.length}`);

  if (targets.length === 0) {
    console.log('Nothing to reset — exit.');
    process.exit(0);
  }

  // Clear Website Crawled At for targets in batches so the main crawler picks them up
  const BATCH = 200;
  let cleared = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const r = await db.delete(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, crawledFid),
      eq(crmCustomFieldValues.entityType, 'company'),
      inArray(crmCustomFieldValues.entityId, slice),
    ));
    cleared += slice.length;
    console.log(`  cleared Crawled At for ${cleared}/${targets.length}`);
    void r;
  }

  console.log('\n=== DONE — main crawler will re-process these on next run ===');
  console.log('Next: SHARD=0/4 CRAWL_CONCURRENCY=3 npx tsx scripts/migrations/crosscap/crawl-firm-websites.ts (and shards 1-3 in parallel)');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
