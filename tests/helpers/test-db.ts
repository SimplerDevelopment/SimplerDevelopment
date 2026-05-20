/**
 * Per-worker Postgres DATABASE management for integration-api tests.
 *
 * Strategy (Postgres TEMPLATE database):
 *   - globalSetup builds `simplerdev_test_template` once — replays every
 *     `drizzle/*.sql` migration into it. The template is immutable thereafter.
 *   - applyTestSchema():   DROP IF EXISTS + CREATE DATABASE <perWorkerDb>
 *                          TEMPLATE simplerdev_test_template. This is a
 *                          file-level copy (single-digit seconds), not a
 *                          migration replay (~30-60s).
 *   - truncateTestData():  TRUNCATE every table in `public` CASCADE.
 *   - dropTestDatabase():  Close the per-worker @/lib/db pool's connection
 *                          (postgres-js will reconnect on next query in the
 *                          next file's beforeAll), then
 *                          `DROP DATABASE … WITH (FORCE)` from the admin
 *                          client. Postgres 13+ syntax.
 *
 * Why TEST_SCHEMA = 'public' (in test-bootstrap.ts):
 *   Many test files reference `${sql(TEST_SCHEMA)}.users` directly. Now that
 *   isolation is at the DB level, the schema name is just `public`. The
 *   constant is kept so those test files don't need to change.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import postgres from 'postgres';
import { ADMIN_URL, PER_WORKER_DB, TEMPLATE_DB, TEST_SCHEMA } from './test-bootstrap';

export { TEST_SCHEMA, TEMPLATE_DB, PER_WORKER_DB };

function workConnectionString() {
  // Bootstrap rewrote DATABASE_URL to point at PER_WORKER_DB. That's the
  // same URL @/lib/db reads, so test-side direct queries land in the same
  // DB as route-under-test queries.
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for integration-api tests');
  return url;
}

// Admin client — talks to the `postgres` DB so it can issue CREATE / DROP
// DATABASE against the per-worker DB. Lives for the whole test file lifetime
// (one file = one beforeAll/afterAll cycle).
let _adminSql: ReturnType<typeof postgres> | null = null;
function getAdminSql() {
  if (!_adminSql) {
    _adminSql = postgres(ADMIN_URL, {
      max: 1,
      onnotice: () => {},
      idle_timeout: 0,
      connect_timeout: 30,
    });
  }
  return _adminSql;
}
async function closeAdminSql() {
  if (_adminSql) {
    const old = _adminSql;
    _adminSql = null;
    try {
      await old.end({ timeout: 5 });
    } catch {
      // Best-effort: tests can't recover from a stuck admin connection here.
    }
  }
}

// Work client — talks to the per-worker DB. Held by test files that want raw
// SQL access via getTestSql(). Closed before DROP DATABASE so the DROP doesn't
// have to evict it via WITH (FORCE).
let _workSql: ReturnType<typeof postgres> | null = null;
function getWorkSql() {
  if (!_workSql) {
    _workSql = postgres(workConnectionString(), {
      max: 1,
      onnotice: () => {},
      idle_timeout: 0,
      connect_timeout: 30,
      // Match the route-side connection (test-bootstrap pins TimeZone=UTC on
      // DATABASE_URL). Without this, inserts through test helpers would use
      // the server-default TZ (e.g. America/New_York on a dev macOS) and
      // later WHERE comparisons in route code would drift by the local
      // offset.
      connection: { TimeZone: 'UTC' },
    });
  }
  return _workSql;
}
async function closeWorkSql() {
  if (_workSql) {
    const old = _workSql;
    _workSql = null;
    try {
      await old.end({ timeout: 5 });
    } catch {
      // Ignore — the DB is about to be dropped anyway.
    }
  }
}

/**
 * Drop+recreate the per-worker DB from the template. Called in each test
 * file's beforeAll. Cost: single-digit seconds (file-level template copy),
 * regardless of how many migrations the template captured.
 */
