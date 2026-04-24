/**
 * Drops every `test_e2e_*` schema from the connected Postgres.
 * Safe to run at any time — refuses on URLs that look like production.
 *
 * Use this when integration-api tests accumulated garbage (e.g. workers from
 * previous runs whose schemas weren't cleanly dropped) and disk is full.
 */
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const URL_STR = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!URL_STR) throw new Error('DATABASE_URL_TEST or DATABASE_URL is not set');

const PROD_MARKERS = [/prod/i, /production/i, /main-db/i];
if (PROD_MARKERS.some(re => re.test(URL_STR))) {
  console.error('Refusing to run: DATABASE_URL looks like production');
  process.exit(1);
}

async function run() {
  const sql = postgres(URL_STR!, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ nspname: string }[]>`
      SELECT nspname FROM pg_namespace
      WHERE nspname LIKE 'test_e2e_%'
      ORDER BY nspname
    `;
    if (rows.length === 0) {
      console.log('No test_e2e_% schemas found — nothing to drop.');
      return;
    }
    console.log(`Dropping ${rows.length} schema(s):`);
    for (const r of rows) {
      process.stdout.write(`  ${r.nspname} ... `);
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${r.nspname}" CASCADE`);
      console.log('ok');
    }
    console.log('Done.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

run().catch(err => { console.error(err); process.exit(1); });
