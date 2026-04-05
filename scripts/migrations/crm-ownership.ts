import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  await db.execute(sql`
    ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_deals_owner ON crm_deals(owner_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_owner ON crm_contacts(owner_id);
  `);
  console.log('Migration complete: ownership columns added');
  process.exit(0);
}
migrate();
