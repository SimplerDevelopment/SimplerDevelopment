/**
 * Vitest globalSetup for the integration-api project. Runs exactly once
 * before any worker spawns, and the returned teardown runs once after every
 * worker has exited.
 *
 * Setup:
 *   1) Sweep orphan `test_e2e_*` databases AND any stale schemas with the
 *      same prefix (cross-version leftovers). Both, because earlier versions
 *      of the test infra used per-worker SCHEMAs in a shared DB; if a user
 *      switches between branches the cleanup needs to cover either flavour.
 *   2) Drop any prior `simplerdev_test_template` so we always start fresh.
 *   3) Build the template DB by replaying every drizzle/*.sql migration once.
 *      Cost is paid here, ONE time per integration-api run, instead of per
 *      test file (which used to cost ~30-60s × 193 files).
 *
 * Teardown:
 *   - Drop any remaining per-worker `test_e2e_*` databases (one per worker
 *     should already be gone via afterAll, but belt+suspenders).
 *   - Drop the template DB so disk usage stays bounded across runs.
 *
 * Safe by construction: pattern only touches DBs this test infra owns
 * (`test_e2e_*` and `simplerdev_test_template`), never any app DB.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { ADMIN_URL, TEMPLATE_DB } from './test-bootstrap';
import { buildTemplateDatabase } from './test-db';

const TEST_DB_PATTERN = 'test_e2e_%';

async function sweepOrphans(sql: ReturnType<typeof postgres>): Promise<{ dbs: number; schemas: number }> {
  const dbRows = await sql<{ datname: string }[]>`
    SELECT datname FROM pg_database
    WHERE datname LIKE ${TEST_DB_PATTERN}
       OR datname = ${TEMPLATE_DB}
  `;
  for (const { datname } of dbRows) {
    // Identifier match is exact-prefix; safe to interpolate.
    if (!/^test_e2e_[A-Za-z0-9_]+$/.test(datname) && datname !== TEMPLATE_DB) continue;
    await sql.unsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
  }

  // Cross-version: a previous infra revision created per-worker SCHEMAs
  // inside one shared DB. Sweep those too so disk stays bounded.
  const schemaRows = await sql<{ nspname: string }[]>`
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'test_e2e_%'
  `;
  for (const { nspname } of schemaRows) {
    if (!/^test_e2e_[A-Za-z0-9_]+$/.test(nspname)) continue;
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`);
  }

  return { dbs: dbRows.length, schemas: schemaRows.length };
}

export default async function globalSetup() {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {}, connect_timeout: 30 });
  try {
    const { dbs, schemas } = await sweepOrphans(admin);
    if (dbs + schemas > 0) {
      // eslint-disable-next-line no-console
      console.log(`[integration-api:globalSetup] swept ${dbs} orphan test DBs and ${schemas} orphan schemas`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }

  // Build the template — this is the one and only migration-replay cost for
  // the entire integration-api run.
  await buildTemplateDatabase();

  return async function globalTeardown() {
    const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {}, connect_timeout: 30 });
    try {
      const { dbs, schemas } = await sweepOrphans(admin);
      if (dbs + schemas > 0) {
        // eslint-disable-next-line no-console
        console.log(`[integration-api:globalTeardown] swept ${dbs} test DBs and ${schemas} schemas on shutdown`);
      }
    } finally {
      await admin.end({ timeout: 5 });
    }
  };
}
