/**
 * Fix the Cardiff survey's consent checkboxes (sms_consent + final_consent)
 * so they actually render a checkbox.
 *
 * The deployed SurveyFormInline.tsx renders checkbox fields by iterating
 * `field.options` — an empty options array silently renders nothing. Both
 * consent fields shipped with `options: []`. Giving each a single option
 * makes the renderer emit one checkbox with label "I agree" while keeping the
 * answer shape consistent with the rest of the survey (string[] with one
 * entry on submit).
 *
 * Applies the fix to BOTH the source-of-truth local dryrun DB AND metro
 * (production) so a re-migration doesn't reintroduce the bug.
 *
 * Idempotent.
 *
 * Run:  npx tsx scripts/migrations/cardiff/_fix-consent-checkboxes.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { readFileSync } from 'fs';
import postgres from 'postgres';

const SLUG = 'cardiff-business-apply';
const LOCAL_URL = 'postgresql://127.0.0.1/simplerdev_realprod_dryrun';

function metroUrl(): string {
  const env = readFileSync('.env.local', 'utf8');
  const line = env.split('\n').find((l) => /@metro\.proxy\.rlwy\.net/.test(l));
  if (!line) throw new Error('metro URL not found in .env.local');
  return line.replace(/^# */, '').split(' ')[0].replace(/^DATABASE_URL=/, '');
}

interface Field {
  id: string;
  type: string;
  label: string;
  options: unknown[];
  [k: string]: unknown;
}

function patch(fields: Field[]): { fields: Field[]; patched: string[] } {
  const patched: string[] = [];
  const next = fields.map((f) => {
    if (f.type !== 'checkbox') return f;
    if (Array.isArray(f.options) && f.options.length > 0) return f;
    patched.push(f.id);
    return { ...f, options: [{ value: 'yes', label: 'I agree' }] };
  });
  return { fields: next, patched };
}

async function fixOne(url: string, label: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    const [row] = await sql<Array<{ id: number; fields: Field[] }>>`
      SELECT id, fields FROM surveys WHERE slug = ${SLUG}
    `;
    if (!row) {
      console.log(`[${label}] no survey '${SLUG}' — skipping`);
      return;
    }
    const { fields, patched } = patch(row.fields);
    if (patched.length === 0) {
      console.log(`[${label}] all checkboxes already have options — no-op`);
      return;
    }
    await sql`
      UPDATE surveys
         SET fields = ${fields as object[]}::json,
             updated_at = now()
       WHERE id = ${row.id}
    `;
    console.log(`[${label}] patched checkbox fields: ${patched.join(', ')}`);
  } finally {
    await sql.end();
  }
}

async function main() {
  await fixOne(LOCAL_URL, 'local-dryrun');
  await fixOne(metroUrl(), 'metro');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
