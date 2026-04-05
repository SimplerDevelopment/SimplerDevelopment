import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../../../lib/db');
  const { sql } = await import('drizzle-orm');

  await db.execute(sql`ALTER TABLE booking_pages ADD COLUMN IF NOT EXISTS conference_type varchar(20) DEFAULT 'none' NOT NULL`);
  await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS meeting_link varchar(500)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS zoom_tokens (id serial PRIMARY KEY NOT NULL, client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE, access_token text NOT NULL, refresh_token text NOT NULL, expires_at timestamp NOT NULL, created_at timestamp DEFAULT now() NOT NULL, updated_at timestamp DEFAULT now() NOT NULL, CONSTRAINT zoom_tokens_client_id_unique UNIQUE(client_id))`);
  console.log('Migration 0040 applied');
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });
