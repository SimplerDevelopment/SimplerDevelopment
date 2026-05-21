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

// Host-based prod check — matches scripts/verify-db-target.ts so it can't
// false-positive on local DBs whose names happen to contain "prod"
// (e.g. simplerdev_realprod_dryrun on 127.0.0.1).
const PROD_HOSTS = ['tramway.proxy.rlwy.net', 'metro.proxy.rlwy.net'];
if (PROD_HOSTS.some(h => URL_STR.includes(h)) || process.env.RAILWAY_ENVIRONMENT_NAME === 'production') {
  console.error('Refusing to run: DATABASE_URL points at production');
  process.exit(1);
}

// Connect to the `postgres` admin DB so DROP DATABASE can target the
// per-worker DBs we want to remove.
const adminUrl = new URL(URL_STR);
adminUrl.pathname = '/postgres';
adminUrl.searchParams.delete('options');

// Match both the new worktree-prefixed names (`test_e2e_<sha8>_w<id>`,
// `simplerdev_test_template_<sha8>`) AND legacy un-prefixed names
// (`test_e2e_w1`, `simplerdev_test_template`) so a stale install gets
// fully cleaned. Manual cleanup utility — sweeps across ALL worktrees by
// design; skip-if-active prevents stepping on an in-flight test run.
async function run() {
  const sql = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    // 1) DROP each test_e2e_* DB and any template DB.
    const dbRows = await sql<{ datname: string }[]>`
      SELECT datname FROM pg_database
      WHERE datname LIKE 'test_e2e_%' OR datname LIKE 'simplerdev_test_template%'
      ORDER BY datname
    `;
    if (dbRows.length === 0) {
      console.log('No test_e2e_% or simplerdev_test_template% databases found.');
    } else {
      console.log(`Found ${dbRows.length} database(s):`);
      for (const r of dbRows) {
        const active = await sql<{ pid: number }[]>`
          SELECT pid FROM pg_stat_activity
          WHERE datname = ${r.datname} AND pid <> pg_backend_pid()
          LIMIT 1
        `;
        if (active.length > 0) {
          console.log(`  ${r.datname} ... SKIP (in use by another process)`);
          continue;
        }
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
