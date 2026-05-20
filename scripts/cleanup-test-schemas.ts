/**
 * Drops every `test_e2e_*` test artifact from the connected Postgres:
 *   - per-worker DATABASES named `test_e2e_*`
 *   - `simplerdev_test_template` (rebuilt automatically on next test run)
 *   - legacy per-worker SCHEMAS named `test_e2e_*` (from the pre-template
 *     infra revision; harmless if absent)
 *
 * Safe to run at any time — refuses on URLs that look like production.
 *
 * Use this when integration-api tests accumulated garbage (e.g. workers from
 * previous runs whose DBs weren't cleanly dropped) and disk is full.
 */
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const URL_STR = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!URL_STR) throw new Error('DATABASE_URL_TEST or DATABASE_URL is not set');

const PROD_MARKERS = [/prod/i, /production/i, /main-db/i];
if (PROD_MARKERS.some(re => re.test(URL_STR))) {
  console.error('Refusing to run: DATABASE_URL looks like production');
  process.exit(1);
}

// Connect to the `postgres` admin DB so DROP DATABASE can target the
// per-worker DBs we want to remove.
const adminUrl = new URL(URL_STR);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('options');

const TEMPLATE_DB = 'simplerdev_test_template';

async function run() {
  const sql = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    // 1) DROP each test_e2e_* DB (Postgres 13+ WITH (FORCE) evicts any
    //    lingering connections).
    const dbRows = await sql<{ datname: string }[]>`
      SELECT datname FROM pg_database
      WHERE datname LIKE 'test_e2e_%' OR datname = ${TEMPLATE_DB}
      ORDER BY datname
    `;
    if (dbRows.length === 0) {
      console.log('No test_e2e_% or template databases found.');
    } else {
      console.log(`Dropping ${dbRows.length} database(s):`);
      for (const r of dbRows) {
        process.stdout.write(`  ${r.datname} ... `);
        await sql.unsafe(`DROP DATABASE IF EXISTS "${r.datname}" WITH (FORCE)`);
        console.log('ok');
      }
    }

    // 2) Legacy: per-worker SCHEMAs inside the original DB (pre-template
    //    revision). Still worth sweeping in case someone switches branches.
    const schemaRows = await sql<{ nspname: string }[]>`
      SELECT nspname FROM pg_namespace
      WHERE nspname LIKE 'test_e2e_%'
      ORDER BY nspname
    `;
    if (schemaRows.length > 0) {
      console.log(`Dropping ${schemaRows.length} legacy schema(s):`);
      for (const r of schemaRows) {
        process.stdout.write(`  ${r.nspname} ... `);
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${r.nspname}" CASCADE`);
        console.log('ok');
      }
    }
    console.log('Done.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

run().catch(err => { console.error(err); process.exit(1); });
