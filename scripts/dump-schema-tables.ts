/**
 * One-shot helper to regenerate the EXPECTED_TABLE_NAMES snapshot used in
 * tests/unit/db-schema-export-parity.test.ts. Not intended to ship as a CLI.
 *
 * Run from repo root:
 *   bunx tsx scripts/dump-schema-tables.ts
 */
import * as Schema from '@/lib/db/schema';
import { getTableName, isTable } from 'drizzle-orm';

const result: Record<string, string> = {};
for (const [exportName, value] of Object.entries(Schema as Record<string, unknown>)) {
  if (value && typeof value === 'object' && isTable(value)) {
    result[exportName] = getTableName(value);
  }
}

const sorted = Object.fromEntries(
  Object.entries(result).sort(([a], [b]) => a.localeCompare(b))
);
console.log(JSON.stringify(sorted, null, 2));
