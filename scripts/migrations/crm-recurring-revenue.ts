import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  await db.execute(sql`
    ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS recurring_value INTEGER;
    ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20);
  `);

  console.log('Migration complete: recurring_value and billing_cycle columns added to crm_deals');
  process.exit(0);
}
migrate();
