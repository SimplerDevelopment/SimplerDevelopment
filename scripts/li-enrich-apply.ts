/**
 * Apply a results-N.json file to the DB — sets linkedin_url on matched rows ONLY.
 * Usage: npx tsx --env-file=.env scripts/li-enrich-apply.ts .planning/li-enrich/results-0.json
 *
 * Safety:
 *  - Only UPDATEs rows where clientId=100 AND linkedin_url IS NULL (skip rule).
 *  - Only UPDATEs rows with status="matched".
 *  - Logs every update and any row that was skipped because linkedin_url was already set.
 */
import { db } from '@/lib/db';
import { crmContacts } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import * as fs from 'node:fs';

const CLIENT_ID = 100;

type Result =
  | { id: number; status: 'matched'; linkedin_url: string; evidence?: string }
  | { id: number; status: 'skipped_ambiguous' | 'no_result'; reason?: string };

async function main() {
  const path = process.argv[2];
  if (!path) { console.error('usage: li-enrich-apply <results.json>'); process.exit(1); }
  const results: Result[] = JSON.parse(fs.readFileSync(path, 'utf8'));

  const matched = results.filter((r): r is Extract<Result, { status: 'matched' }> => r.status === 'matched');
  console.log(`Applying ${matched.length} matched rows from ${path}`);

  let updated = 0;
  let alreadyHad = 0;
  let notFound = 0;

  for (const r of matched) {
    const ret = await db
      .update(crmContacts)
      .set({ linkedinUrl: r.linkedin_url, updatedAt: new Date() })
      .where(and(
        eq(crmContacts.id, r.id),
        eq(crmContacts.clientId, CLIENT_ID),
        isNull(crmContacts.linkedinUrl),
      ))
      .returning({ id: crmContacts.id });
    if (ret.length === 1) {
      updated++;
      console.log(`  [OK] id=${r.id} -> ${r.linkedin_url}`);
    } else {
      // Either row doesn't exist under client 100, or it already had a linkedin_url (skip rule)
      const [existing] = await db.select({ id: crmContacts.id, linkedinUrl: crmContacts.linkedinUrl })
        .from(crmContacts).where(and(eq(crmContacts.id, r.id), eq(crmContacts.clientId, CLIENT_ID)));
      if (!existing) { notFound++; console.log(`  [SKIP:missing] id=${r.id}`); }
      else if (existing.linkedinUrl) { alreadyHad++; console.log(`  [SKIP:existing] id=${r.id} already had ${existing.linkedinUrl}`); }
      else { console.log(`  [SKIP:unknown] id=${r.id}`); }
    }
  }

  console.log(`\nSummary: updated=${updated} alreadyHad=${alreadyHad} notFound=${notFound} totalMatched=${matched.length}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
