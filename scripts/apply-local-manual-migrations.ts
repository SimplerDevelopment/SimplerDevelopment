import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('[manual-migrations] DATABASE_URL is not set.');
  process.exit(1);
}

// Any 9xxx-numbered manual migration. This used to be /^(900\d|9999)/, which
// matched 9000-9009 and special-cased 9999 — so the moment the series reached
// 9010 every subsequent migration was silently skipped on every local dev
// environment (9010 type-align, 9011, 9012, 9013 pathviz, 9014 agent_flows all
// went unapplied, and the Workflow Designer 500'd locally on a missing table).
// Silent because the loop just never saw the files: no error, no warning.
// Zero-padded 4-digit prefixes sort correctly under a plain lexicographic
// .sort(), so ordering still holds as the series grows.
const drizzleDir = join(process.cwd(), 'drizzle');
const files = readdirSync(drizzleDir)
  .filter((file) => /^9\d{3}.*\.sql$/.test(file))
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
