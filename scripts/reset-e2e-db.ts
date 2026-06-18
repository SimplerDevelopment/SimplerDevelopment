/**
 * Resets the E2E / local dev Postgres to a clean state:
 *   1. Drop + recreate the public schema (wipes all data)
 *   2. Replay every drizzle/*.sql in order
 *   3. Seed via scripts/seed-admin-e2e.ts
 *
 * DESTRUCTIVE. Intended only for the dev/test database. Refuses to run when
 * DATABASE_URL looks like a production host.
 *
 * Invoked via `scripts/test.sh --reset-db`. Safe to re-run — end state is
 * identical.
 */
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import postgres from 'postgres';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const URL_STR = process.env.DATABASE_URL;
if (!URL_STR) throw new Error('DATABASE_URL is not set');

// Use the same host-based check that `scripts/verify-db-target.ts` uses so the
// two guards never disagree. Substring matching on substring-of-name (e.g. the
// old `/prod/i` regex) false-positives on local DBs like
// `simplerdev_realprod_dryrun` even though they're on 127.0.0.1.
const PROD_INDICATORS = [
  'tramway.proxy.rlwy.net:43167',
  'metro.proxy.rlwy.net:25565',
];
const hitProd =
  PROD_INDICATORS.some((p) => URL_STR.includes(p)) ||
  process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
const override = process.env.ALLOW_PROD === '1';
if (hitProd && !override) {
  const redacted = URL_STR.replace(/:\/\/[^@]*@/, '://[REDACTED]@');
  console.error('');
  console.error('  REFUSING to reset: DATABASE_URL points at production.');
  console.error('');
  console.error(`  DATABASE_URL → ${redacted}`);
  console.error('');
  console.error('  If this is truly intentional, re-run with ALLOW_PROD=1 in your env.');
  console.error('');
  process.exit(1);
}

async function run() {
  const sql = postgres(URL_STR!, { max: 1, onnotice: () => {} });
  try {
    console.log('>> sweeping stale test_e2e_% schemas');
    const staleSchemas = await sql<{ nspname: string }[]>`
      SELECT nspname FROM pg_namespace WHERE nspname LIKE 'test_e2e_%'
    `;
    for (const s of staleSchemas) {
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${s.nspname}" CASCADE`);
    }
    if (staleSchemas.length > 0) console.log(`   dropped ${staleSchemas.length} stale schema(s)`);

    console.log('>> dropping public schema');
    await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await sql.unsafe('CREATE SCHEMA public');
    await sql.unsafe('GRANT ALL ON SCHEMA public TO public');

    console.log('>> running migrations');
    const dir = path.resolve(__dirname, '../drizzle');
    const files = fs.readdirSync(dir)
      .filter(f => /^\d{4}_.+\.sql$/.test(f))
      .sort();

    for (const file of files) {
      process.stdout.write(`   ${file} ... `);
      const raw = fs.readFileSync(path.join(dir, file), 'utf8');
      const statements = raw.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        try {
          await sql.unsafe(stmt);
        } catch (err) {
          const msg = (err as Error).message;
          if (/already exists|does not exist/i.test(msg)) continue;
          // Hand-written perf-index migrations (e.g. 9996) bundle multiple
          // `CREATE INDEX CONCURRENTLY` statements without `--> statement-breakpoint`
          // markers, so they run as one implicit-transaction batch and fail with
          // "cannot run inside a transaction block". These indexes are pure perf
          // and irrelevant to a throwaway e2e DB — skip them.
          if (/cannot run inside a transaction block/i.test(msg)) continue;
          throw new Error(`Migration ${file} failed: ${msg}\nStatement: ${stmt.slice(0, 200)}`);
        }
      }
      console.log('ok');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log('>> seeding');
  execSync('npx tsx scripts/seed-admin-e2e.ts', { stdio: 'inherit' });
  console.log('>> reset complete');
}

run().catch(err => { console.error(err); process.exit(1); });