export async function applyTestSchema(): Promise<void> {
  const admin = getAdminSql();

  // Make sure the template exists. If it doesn't, globalSetup didn't run —
  // surface a clear error pointing at the right file.
  const tpl = await admin<{ datname: string }[]>`
    SELECT datname FROM pg_database WHERE datname = ${TEMPLATE_DB} LIMIT 1
  `;
  if (tpl.length === 0) {
    throw new Error(
      `Template DB "${TEMPLATE_DB}" is missing. Vitest globalSetup ` +
        `(tests/helpers/global-setup.ts) must run before any integration-api file. ` +
        `If this fails inside a focused single-file run, the globalSetup hook still ` +
        `fires — verify DATABASE_URL points at a Postgres the test user can CREATE/DROP on.`,
    );
  }

  // Belt+suspenders: drop any stale copy with the per-worker name. Postgres
  // 13+ `WITH (FORCE)` boots active connections (e.g. a lingering @/lib/db
  // pool from a prior file in the same worker process).
  await admin.unsafe(`DROP DATABASE IF EXISTS "${PER_WORKER_DB}" WITH (FORCE)`);

  // File-level copy of the template — orders of magnitude faster than
  // replaying every migration.
  await admin.unsafe(`CREATE DATABASE "${PER_WORKER_DB}" TEMPLATE "${TEMPLATE_DB}"`);
}

/**
 * Truncate every table in the public schema (RESTART IDENTITY, CASCADE).
 * Per-test reset within a file. Fast because the schema is fresh each file —
 * no pg_class catalog bloat accumulates.
 */
