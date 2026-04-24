import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function migrate() {
  const { db } = await import('../../../lib/db');
  const { sql } = await import('drizzle-orm');

  console.log('Adding category column to crm_custom_fields...');

  await db.execute(sql`
    ALTER TABLE crm_custom_fields
    ADD COLUMN IF NOT EXISTS category VARCHAR(100)
  `);

  console.log('Done. crm_custom_fields.category is ready.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
