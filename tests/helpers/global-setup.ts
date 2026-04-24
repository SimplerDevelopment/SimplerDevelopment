/**
 * Vitest globalSetup for the integration-api project. Runs exactly once before
 * any worker spawns.
 *
 * Purpose: drop any `test_e2e_*` schemas left over from a previous run —
 * typically a worker that was SIGKILLed before its afterAll could tear down.
 * Unbounded accumulation of stale schemas took staging Postgres offline once
 * already (PANIC on full disk); this closes the loop.
 *
 * Safe by construction: the match pattern only touches schemas this test
 * infra owns (`test_e2e_*`), never public or any app schema.
 */
import 'dotenv/config';
import postgres from 'postgres';

export default async function globalSetup() {
  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (!url) return; // nothing to do; setup-api will surface the real error.

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
    console.log(`[integration-api:globalSetup] dropped ${rows.length} orphan test_e2e_* schemas`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
