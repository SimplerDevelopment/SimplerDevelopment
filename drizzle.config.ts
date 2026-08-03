import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// `.env.local` is the per-developer override and MUST win over `.env`.
// bun and Next inject `.env` into process.env before this file runs, so
// without override:true the second call is a no-op and the staging URL
// from `.env` silently beats the local URL in `.env.local`.
dotenv.config({ path: '.env.local', override: true });

// Programmatic callers (the integration-test template heal in
// tests/helpers/test-db.ts) need a channel that CANNOT be overridden by
// .env.local — passing plain DATABASE_URL gets clobbered by the override
// above, which once silently redirected the heal at a developer's local DB
// and left the test template missing schema-only columns.
if (process.env.DRIZZLE_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DRIZZLE_DATABASE_URL;
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export default {
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
} satisfies Config;
