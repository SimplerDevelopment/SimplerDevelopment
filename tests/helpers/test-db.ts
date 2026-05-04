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

/** Rewrites schema-qualified identifiers so migration SQL lands in the test schema. */
function rewriteForTestSchema(raw: string): string {
  // Replace `"public".` with `"<schema>".` — migrations use double-quoted identifiers.
  return raw.replace(/"public"\./g, `"${TEST_SCHEMA}".`);
}

/** Retry a DB op when the underlying TCP connection drops mid-statement. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: Error | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = (err as Error).message;
      const transient = /ECONNRESET|CONNECTION_ENDED|CONNECTION_CLOSED|connection.*(terminated|reset|closed)/i.test(msg);
      if (!transient || i === attempts - 1) throw err;
      resetSql();     // force a fresh connection
      await new Promise(r => setTimeout(r, 250 * (i + 1)));
      lastErr = err as Error;
    }
  }
  throw lastErr;
}

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
        if (/duplicate key value violates unique constraint "(pg_class_|pg_type_|pg_constraint_|pg_namespace_)/i.test(msg)) continue;
        throw new Error(`Migration ${file} failed: ${msg}\nStatement: ${stmt.slice(0, 240)}`);
      }
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
}

export function getTestSql() { return getSql(); }
