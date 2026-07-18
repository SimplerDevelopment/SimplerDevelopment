import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('[manual-migrations] DATABASE_URL is not set.');
  process.exit(1);
}

const drizzleDir = join(process.cwd(), 'drizzle');
const files = readdirSync(drizzleDir)
  .filter((file) => /^(900\d|9999).*\.sql$/.test(file))
  .sort();

if (files.length === 0) {
  console.log('[manual-migrations] no unjournaled manual migrations found.');
  process.exit(0);
}

const sql = postgres(databaseUrl, {
  max: 1,
  onnotice: () => {
    // These migrations are idempotent and PostgreSQL emits expected
    // "already exists" notices on every subsequent local boot.
  },
});

try {
  for (const file of files) {
    const path = join(drizzleDir, file);
    console.log(`[manual-migrations] applying ${file}`);
    await sql.unsafe(readFileSync(path, 'utf8'));
  }
  console.log(`[manual-migrations] applied ${files.length} file(s).`);
} finally {
  await sql.end();
}
