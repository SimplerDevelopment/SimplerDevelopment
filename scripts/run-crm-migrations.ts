import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  console.log('Running CRM migrations...');

  // 1. Ownership columns
  await db.execute(sql`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.execute(sql`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_deals_owner ON crm_deals(owner_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_contacts_owner ON crm_contacts(owner_id)`);
  console.log('  ownership columns: done');

  // 2. Lead scoring
  await db.execute(sql`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_scoring_rules (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      points INTEGER NOT NULL,
      description VARCHAR(255),
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log('  lead scoring: done');

  // 3. Saved views
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
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_csv_client_entity ON crm_saved_views(client_id, entity_type)`);
  console.log('  saved views: done');

  // 4. Notifications
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_notifications (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT,
      entity_type VARCHAR(20),
      entity_id INTEGER,
      read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON crm_notifications(user_id, read, created_at DESC)`);
  console.log('  notifications: done');

  // 5. Custom fields
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
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_custom_field_values (
      id SERIAL PRIMARY KEY,
      custom_field_id INTEGER NOT NULL REFERENCES crm_custom_fields(id) ON DELETE CASCADE,
      entity_id INTEGER NOT NULL,
      entity_type VARCHAR(20) NOT NULL,
      value TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_cfv_unique ON crm_custom_field_values(custom_field_id, entity_id, entity_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cfv_entity ON crm_custom_field_values(entity_type, entity_id)`);
  console.log('  custom fields: done');

  // 6. Recurring revenue
  await db.execute(sql`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS recurring_value INTEGER`);
  await db.execute(sql`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20)`);
  console.log('  recurring revenue: done');

  // 6a. Contact LinkedIn URL
  await db.execute(sql`ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500)`);
  console.log('  contact linkedin url: done');

  // 6b. Custom field "filterable" toggle
  await db.execute(sql`ALTER TABLE crm_custom_fields ADD COLUMN IF NOT EXISTS filterable BOOLEAN NOT NULL DEFAULT false`);
  // Existing enum-like fields default to filterable so current UI doesn't regress
  await db.execute(sql`UPDATE crm_custom_fields SET filterable = true WHERE field_type IN ('select','multiselect','boolean') AND filterable = false`);
  console.log('  custom field filterable: done');

  // 7. Deal artifacts & comments
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_deal_artifacts (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
      artifact_type VARCHAR(50) NOT NULL,
      artifact_id INTEGER NOT NULL,
      display_title VARCHAR(255) NOT NULL,
      pinned BOOLEAN DEFAULT false NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_deal_comments (
      id SERIAL PRIMARY KEY,
      deal_id INTEGER NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      attachments JSON DEFAULT '[]',
      created_at TIMESTAMP DEFAULT now() NOT NULL,
      updated_at TIMESTAMP DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_deal_artifacts_deal ON crm_deal_artifacts(deal_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_deal_comments_deal ON crm_deal_comments(deal_id)`);
  console.log('  deal artifacts & comments: done');

  // 8. Activity index for email tracking
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_activities_contact_type ON crm_activities(contact_id, type)`);
  console.log('  email tracking index: done');

  console.log('\nAll CRM migrations complete!');
  process.exit(0);
}

run().catch(err => { console.error('Migration failed:', err); process.exit(1); });
