#!/usr/bin/env bun
/**
 * Compares drizzle/meta/_journal.json (the on-disk migration set this
 * project expects to be applied) with the prod __drizzle_migrations
 * tracker table.
 *
 * Reports:
 *   - migrations present on disk but missing from the DB tracker
 *   - tracker rows with no matching disk migration (rogue / hand-applied)
 *   - count + last-applied timestamp summary
 *
 * Exit codes:
 *   0  in sync
 *   1  drift detected
 *   2  configuration error (no DATABASE_URL, etc.)
 *
 * Used by .github/workflows/sd2026-drizzle-drift.yml (daily).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. In CI this should be DATABASE_URL_READONLY.');
  process.exit(2);
}

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

type Journal = {
  version: string;
  dialect: string;
  entries: JournalEntry[];
};

const drizzleDir = path.join(process.cwd(), 'drizzle');
const journalPath = path.join(drizzleDir, 'meta', '_journal.json');

if (!fs.existsSync(journalPath)) {
  console.error(`Missing ${journalPath} — run from simplerdevelopment2026/.`);
  process.exit(2);
}

const journal: Journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

// Drizzle hashes the SQL file *content* with SHA-256 to produce the row's
// hash column. Match by hash so renames or out-of-order tags still align.
const diskByHash = new Map<string, JournalEntry>();
for (const entry of journal.entries) {
  const sqlPath = path.join(drizzleDir, `${entry.tag}.sql`);
  if (!fs.existsSync(sqlPath)) {
    console.error(`Journal references missing SQL file: ${entry.tag}.sql`);
    process.exit(2);
  }
  const content = fs.readFileSync(sqlPath, 'utf8');
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  diskByHash.set(hash, entry);
}

const sql = postgres(DATABASE_URL, { max: 1, idle_timeout: 5 });

try {
  const rows = await sql<{ id: number; hash: string; created_at: string }[]>`
    SELECT id, hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY id ASC
  `;

  const dbByHash = new Map<string, { id: number; created_at: string }>();
  for (const row of rows) {
    dbByHash.set(row.hash, { id: row.id, created_at: row.created_at });
  }

  const missingOnProd: JournalEntry[] = [];
  for (const [hash, entry] of diskByHash) {
    if (!dbByHash.has(hash)) missingOnProd.push(entry);
  }

  const rogueOnProd: { hash: string; id: number; created_at: string }[] = [];
  for (const [hash, row] of dbByHash) {
    if (!diskByHash.has(hash)) rogueOnProd.push({ hash, ...row });
  }

  const lastApplied = rows[rows.length - 1];
  const lastJournal = journal.entries[journal.entries.length - 1];

  console.log(`Disk journal entries:  ${journal.entries.length}`);
  console.log(`DB tracker rows:       ${rows.length}`);
  console.log(`Last journal tag:      ${lastJournal?.tag ?? '(none)'}`);
  console.log(`Last DB applied at:    ${lastApplied?.created_at ?? '(none)'}`);

  let drifted = false;
  if (missingOnProd.length > 0) {
    drifted = true;
    console.log('');
    console.log(`Missing on prod (${missingOnProd.length}):`);
    for (const e of missingOnProd) console.log(`  - ${e.tag}`);
  }
  if (rogueOnProd.length > 0) {
    drifted = true;
    console.log('');
    console.log(`Rogue tracker rows on prod (${rogueOnProd.length}):`);
    for (const r of rogueOnProd) {
      console.log(`  - id=${r.id} hash=${r.hash.slice(0, 12)}… applied=${r.created_at}`);
    }
  }

  if (drifted) {
    console.log('');
    console.log('::error::Drizzle tracker drift detected.');
    process.exit(1);
  }

  console.log('');
  console.log('In sync — disk journal matches prod tracker.');
} finally {
  await sql.end({ timeout: 5 });
}
