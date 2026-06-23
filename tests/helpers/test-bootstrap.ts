/**
 * Bootstrap for integration-api tests.
 * MUST be imported before any module that references @/lib/db — it rewrites
 * DATABASE_URL to route the app's Postgres connection through a per-worker
 * DATABASE (full DB-level isolation, not just a schema). @/lib/db reads the
 * env at module-evaluation time, so any ordering slip here will bypass
 * isolation.
 *
 * Strategy (Postgres TEMPLATE database):
 *   - globalSetup builds `simplerdev_test_template` once — replays every
 *     drizzle/*.sql migration into it.
 *   - Each worker owns a per-worker DB name (`test_e2e_w<workerId>`) that is
 *     CREATEd from the template in setup-api.ts beforeAll and DROPped in
 *     afterAll. CREATE … TEMPLATE is a file-level copy, so each file's
 *     beforeAll runs in single-digit seconds instead of replaying ~107
 *     migrations.
 *   - TEST_SCHEMA is kept as `public` so existing test files that
 *     `INSERT INTO ${sql(TEST_SCHEMA)}.users …` keep working unchanged.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';

const WORKER_ID = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '0';

/**
 * Stable per-worktree discriminator. Hash the absolute path of the repo
 * root so two worktrees of the same repo (e.g. `staging` and a feature
 * branch worktree) running `bun test:integration:local` simultaneously
 * don't race on the same `test_e2e_w*` / template names. Truncated SHA1
 * is pg-safe (lowercase hex, no special chars) and stays well under the
 * 63-char identifier limit.
 */
const REPO_ROOT = path.resolve(__dirname, '../..');
export const WORKTREE_ID = crypto.createHash('sha1').update(REPO_ROOT).digest('hex').slice(0, 8);

/** Name of the immutable template DB built once in globalSetup. */
export const TEMPLATE_DB = `simplerdev_test_template_${WORKTREE_ID}`;

/** Per-worker DB name. Stable for the lifetime of this worker process. */
export const PER_WORKER_DB = `test_e2e_${WORKTREE_ID}_w${WORKER_ID}`;

/**
 * Back-compat alias. Pre-template-DB versions of this file isolated tests
 * with a per-worker SCHEMA inside a shared DB; many tests reference
 * `${sql(TEST_SCHEMA)}.users` directly. Now that isolation is at the DB
 * level, the schema is just plain `public` — but exporting the same name
 * means callers don't need to change.
 */
export const TEST_SCHEMA = 'public';

const orig = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!orig) throw new Error('DATABASE_URL_TEST or DATABASE_URL must be set for integration-api tests');

const u = new URL(orig);

/**
 * URL of the admin DB used by helper code to issue `CREATE DATABASE` /
 * `DROP DATABASE` — neither of which can run against the DB you're connected
 * to. We swap the path to `postgres` (the default admin DB on every install)
 * and keep host/port/credentials intact.
 */
const adminUrl = new URL(orig);
adminUrl.pathname = '/postgres';
// Strip any caller-supplied options; the admin connection doesn't need them.
adminUrl.searchParams.delete('options');
export const ADMIN_URL = adminUrl.toString();

// Point the app's @/lib/db at the per-worker DB. The DB itself is created
// (cloned from the template) in applyTestSchema() before any query runs.
u.pathname = `/${PER_WORKER_DB}`;
// Keep TimeZone=UTC so JS Date ↔ `timestamp` round-trips stay stable even
// when the server default is e.g. America/New_York. search_path is no longer
// needed — the DB itself is the isolation unit and the template's public
// schema is what every query targets.
const existing = u.searchParams.get('options') ?? '';
const tzOption = '-c TimeZone=UTC';
// Strip any leftover `search_path=…` token. With full-DB isolation it's
// noise; an unrelated value would also defeat the default `public` schema.
const cleaned = existing
  .split(/\s+/)
  .filter(part => part.length > 0 && !/search_path=/i.test(part))
  .join(' ');
u.searchParams.set('options', cleaned ? `${cleaned} ${tzOption}` : tzOption);
process.env.DATABASE_URL = u.toString();
