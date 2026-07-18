import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../../lib/db');
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`ALTER TABLE client_websites ADD COLUMN IF NOT EXISTS preview_code VARCHAR(64)`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS client_websites_preview_code_key ON client_websites (preview_code) WHERE preview_code IS NOT NULL`);
  console.log('preview_code column + unique index added');
  process.exit(0);
}
run();
