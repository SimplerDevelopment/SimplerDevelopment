import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const connectionString = process.env.DATABASE_URL;

// Limit to 1 connection per process by default — during build, 47+ workers share
// the same Postgres. `DB_POOL_MAX` overrides this for environments that serve
// many concurrent requests from a single process (e.g. a local prod server under
// a high-parallelism e2e run); it defaults to 1 so build/prod behaviour is
// unchanged. connect_timeout keeps middleware/serverless invocations from hanging
// the full ~30s postgres.js default when the DB is unreachable; callers (e.g.
// resolveCustomDomain) add their own per-query timeouts on top of this.
const queryClient = postgres(connectionString, {
  max: Number(process.env.DB_POOL_MAX) || 1,
  idle_timeout: 20,
  connect_timeout: 5,
});
export const db = drizzle(queryClient, { schema });

// Re-exported so callers reach BOTH database handles through '@/lib/db'.
// Keeping the fan-out getter importable only from '@/lib/db/fanout' forks the
// test mocking surface: 381 unit test files do `vi.mock('@/lib/db')`, and a
// route using the fan-out pool would slip straight past that mock and open a
// REAL connection inside a unit test. One module, one mock. The implementation
// and the reasoning for the pool itself stay in ./fanout.ts.
export { getFanoutDb, resolveFanoutPoolMax } from './fanout';