export async function truncateTestData(): Promise<void> {
  const sql = getWorkSql();
  const rows = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  if (rows.length === 0) return;
  const tables = rows.map(r => `"public"."${r.tablename}"`).join(', ');
  await sql.unsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

/**
 * Tear down the per-worker DB. Called in each test file's afterAll.
 *
 * Sequence:
 *   1. Close the test-side `_workSql` pool.
 *   2. From the admin connection, REVOKE CONNECT on the per-worker DB so
 *      no client (including the app's @/lib/db pool that postgres-js will
 *      auto-reconnect) can race in between our terminate and our drop.
 *   3. pg_terminate_backend every remaining connection to the DB. This is
 *      more reliable than relying solely on `DROP DATABASE … WITH (FORCE)`,
 *      because `@/lib/db`'s postgres-js pool aggressively reconnects after
 *      SIGTERM — terminate-then-drop in a single transaction-free pair
 *      gives a tighter window. REVOKE CONNECT (step 2) closes that window.
 *   4. DROP DATABASE … WITH (FORCE) as a belt-and-suspenders backstop.
 */
export async function dropTestDatabase(): Promise<void> {
  await closeWorkSql();
  const admin = getAdminSql();
  try {
    // REVOKE CONNECT prevents postgres-js's auto-reconnect from racing the
    // drop. pg_terminate_backend kicks every still-open session.
    await admin.unsafe(`REVOKE CONNECT ON DATABASE "${PER_WORKER_DB}" FROM PUBLIC`).catch(() => {});
    await admin.unsafe(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${PER_WORKER_DB}' AND pid <> pg_backend_pid()
    `).catch(() => {});
    await admin.unsafe(`DROP DATABASE IF EXISTS "${PER_WORKER_DB}" WITH (FORCE)`);
  } finally {
    await closeAdminSql();
  }
}

/**
 * Back-compat alias for callers that still import the old name. Forwards to
 * dropTestDatabase. New code should call dropTestDatabase directly.
 */
export const dropTestSchema = dropTestDatabase;

/**
 * Raw SQL access against the per-worker DB. Used by test fixtures that
 * INSERT/SELECT directly. The returned client connects to the per-worker DB
 * — i.e. tests can interpolate `${sql(TEST_SCHEMA)}.users` (where
 * TEST_SCHEMA === 'public') and it Just Works.
 */
export function getTestSql() {
  return getWorkSql();
}

// ────────────────────────────────────────────────────────────────────────────
// Template builder. Called exactly once per integration-api run, from
// tests/helpers/global-setup.ts. Exported so globalSetup can call it without
// duplicating the migration-replay logic.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Replay every drizzle/*.sql against a fresh copy of TEMPLATE_DB. Idempotent
 * with respect to "already exists" errors so a previous half-built template
 * can be safely rebuilt.
 *
 * Connects to TEMPLATE_DB directly (not via @/lib/db). Returns when the
 * template is fully populated and the connection is closed — the DB is then
 * eligible to be used as a template by subsequent CREATE DATABASE … TEMPLATE
 * commands (Postgres requires no active sessions on the source DB at that
 * moment).
 */
export async function buildTemplateDatabase(opts?: { quiet?: boolean }): Promise<{ migrationCount: number; elapsedMs: number }> {
  const t0 = Date.now();
  const quiet = opts?.quiet ?? false;

  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {}, connect_timeout: 30 });
  try {
    // Boot anyone connected to the template (e.g. a previous crashed run
    // left a pool open) before dropping it.
    await admin.unsafe(`DROP DATABASE IF EXISTS "${TEMPLATE_DB}" WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE "${TEMPLATE_DB}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  // Build the template URL from ADMIN_URL by swapping the path.
  const tplUrl = new URL(ADMIN_URL);
  tplUrl.pathname = `/${TEMPLATE_DB}`;
  const tpl = postgres(tplUrl.toString(), {
    max: 1,
    onnotice: () => {},
    idle_timeout: 0,
    connect_timeout: 30,
    connection: { TimeZone: 'UTC' },
  });

  let migrationCount = 0;
  try {
    const dir = path.resolve(__dirname, '../../drizzle');
    const files = fs.readdirSync(dir)
      .filter(f => /^\d{4}_.+\.sql$/.test(f))
      .sort();

    for (const file of files) {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const statements = raw.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        try {
          await tpl.unsafe(stmt);
        } catch (err) {
          const msg = (err as Error).message;
          // Tolerate idempotent re-application: a prior partial build may
          // have left some objects behind.
          if (/already exists|does not exist/i.test(msg)) continue;
          if (/duplicate key value violates unique constraint "(pg_class_|pg_type_|pg_constraint_|pg_namespace_|pg_proc_|pg_extension_)/i.test(msg)) continue;
          throw new Error(`Template build failed at ${file}: ${msg}\nStatement: ${stmt.slice(0, 240)}`);
        }
      }
      migrationCount++;
    }
  } finally {
    // CRITICAL: Postgres requires the source DB to have no active sessions
    // before it can be used as a TEMPLATE. Close cleanly.
    await tpl.end({ timeout: 5 });
  }

  // Heal schema drift: lib/db/schema/*.ts can drift ahead of drizzle/*.sql
  // when a column is hand-applied in prod (via psql) but the corresponding
  // migration is never numbered into the regular sequence. `drizzle-kit push`
  // reads the TS schema and ALTERs the template to match — purely additive
  // here in practice, since the migration replay above created the tables.
  // Idempotent: a no-op when schema and migrations are already in sync.
  //
  // SOFT-FAILS by design: if drizzle-kit is unavailable or push errors, we
  // warn but don't break the test run. NOTE the failure mode this enables —
  // if push times out before adding a schema-only column (e.g. `preview_code`
  // on client_websites), tests that SELECT that column will explode with
  // `column "X" does not exist`. The 180s budget below covers a ~226-table
  // schema pull + diff on a warm Postgres; the original 60s tripped routinely.
  try {
    const repoRoot = path.resolve(__dirname, '../..');
    execSync('npx drizzle-kit push --force', {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: tplUrl.toString() },
      stdio: quiet ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
    });
    if (!quiet) {
      // eslint-disable-next-line no-console
      console.log('[integration-api:globalSetup] drizzle-kit push healed any schema drift');
    }
  } catch (err) {
    if (!quiet) {
      // eslint-disable-next-line no-console
      console.warn('[integration-api:globalSetup] drizzle-kit push failed (drift may persist):', (err as Error).message.slice(0, 200));
    }
  }

  const elapsedMs = Date.now() - t0;
  if (!quiet) {
    // eslint-disable-next-line no-console
    console.log(`[integration-api:globalSetup] built template "${TEMPLATE_DB}" — ${migrationCount} migrations in ${elapsedMs}ms`);
  }
  return { migrationCount, elapsedMs };
}
