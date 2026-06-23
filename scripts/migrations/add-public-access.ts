import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../../lib/db');
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`ALTER TABLE client_websites ADD COLUMN IF NOT EXISTS public_access BOOLEAN NOT NULL DEFAULT false`);
  console.log('public_access column added');
  process.exit(0);
}
run();
