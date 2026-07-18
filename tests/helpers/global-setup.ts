/**
 * Vitest globalSetup for the integration-api project. Runs exactly once
 * before any worker spawns, and the returned teardown runs once after every
 * worker has exited.
 *
 * Setup:
 *   1) Sweep orphan DBs from THIS WORKTREE only — `test_e2e_<worktreeId>_*`
 *      databases plus the matching `simplerdev_test_template_<worktreeId>`,
 *      and any legacy per-worker SCHEMAs from the pre-template infra
 *      revision. Worktree-scoped so a sibling worktree (e.g. another claude
 *      session in a different feature branch) running its own integration
 *      suite at the same time doesn't get its in-use DBs evicted.
 *   2) Skip any DB that currently has an active connection — belt + suspenders
 *      against races where two workers within the same worktree somehow share
 *      the same worktreeId.
 *   3) Build the template DB by replaying every drizzle/*.sql migration once.
 *      Cost is paid here, ONE time per integration-api run, instead of per
 *      test file (which used to cost ~30-60s × 193 files).
 *
 * Teardown:
 *   - Drop any remaining per-worker DBs (one per worker should already be
 *     gone via afterAll, but belt+suspenders).
 *   - Drop the template DB so disk usage stays bounded across runs.
 *
 * Safe by construction: only touches DBs this worktree owns; never an
 * app DB or another worktree's in-flight tests.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { ADMIN_URL, TEMPLATE_DB, WORKTREE_ID } from './test-bootstrap';
import { buildTemplateDatabase } from './test-db';

// Only sweep DBs that belong to THIS worktree. A second worktree of the
// same repo (e.g. another claude session) running its own integration
// suite at the same time owns DBs with a different WORKTREE_ID prefix —
// dropping those WITH (FORCE) would evict their live connections mid-test
// and produce flaky 60s hangs.
const OWN_DB_PATTERN = `test_e2e_${WORKTREE_ID}_%`;
const OWN_DB_REGEX = new RegExp(`^test_e2e_${WORKTREE_ID}_[A-Za-z0-9_]+$`);

async function sweepOrphans(sql: ReturnType<typeof postgres>): Promise<{ dbs: number; schemas: number; skipped: number }> {
  const dbRows = await sql<{ datname: string }[]>`
    SELECT datname FROM pg_database
    WHERE datname LIKE ${OWN_DB_PATTERN}
       OR datname = ${TEMPLATE_DB}
  `;
  let skipped = 0;
  for (const { datname } of dbRows) {
    // Identifier match is exact-prefix; safe to interpolate.
    if (!OWN_DB_REGEX.test(datname) && datname !== TEMPLATE_DB) continue;

    // Belt + suspenders: don't drop a DB another vitest worker (or another
    // session that happens to share this worktree's hash, e.g. via a
    // symlink) is actively connected to. WITH (FORCE) would otherwise
    // kick them out and break their in-flight tests.
    const active = await sql<{ pid: number }[]>`
      SELECT pid FROM pg_stat_activity
      WHERE datname = ${datname} AND pid <> pg_backend_pid()
      LIMIT 1
    `;
    if (active.length > 0) {
      skipped++;
      continue;
    }

    await sql.unsafe(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`);
  }

  // Cross-version: a previous infra revision created per-worker SCHEMAs
  // inside one shared DB. Sweep those too so disk stays bounded — same
  // worktree-prefix scoping as above so a sibling worktree's in-use
  // schemas don't get clobbered.
  const schemaRows = await sql<{ nspname: string }[]>`
    SELECT nspname FROM pg_namespace WHERE nspname LIKE ${OWN_DB_PATTERN}
  `;
  for (const { nspname } of schemaRows) {
    if (!OWN_DB_REGEX.test(nspname)) continue;
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`);
  }

  return { dbs: dbRows.length - skipped, schemas: schemaRows.length, skipped };
}

export default async function globalSetup() {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {}, connect_timeout: 30 });
  try {
    const { dbs, schemas, skipped } = await sweepOrphans(admin);
    if (dbs + schemas + skipped > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[integration-api:globalSetup] worktree=${WORKTREE_ID} swept ${dbs} orphan test DBs and ${schemas} orphan schemas` +
          (skipped > 0 ? ` (skipped ${skipped} with active connections)` : ''),
      );
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
      const { dbs, schemas, skipped } = await sweepOrphans(admin);
      if (dbs + schemas + skipped > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[integration-api:globalTeardown] worktree=${WORKTREE_ID} swept ${dbs} test DBs and ${schemas} schemas on shutdown` +
            (skipped > 0 ? ` (skipped ${skipped} with active connections)` : ''),
        );
      }
    } finally {
      await admin.end({ timeout: 5 });
    }
  };
}
