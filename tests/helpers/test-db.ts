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

// Single pooled client for schema admin — one per worker.
let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (!_sql) _sql = postgres(connection(), { max: 1, onnotice: () => {} });
  return _sql;
}

/** Rewrites schema-qualified identifiers so migration SQL lands in the test schema. */
function rewriteForTestSchema(raw: string): string {
  // Replace `"public".` with `"<schema>".` — migrations use double-quoted identifiers.
  return raw.replace(/"public"\./g, `"${TEST_SCHEMA}".`);
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

  await sql.unsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
  await sql.unsafe(`CREATE SCHEMA "${TEST_SCHEMA}"`);
  await sql.unsafe(`SET search_path TO "${TEST_SCHEMA}", public`);

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
        await sql.unsafe(stmt);
      } catch (err) {
        const msg = (err as Error).message;
        if (/already exists|does not exist/i.test(msg)) continue;
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
