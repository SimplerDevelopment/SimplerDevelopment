import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const connectionString = process.env.DATABASE_URL;

// Limit to 1 connection per process — during build, 47+ workers share the same Postgres.
// connect_timeout keeps middleware/serverless invocations from hanging the full ~30s
// postgres.js default when the DB is unreachable; callers (e.g. resolveCustomDomain)
// add their own per-query timeouts on top of this.
const queryClient = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 5,
});
export const db = drizzle(queryClient, { schema });
