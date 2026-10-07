import { readFileSync } from 'node:fs';
import postgres from 'postgres';

// Destructive experiments and fixtures belong only in an explicitly local
// test database. Production uses the normal journaled migration command.
const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error('DATABASE_URL_TEST is required');
const target = new URL(url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.includes('test')) {
  throw new Error('Upgrade verification requires a local test database');
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [already] = await sql`SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='mfa_last_used_step'`;
  if (already) throw new Error('Use a database with only the historical baseline and manual migrations');
  const email = `migration-${crypto.randomUUID()}@example.test`;
  const [sentinel] = await sql`INSERT INTO users (name, email, password) VALUES ('Migration sentinel', ${email}, 'test-only') RETURNING id`;
  const statements = readFileSync('drizzle/0032_current_schema_reconciliation.sql', 'utf8').split('--> statement-breakpoint').filter(row => row.trim());
  await sql.begin(async tx => { for (const statement of statements) await tx.unsafe(statement); });
  const [preserved] = await sql`SELECT id FROM users WHERE email=${email}`;
  if (preserved?.id !== sentinel.id) throw new Error('Existing data was not preserved');
  const [stepTable] = await sql`SELECT to_regclass('public.workflow_run_steps') AS name`;
  if (!stepTable.name) throw new Error('Workflow step table is missing after upgrade');
  await sql`DELETE FROM users WHERE id=${sentinel.id}`;
  console.log(JSON.stringify({ upgraded: true, preservedExistingRow: true, statements: statements.length }));
} finally { await sql.end(); }
