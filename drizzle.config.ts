import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// `.env.local` is the per-developer override and MUST win over `.env`.
// bun and Next inject `.env` into process.env before this file runs, so
// without override:true the second call is a no-op and the staging URL
// from `.env` silently beats the local URL in `.env.local`.
dotenv.config({ path: '.env.local', override: true });

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
