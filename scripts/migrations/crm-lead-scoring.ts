import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  // Add score column to crm_contacts
  await db.execute(sql`
    ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;
  `);

  // Create scoring rules table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_scoring_rules (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      points INTEGER NOT NULL,
      description VARCHAR(255),
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Insert default scoring rules for all existing clients
  await db.execute(sql`
    INSERT INTO crm_scoring_rules (client_id, event_type, points, description, enabled)
    SELECT c.id, r.event_type, r.points, r.description, true
    FROM clients c
    CROSS JOIN (VALUES
      ('form_submitted', 10, 'Contact submitted a form'),
      ('booking_made', 20, 'Contact made a booking'),
      ('email_opened', 5, 'Contact opened an email'),
      ('proposal_viewed', 15, 'Contact viewed a proposal'),
      ('deal_created', 25, 'A deal was created for contact'),
      ('meeting_completed', 15, 'A meeting was completed with contact')
    ) AS r(event_type, points, description)
    WHERE NOT EXISTS (
      SELECT 1 FROM crm_scoring_rules sr
      WHERE sr.client_id = c.id AND sr.event_type = r.event_type
    );
  `);

  console.log('Migration complete: crm_scoring_rules table created, score column added to crm_contacts, default rules inserted');
  process.exit(0);
}
migrate();
