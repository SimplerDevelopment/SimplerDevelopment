/**
 * Per-worker Postgres schema management for integration-api tests.
 *
 * Strategy:
 *   - Each Vitest worker gets an isolated schema `test_e2e_<workerId>`.
 *     (TEST_SCHEMA comes from ./test-bootstrap which set it up in the
 *      DATABASE_URL search_path BEFORE @/lib/db was imported.)
 *   - applyTestSchema():   CREATE SCHEMA + replay all drizzle/*.sql against it.
 *                          Schema-qualified references in migrations (`"public".`)
 *                          are rewritten to `"<TEST_SCHEMA>".` on the fly so FKs
 *                          resolve within the test schema.
 *   - truncateTestData():  TRUNCATE every table CASCADE (fast per-test reset).
 *   - dropTestSchema():    DROP SCHEMA CASCADE at the end of the file.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import postgres from 'postgres';
import { TEST_SCHEMA } from './test-bootstrap';

export { TEST_SCHEMA };

function connection() {
  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_TEST or DATABASE_URL is required for integration-api tests');
  return url;
}

// Single pooled client for schema admin — one per worker. keep_alive pings
// the server to survive Railway's idle-connection drops mid-migration.
let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (!_sql) {
    _sql = postgres(connection(), {
      max: 1,
      onnotice: () => {},
      idle_timeout: 0,
      connect_timeout: 30,
      // Match the route-side connection (test-bootstrap pins TimeZone=UTC on
      // DATABASE_URL). Without this, inserts through test helpers would use
      // the server-default TZ (e.g. America/New_York on a dev macOS) and
      // later WHERE comparisons in route code drift by the local offset.
      connection: { TimeZone: 'UTC' },
    });
  }
  return _sql;
}

function resetSql() {
  if (_sql) {
    _sql.end({ timeout: 1 }).catch(() => {});
    _sql = null;
  }
}

/**
 * Dedicated client for the migration-replay advisory lock. Kept on a separate
 * connection from `_sql` so a transient TCP reset on the work client (which
 * `withRetry` handles by tearing down `_sql` and reconnecting) does NOT also
 * end the lock-holder session. When the lock connection ended mid-replay,
 * Postgres released the lock on session close and a sibling worker would
 * race in, causing the `0000_*.sql` ALTER-TABLE deadlock that's been
 * breaking ~430 integration tests since 2026-05-08.
 */
let _lockSql: ReturnType<typeof postgres> | null = null;
function getLockSql() {
  if (!_lockSql) {
    _lockSql = postgres(connection(), {
      max: 1,
      onnotice: () => {},
      idle_timeout: 0,
      connect_timeout: 30,
      connection: { TimeZone: 'UTC' },
    });
  }
  return _lockSql;
}

function resetLockSql() {
  if (_lockSql) {
    _lockSql.end({ timeout: 1 }).catch(() => {});
    _lockSql = null;
  }
}

/** Rewrites schema-qualified identifiers so migration SQL lands in the test schema. */
function rewriteForTestSchema(raw: string): string {
  // Replace `"public".` with `"<schema>".` — migrations use double-quoted identifiers.
  return raw.replace(/"public"\./g, `"${TEST_SCHEMA}".`);
}

