import * as dotenv from 'dotenv';
import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const sql = postgres(connectionString, { max: 1 });
  try {
    const file = path.join(process.cwd(), 'drizzle', '0055_pm_drop_legacy_assigned_to.sql');
    const migrationSQL = fs.readFileSync(file, 'utf-8');
    console.log('Running 0055_pm_drop_legacy_assigned_to.sql...');
    await sql.unsafe(migrationSQL);
    console.log('Migration completed.');
  } finally {
    await sql.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
