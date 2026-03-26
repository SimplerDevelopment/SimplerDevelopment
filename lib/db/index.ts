import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const connectionString = process.env.DATABASE_URL;

// Limit to 1 connection per process — during build, 47+ workers share the same Postgres
const queryClient = postgres(connectionString, { max: 1, idle_timeout: 20 });
export const db = drizzle(queryClient, { schema });
