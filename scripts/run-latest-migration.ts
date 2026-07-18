import * as dotenv from 'dotenv';
import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

async function runLatestMigration() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const sql = postgres(connectionString, { max: 1 });

  try {
    // Read the latest migration file
    const migrationPath = path.join(process.cwd(), 'drizzle', '0003_unusual_ravenous.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('Running migration 0003_unusual_ravenous.sql...');

    // Split by statement breakpoint and execute each statement
    const statements = migrationSQL
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      console.log('Executing statement...');
      await sql.unsafe(statement);
    }

    // Update migration tracking table
    console.log('Updating migration tracking...');
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0003_unusual_ravenous', ${Date.now()})
      ON CONFLICT DO NOTHING
    `;

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

runLatestMigration();
