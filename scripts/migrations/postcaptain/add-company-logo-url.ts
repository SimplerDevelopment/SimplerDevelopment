import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../../../lib/db');
  const { sql } = await import('drizzle-orm');

  console.log('Adding logo_url column to crm_companies (idempotent)...');

  await db.execute(
    sql`ALTER TABLE crm_companies ADD COLUMN IF NOT EXISTS logo_url VARCHAR(1000)`
  );

  console.log('Done.');
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
