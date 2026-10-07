// Generate a reconciliation with Drizzle's own diff engine against an isolated
// database containing the existing migrations. Never execute the diff here.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import * as schema from '../lib/db/schema';

const url = process.env.DRIZZLE_DATABASE_URL;
if (!url) throw new Error('Set DRIZZLE_DATABASE_URL to the isolated migration test database');
const target = new URL(url);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.includes('test')) {
  throw new Error('Reconciliation generation requires a local test database');
}
{
  // CLI pull preserves parameterized introspection queries (pushSchema in
  // drizzle-kit/api 0.31 loses their bindings). It only reads this database.
  const previous = JSON.parse(readFileSync('.qa-reports/migration-pull/meta/0000_snapshot.json', 'utf8'));
  const snapshot = generateDrizzleJson(schema, previous.id);
  const rootSnapshot = JSON.parse(readFileSync('drizzle/meta/0000_snapshot.json', 'utf8'));
  snapshot.prevId = rootSnapshot.id;
  // Reconcile missing objects only. Introspection normalizes existing index
  // expressions/defaults differently; replacing hundreds of live indexes or
  // changing historical data types is outside this repair. Preserve those
  // definitions and let Drizzle generate only genuinely additive statements.
  for (const [name, oldTable] of Object.entries(previous.tables) as Array<[string, (typeof snapshot.tables)[string]]>) {
    const current = snapshot.tables[name];
    if (!current) { snapshot.tables[name] = oldTable; continue; }
    const addedColumns = new Set(Object.keys(current.columns).filter(column => !oldTable.columns[column]));
    current.columns = { ...current.columns, ...oldTable.columns };
    // Postgres truncates identifiers at 63 bytes. Existing FK names in the TS
    // model can look absent even though their truncated constraint exists.
    const mediaLookupIndexes = new Set(['brain_notes_attachment_key_idx', 'brain_notes_attachment_url_idx', 'kanban_card_files_stored_filename_idx', 'kanban_card_files_url_idx']);
    const addedIndexes = Object.fromEntries(Object.entries(current.indexes).filter(([indexName, index]) =>
      mediaLookupIndexes.has(indexName) || index.columns.some(column => addedColumns.has(column.expression))));
    const addedKeys = Object.fromEntries(Object.entries(current.foreignKeys).filter(([, key]) =>
      key.columnsFrom.some(column => addedColumns.has(column))));
    current.indexes = { ...oldTable.indexes, ...addedIndexes };
    current.foreignKeys = { ...oldTable.foreignKeys, ...addedKeys };
    current.uniqueConstraints = oldTable.uniqueConstraints;
    current.checkConstraints = oldTable.checkConstraints;
    current.compositePrimaryKeys = oldTable.compositePrimaryKeys;
  }
  const statements = await generateMigration(previous, snapshot);
  if (statements.some(statement => /DROP\s+(?:TABLE|COLUMN|TYPE|SCHEMA)\b/i.test(statement))) {
    writeFileSync('.qa-reports/reconciliation-review.sql', statements.join('\n--> statement-breakpoint\n'));
    throw new Error('Destructive schema differences need explicit review; draft saved only');
  }
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
  journal.entries = journal.entries.filter((entry: { tag: string }) => !entry.tag.endsWith('_current_schema_reconciliation'));
  const manuals = readdirSync('drizzle').filter(f => /^9\d{3}.*\.sql$/.test(f)).sort();
  const existing = new Set(journal.entries.map((e: { tag: string }) => e.tag));
  for (const file of manuals) {
    const tag = file.slice(0, -4);
    if (existing.has(tag)) continue;
    const last = journal.entries.at(-1);
    journal.entries.push({ idx: journal.entries.length, version: '7', when: last.when + 1, tag, breakpoints: true });
  }
  const idx = journal.entries.length;
  const prefix = String(idx).padStart(4, '0');
  const tag = `${prefix}_current_schema_reconciliation`;
  writeFileSync(`drizzle/${tag}.sql`, statements.join('\n--> statement-breakpoint\n') + '\n');
  writeFileSync(`drizzle/meta/${prefix}_snapshot.json`, JSON.stringify(snapshot, null, 2) + '\n');
  journal.entries.push({ idx, version: '7', when: Math.max(Date.now(), journal.entries.at(-1).when + 1), tag, breakpoints: true });
  writeFileSync('drizzle/meta/_journal.json', JSON.stringify(journal, null, 2) + '\n');
  console.log(JSON.stringify({ tag, statements: statements.length }));
}
