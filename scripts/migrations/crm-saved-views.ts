import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  // Create saved views table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_saved_views (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      entity_type VARCHAR(20) NOT NULL,
      name VARCHAR(100) NOT NULL,
      filters JSONB NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_csv_client_entity ON crm_saved_views(client_id, entity_type);
  `);

  console.log('Migration complete: crm_saved_views table created');
  process.exit(0);
}
migrate();
