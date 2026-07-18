import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_custom_fields (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      entity_type VARCHAR(20) NOT NULL,
      field_name VARCHAR(100) NOT NULL,
      field_type VARCHAR(20) NOT NULL,
      options JSONB,
      required BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS crm_custom_field_values (
      id SERIAL PRIMARY KEY,
      custom_field_id INTEGER NOT NULL REFERENCES crm_custom_fields(id) ON DELETE CASCADE,
      entity_id INTEGER NOT NULL,
      entity_type VARCHAR(20) NOT NULL,
      value TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cfv_unique ON crm_custom_field_values(custom_field_id, entity_id, entity_type);
    CREATE INDEX IF NOT EXISTS idx_cfv_entity ON crm_custom_field_values(entity_type, entity_id);
  `);
  console.log('Migration complete: crm_custom_fields tables created');
  process.exit(0);
}
migrate();
