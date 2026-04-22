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

// Refuse on anything that smells like production
const PROD_MARKERS = [/prod/i, /production/i, /railway\.app.*prod/i, /main\-db/i];
if (PROD_MARKERS.some(re => re.test(URL_STR))) {
  console.error('Refusing to reset: DATABASE_URL looks like production');
  process.exit(1);
}

async function run() {
  const sql = postgres(URL_STR!, { max: 1, onnotice: () => {} });
  try {
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
