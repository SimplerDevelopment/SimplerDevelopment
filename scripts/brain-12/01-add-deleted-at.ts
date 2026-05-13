/**
 * Add brain_notes.deleted_at on prod to match the TS schema.
 * Required prerequisite for BRAIN-12 soft-delete recovery story.
 * Nullable, no default — fully backward compatible.
 */

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
if (url.includes('.railway.internal')) { console.error('Use the public proxy URL.'); process.exit(1); }

const sql = postgres(url, { max: 1, idle_timeout: 5 });

async function main() {
  console.log(`Targeting: ${url.replace(/:\/\/[^@]+@/, '://***@')}`);
  const exists = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brain_notes' AND column_name = 'deleted_at'
  `;
  if (exists.length > 0) {
    console.log('deleted_at already exists. Nothing to do.');
  } else {
    await sql`ALTER TABLE brain_notes ADD COLUMN deleted_at TIMESTAMP`;
    console.log('Added brain_notes.deleted_at (nullable timestamp).');
  }
  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
