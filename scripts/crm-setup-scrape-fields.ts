/**
 * Idempotent seed for the two scrape-tracking custom fields on client 100.
 *
 *   - last_scraped_at  (date)  — timestamp of the most recent scrape attempt
 *   - directory_page   (url)   — URL the scraper last extracted contacts from
 *
 * Also backfills `last_scraped_at` for every company that was processed by the
 * 2026-04-22 full scrape. We use the scrape's final insert timestamp as a
 * conservative proxy — the next rescrape will overwrite per-company values.
 *
 * Safe to run repeatedly: inserts use onConflictDoUpdate.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const CLIENT_ID = 100;
const BACKFILL_TS = new Date('2026-04-23T01:44:33Z');

async function run() {
  const { db } = await import('../lib/db');
  const { crmCompanies, crmCustomFields, crmCustomFieldValues } = await import('../lib/db/schema');
  const { and, eq, isNotNull, ne, or } = await import('drizzle-orm');

  async function ensureField(fieldName: string, fieldType: string, category: string): Promise<number> {
    const [existing] = await db
      .select({ id: crmCustomFields.id })
      .from(crmCustomFields)
      .where(and(
        eq(crmCustomFields.clientId, CLIENT_ID),
        eq(crmCustomFields.entityType, 'company'),
        eq(crmCustomFields.fieldName, fieldName),
      ));
    if (existing) {
      console.log(`✓ ${fieldName} already exists (id=${existing.id})`);
      return existing.id;
    }
    const [created] = await db
      .insert(crmCustomFields)
      .values({ clientId: CLIENT_ID, entityType: 'company', fieldName, fieldType, category, filterable: false, required: false })
      .returning({ id: crmCustomFields.id });
    console.log(`+ created ${fieldName} (id=${created.id}, type=${fieldType})`);
    return created.id;
  }

  const lastScrapedId = await ensureField('last_scraped_at', 'date', 'Scraping');
  const directoryPageId = await ensureField('directory_page', 'url', 'Scraping');

  // Backfill last_scraped_at for all client-100 companies that had a website at
  // the time of the full scrape. They were all processed — mark them so we
  // have a baseline before the next rescrape.
  const companies = await db
    .select({ id: crmCompanies.id })
    .from(crmCompanies)
    .where(and(
      eq(crmCompanies.clientId, CLIENT_ID),
      or(
        and(isNotNull(crmCompanies.website), ne(crmCompanies.website, '')),
        and(isNotNull(crmCompanies.domain), ne(crmCompanies.domain, '')),
      ),
    ));
  console.log(`Backfilling last_scraped_at for ${companies.length} companies → ${BACKFILL_TS.toISOString()}`);

  let wrote = 0;
  for (const c of companies) {
    await db
      .insert(crmCustomFieldValues)
      .values({
        customFieldId: lastScrapedId,
        entityId: c.id,
        entityType: 'company',
        value: BACKFILL_TS.toISOString(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [crmCustomFieldValues.customFieldId, crmCustomFieldValues.entityId, crmCustomFieldValues.entityType],
        set: { value: BACKFILL_TS.toISOString(), updatedAt: new Date() },
      });
    wrote++;
    if (wrote % 250 === 0) console.log(`  …${wrote}/${companies.length}`);
  }
  console.log(`Backfilled ${wrote} last_scraped_at values.`);
  console.log(`Custom field ids: last_scraped_at=${lastScrapedId}, directory_page=${directoryPageId}`);
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
