/**
 * Migration: promote the postcaptain "Latitude" / "Longitude" custom fields
 * to first-class columns on `crm_companies`.
 *
 *   1. ALTER TABLE crm_companies ADD COLUMN latitude / longitude (NUMERIC).
 *   2. Backfill from crm_custom_field_values for the postcaptain client.
 *   3. DELETE the two custom fields (cascade-removes their values).
 *
 * Idempotent — safe to re-run; the ALTER uses IF NOT EXISTS, the backfill is
 * a single UPDATE, and the field deletion is a no-op when the fields are gone.
 *
 * Usage:
 *   npx tsx scripts/migrations/postcaptain/migrate-geo-to-columns.ts [--email …] [--client-id N] [--dry-run]
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const args = process.argv.slice(2);
function argVal(name: string, def?: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return def;
  return args[idx + 1];
}
const DRY = args.includes('--dry-run');
const EMAIL = argVal('--email', 'postcaptain@simplerdevelopment.com')!;
const CLIENT_ID_ARG = argVal('--client-id');

(async () => {
  const { db } = await import('../../../lib/db');
  const { users, clients, crmCompanies, crmCustomFields } = await import('../../../lib/db/schema');
  const { sql, eq, and, inArray } = await import('drizzle-orm');

  // 1. Add columns + index
  console.log('Step 1: ALTER TABLE crm_companies …');
  if (!DRY) {
    await db.execute(sql`ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7)`);
    await db.execute(sql`ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_crm_companies_lat_lng ON crm_companies(latitude, longitude)`);
    console.log('  columns + index ready.');
  } else {
    console.log('  [dry-run] would ADD COLUMN latitude/longitude + index.');
  }

  // 2. Resolve client
  let clientId: number;
  if (CLIENT_ID_ARG) {
    clientId = parseInt(CLIENT_ID_ARG, 10);
  } else {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
    if (!u) { console.error(`No user with email ${EMAIL}`); process.exit(1); }
    const [c] = await db.select({ id: clients.id, company: clients.company }).from(clients).where(eq(clients.userId, u.id)).limit(1);
    if (!c) { console.error(`User ${u.id} has no client`); process.exit(1); }
    clientId = c.id;
    console.log(`Resolved ${EMAIL} → client ${clientId} ("${c.company ?? '—'}")`);
  }

  // 3. Find Latitude / Longitude field IDs
  const latFields = await db
    .select({ id: crmCustomFields.id, fieldName: crmCustomFields.fieldName })
    .from(crmCustomFields)
    .where(
      and(
        eq(crmCustomFields.clientId, clientId),
        eq(crmCustomFields.entityType, 'company'),
        inArray(crmCustomFields.fieldName, ['Latitude', 'Longitude']),
      ),
    );
  const latId = latFields.find((f) => f.fieldName === 'Latitude')?.id;
  const lngId = latFields.find((f) => f.fieldName === 'Longitude')?.id;
  console.log(`Step 2: Found custom fields — latitude=${latId ?? '—'}  longitude=${lngId ?? '—'}`);

  if (!latId && !lngId) {
    console.log('  Nothing to backfill.');
    process.exit(0);
  }

  // 4. Backfill — single UPDATE per coordinate using a correlated subquery.
  // Cast text → numeric; rows whose value isn't a clean number become NULL.
  for (const [colName, fieldId] of [
    ['latitude', latId],
    ['longitude', lngId],
  ] as const) {
    if (!fieldId) continue;
    if (DRY) {
      const [row] = await db.execute(
        sql`SELECT COUNT(*)::int AS n FROM crm_custom_field_values WHERE custom_field_id = ${fieldId} AND entity_type = 'company' AND value ~ '^-?[0-9]+(\\.[0-9]+)?$'`,
      ) as unknown as Array<{ n: number }>;
      const n = Array.isArray(row) ? row[0]?.n : (row as any)?.rows?.[0]?.n ?? 0;
      console.log(`  [dry-run] would backfill ${colName} for ~${n} companies (field id=${fieldId}).`);
      continue;
    }
    const result = await db.execute(sql`
      UPDATE crm_companies AS c
      SET ${sql.identifier(colName)} = NULLIF(cfv.value, '')::numeric
      FROM crm_custom_field_values cfv
      WHERE cfv.custom_field_id = ${fieldId}
        AND cfv.entity_type = 'company'
        AND cfv.entity_id = c.id
        AND c.client_id = ${clientId}
        AND cfv.value ~ '^-?[0-9]+(\.[0-9]+)?$'
    `);
    // pg result row count varies by driver; just log success
    console.log(`  Backfilled ${colName} from custom field id=${fieldId}.`);
  }

  // 5. Delete the two custom fields (values cascade)
  const fieldIds = [latId, lngId].filter((x): x is number => typeof x === 'number');
  if (DRY) {
    console.log(`Step 3: [dry-run] would delete ${fieldIds.length} custom field row(s) (cascade-removes values).`);
    process.exit(0);
  }
  const removed = await db
    .delete(crmCustomFields)
    .where(inArray(crmCustomFields.id, fieldIds))
    .returning({ id: crmCustomFields.id, fieldName: crmCustomFields.fieldName });
  for (const r of removed) console.log(`Step 3: Deleted custom field id=${r.id} ("${r.fieldName}").`);

  // 6. Sanity check
  const [{ withGeo, total }] = (await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::int AS "withGeo",
           COUNT(*)::int AS total
    FROM crm_companies
    WHERE client_id = ${clientId}
  `)) as unknown as Array<{ withGeo: number; total: number }>;
  console.log(`\nDone. ${withGeo}/${total} companies have lat+lng populated for client ${clientId}.`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
