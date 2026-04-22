/**
 * Bootstrap for integration-api tests.
 * MUST be imported before any module that references @/lib/db — it rewrites
 * DATABASE_URL to route the app's Postgres connection through a per-worker
 * schema via the `search_path` connection option. @/lib/db reads the env at
 * module-evaluation time, so any ordering slip here will bypass isolation.
 */
import 'dotenv/config';

const WORKER_ID = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '0';
export const TEST_SCHEMA = `test_e2e_${WORKER_ID}`;

const orig = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!orig) throw new Error('DATABASE_URL_TEST or DATABASE_URL must be set for integration-api tests');

const u = new URL(orig);
const existing = u.searchParams.get('options') ?? '';
const addition = `-c search_path=${TEST_SCHEMA},public`;
u.searchParams.set('options', existing ? `${existing} ${addition}` : addition);
process.env.DATABASE_URL = u.toString();