/**
 * Retry a DB op when the underlying TCP connection drops mid-statement.
 * `resetOnDrop` picks which client to tear down before the next attempt —
 * the work client (`'work'`, default) or the lock client (`'lock'`).
 * Passing the wrong one leaves a dead connection in place and the retry
 * dies on the same socket.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  resetOnDrop: 'work' | 'lock' = 'work',
): Promise<T> {
  let lastErr: Error | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = (err as Error).message;
      const transient = /ECONNRESET|CONNECTION_ENDED|CONNECTION_CLOSED|connection.*(terminated|reset|closed)/i.test(msg);
      if (!transient || i === attempts - 1) throw err;
      if (resetOnDrop === 'lock') resetLockSql();
      else resetSql();
      await new Promise(r => setTimeout(r, 250 * (i + 1)));
      lastErr = err as Error;
    }
  }
  throw lastErr;
}

// Postgres session-scoped advisory lock key for migration replay. Constant
// across all workers so they serialize on the same lock — derived from the
// FNV-1a 64-bit hash of 'sd2026-test-schema-init' (interpreted as signed
// bigint to fit pg_advisory_lock(bigint)). Hard-coded so the value is stable
// without needing a hash impl at import time. String form + BigInt() because
// the tsconfig targets ES2017 (no `123n` literal syntax).
const MIGRATION_LOCK_KEY = BigInt('-1037281771467175158');

export async function applyTestSchema(): Promise<void> {
  const sql = getSql();

  // If the schema already looks migrated (users table present), skip the ~30s
  // replay. This keeps multi-spec runs fast — the schema persists across spec
  // files within one worker; truncateTestData() clears data between tests.
  const existing = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = ${TEST_SCHEMA} AND tablename = 'users'
    LIMIT 1
  `;
  if (existing.length > 0) {
    await sql.unsafe(`SET search_path TO "${TEST_SCHEMA}", public`);
    return;
  }

  // Serialize migration replay across parallel-fork workers. Each worker has
  // its own schema, but `CREATE EXTENSION vector` and the embedding-trigger
  // CREATE FUNCTION statements touch shared catalogs (pg_extension, pg_proc) —
  // concurrent workers race there and either deadlock or surface
  // pg_proc_*/pg_extension_* unique-constraint errors. Holding a session-scoped
  // advisory lock keyed by a constant forces strict ordering. Released in
  // `finally` so a thrown migration error doesn't strand the lock.
  //
  // The lock lives on `_lockSql` — a separate connection from the work
  // client — so retry-induced resets of `_sql` can't accidentally release
  // the lock (Postgres releases session-scoped locks when their session
  // ends). Pre-2026-05-12 code reused `_sql` here, which caused the
  // ~430-test schema-drift bucket whenever a sibling worker raced in
  // mid-replay after a transient reset.
  await withRetry(() => getLockSql().unsafe(`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`), 3, 'lock');
  try {
    // Re-check after acquiring the lock: a sibling worker may have already
    // populated this exact schema name while we were blocked (rare — schemas
    // are per-worker — but possible if test_e2e_<id> collides across reruns).
    const recheck = await getSql()<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = ${TEST_SCHEMA} AND tablename = 'users'
      LIMIT 1
    `;
    if (recheck.length > 0) {
      await getSql().unsafe(`SET search_path TO "${TEST_SCHEMA}", public`);
      return;
    }

    await withRetry(() => getSql().unsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`));
    await withRetry(() => getSql().unsafe(`CREATE SCHEMA "${TEST_SCHEMA}"`));
    await withRetry(() => getSql().unsafe(`SET search_path TO "${TEST_SCHEMA}", public`));

    const dir = path.resolve(__dirname, '../../drizzle');
    const files = fs.readdirSync(dir)
      .filter(f => /^\d{4}_.+\.sql$/.test(f))
      .sort();

    for (const file of files) {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const rewritten = rewriteForTestSchema(raw);
      const statements = rewritten.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        try {
          await withRetry(() => getSql().unsafe(stmt));
        } catch (err) {
          const msg = (err as Error).message;
          // "already exists" / "does not exist" — direct DDL conflicts that mean
          // the prior idempotent replay already covered this statement.
          // "duplicate key value violates unique constraint" with pg_class_/pg_type_
          // names — same situation, just surfaced as a catalog uniqueness error
          // (e.g. CREATE UNIQUE INDEX or CREATE TABLE row-type collision when
          // a prior partial run left some objects behind).
          if (/already exists|does not exist/i.test(msg)) continue;
          if (/duplicate key value violates unique constraint "(pg_class_|pg_type_|pg_constraint_|pg_namespace_|pg_proc_|pg_extension_)/i.test(msg)) continue;
          throw new Error(`Migration ${file} failed: ${msg}\nStatement: ${stmt.slice(0, 240)}`);
        }
      }
    }
  } finally {
    // pg_advisory_unlock returns boolean; ignore false. Releasing on
    // `_lockSql` (the connection that acquired the lock) is the load-bearing
    // detail — releasing on `_sql` would silently no-op because it doesn't
    // hold the lock.
    try {
      await getLockSql().unsafe(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`);
    } catch {
      // Best-effort: connection may already be gone.
    }
  }
}

export async function truncateTestData(): Promise<void> {
  const sql = getSql();
  const rows = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = ${TEST_SCHEMA}
  `;
  if (rows.length === 0) return;
  const tables = rows.map(r => `"${TEST_SCHEMA}"."${r.tablename}"`).join(', ');
  await sql.unsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

export async function dropTestSchema(): Promise<void> {
  const sql = getSql();
  await sql.unsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
  await sql.end({ timeout: 5 });
  _sql = null;
  // Close the lock connection too — workers exit after this and a lingering
  // session would hold the slot until idle_timeout.
  resetLockSql();
}

export function getTestSql() { return getSql(); }
