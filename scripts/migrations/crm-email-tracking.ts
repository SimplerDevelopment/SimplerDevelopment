import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  // Add index for efficient email activity lookups by contact and type
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_activities_contact_type ON crm_activities(contact_id, type);
  `);

  console.log('Migration complete: crm_activities email tracking index created');
  process.exit(0);
}
migrate();
