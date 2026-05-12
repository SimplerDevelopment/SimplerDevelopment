/**
 * Vitest globalSetup for the integration-api project.
 *
 * `setup` (default export, runs once before any worker spawns) drops any
 * orphan `test_e2e_*` schemas left from a prior crashed run.
 *
 * The function returned from setup is the global teardown — vitest invokes
 * it after every worker has exited. It drops every `test_e2e_*` schema
 * this run created. Required because:
 *   - setupFiles' afterAll fires per-FILE, not per-worker. Dropping there
 *     forced every one of 193 files to re-replay 107 migrations.
 *   - Without a teardown, schemas accumulate across runs and fill the
 *     staging Postgres disk quota (the test DB took the box offline once
 *     this way already).
 *
 * Safe by construction: the match pattern only touches schemas this test
 * infra owns (`test_e2e_*`), never `public` or any app schema.
 */
import 'dotenv/config';
import postgres from 'postgres';

async function dropOrphanTestSchemas(label: string): Promise<void> {
  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (!url) return; // setup-api will surface the real error if this matters.

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ nspname: string }[]>`
      SELECT nspname FROM pg_namespace
      WHERE nspname LIKE 'test_e2e_%'
    `;
    if (rows.length === 0) return;

    for (const { nspname } of rows) {
      // Identifier validated by the regex — safe to interpolate.
      if (!/^test_e2e_[A-Za-z0-9_]+$/.test(nspname)) continue;
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`);
    }
    // eslint-disable-next-line no-console
    console.log(`[integration-api:${label}] dropped ${rows.length} test_e2e_* schemas`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export default async function globalSetup() {
  await dropOrphanTestSchemas('globalSetup');
  // Return value is the teardown function — vitest calls it after all
  // workers exit. Keeps staging Postgres from accumulating schemas across
  // runs and exhausting its disk quota.
  return async () => {
    await dropOrphanTestSchemas('globalTeardown');
  };
}
