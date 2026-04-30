/**
 * Identify and merge duplicate firms within the same client.
 *
 * Dupes typically come from:
 *   • Inconsistent suffix punctuation: "Foo Law, LLC" vs "Foo Law LLC"
 *   • Trailing whitespace, ampersand vs "and", capitalization
 *   • Two harvesting passes producing two rows for the same firm
 *
 * Strategy:
 *   1. Normalize each firm name → lowercase, remove punctuation, collapse
 *      common suffixes (LLC/PLLC/PC/PA/Inc), squish whitespace.
 *   2. Group by normalized key. For groups with size >1:
 *      • keep the row with the most enrichment (most contacts, then most
 *        custom-field values, then lowest id)
 *      • re-point all crmContacts.companyId from dupes → keeper
 *      • move custom-field values from dupes → keeper if keeper lacks the
 *        field; else drop the dupe value
 *      • delete dupe rows
 *
 * Idempotent — re-runs on a clean DB do nothing.
 *
 *   npx tsx scripts/migrations/crosscap/dedup-firms.ts
 *   DRY_RUN=1 npx tsx scripts/migrations/crosscap/dedup-firms.ts   # report only
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const DRY_RUN = process.env.DRY_RUN === '1';

function normalizeFirmName(name: string): string {
  let n = name.toLowerCase().trim();
  // Remove punctuation
  n = n.replace(/[.,'"]/g, ' ');
  // Normalize ampersand
  n = n.replace(/\s*&\s*/g, ' and ');
  // Collapse whitespace
  n = n.replace(/\s+/g, ' ');
  // Strip common suffixes (LLC, PLLC, PC, PA, Inc, LLP, P.A., L.L.C., P.L.L.C.)
  n = n.replace(/\b(?:llc|pllc|p l l c|p\.?l\.?l\.?c\.?|pc|p\.?c\.?|pa|p\.?a\.?|llp|inc|incorporated|professional corporation|professional association|attorneys at law|law offices?|esq|esqs|esquire|p\.?l\.?l\.?p\.?)\b/g, '');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmCompanies, crmContacts, crmCustomFieldValues } = await import('../../../lib/db/schema');
  const { and, eq, inArray, sql } = await import('drizzle-orm');

  const firms = await db.select().from(crmCompanies).where(eq(crmCompanies.clientId, clientId));
  console.log(`Total firms: ${firms.length}`);

  // Group by normalized name
  const groups = new Map<string, typeof firms>();
  for (const f of firms) {
    const key = normalizeFirmName(f.name);
    if (!key) continue;
    let arr = groups.get(key);
    if (!arr) { arr = []; groups.set(key, arr); }
    arr.push(f);
  }

  const dupGroups = Array.from(groups.entries()).filter(([, arr]) => arr.length > 1);
  console.log(`Duplicate groups: ${dupGroups.length}\n`);

  if (dupGroups.length === 0) { console.log('No duplicates found.'); process.exit(0); }

  // For ranking: count contacts and custom-field values per firm
  const allContacts = await db.select({ id: crmContacts.id, companyId: crmContacts.companyId }).from(crmContacts).where(eq(crmContacts.clientId, clientId));
  const contactCount = new Map<number, number>();
  for (const c of allContacts) {
    if (!c.companyId) continue;
    contactCount.set(c.companyId, (contactCount.get(c.companyId) ?? 0) + 1);
  }
  const allFieldVals = await db.select({ id: crmCustomFieldValues.id, customFieldId: crmCustomFieldValues.customFieldId, entityId: crmCustomFieldValues.entityId, entityType: crmCustomFieldValues.entityType, value: crmCustomFieldValues.value })
    .from(crmCustomFieldValues).where(eq(crmCustomFieldValues.entityType, 'company'));
  const fieldValCount = new Map<number, number>();
  for (const fv of allFieldVals) fieldValCount.set(fv.entityId, (fieldValCount.get(fv.entityId) ?? 0) + 1);

  let merged = 0, contactsRepointed = 0, fieldValsMoved = 0, fieldValsDropped = 0, dupesDeleted = 0;

  for (const [key, dups] of dupGroups) {
    // Score: contactCount * 1000 + fieldValCount * 10 + (-id) ... lower id wins ties
    const ranked = dups.slice().sort((a, b) => {
      const scoreA = (contactCount.get(a.id) ?? 0) * 1000 + (fieldValCount.get(a.id) ?? 0) * 10 - a.id * 0.0001;
      const scoreB = (contactCount.get(b.id) ?? 0) * 1000 + (fieldValCount.get(b.id) ?? 0) * 10 - b.id * 0.0001;
      return scoreB - scoreA;
    });
    const keeper = ranked[0];
    const dupesToFold = ranked.slice(1);
    console.log(`group "${key}":`);
    console.log(`  keeper: id=${keeper.id} "${keeper.name}" contacts=${contactCount.get(keeper.id) ?? 0} fields=${fieldValCount.get(keeper.id) ?? 0}`);
    for (const d of dupesToFold) console.log(`  fold:   id=${d.id} "${d.name}" contacts=${contactCount.get(d.id) ?? 0} fields=${fieldValCount.get(d.id) ?? 0}`);

    if (DRY_RUN) continue;

    // Re-point contacts
    const dupIds = dupesToFold.map(d => d.id);
    const r = await db.update(crmContacts).set({ companyId: keeper.id, updatedAt: new Date() })
      .where(and(eq(crmContacts.clientId, clientId), inArray(crmContacts.companyId, dupIds)))
      .returning({ id: crmContacts.id });
    contactsRepointed += r.length;

    // Merge custom-field values: each dupe value moves to keeper if keeper lacks the field, else dropped
    const keeperFields = new Set(allFieldVals.filter(v => v.entityId === keeper.id).map(v => v.customFieldId));
    for (const d of dupesToFold) {
      const dupeValues = allFieldVals.filter(v => v.entityId === d.id);
      for (const v of dupeValues) {
        if (!keeperFields.has(v.customFieldId)) {
          // Move to keeper
          await db.update(crmCustomFieldValues).set({ entityId: keeper.id, updatedAt: new Date() }).where(eq(crmCustomFieldValues.id, v.id));
          keeperFields.add(v.customFieldId);
          fieldValsMoved += 1;
        } else {
          // Drop
          await db.delete(crmCustomFieldValues).where(eq(crmCustomFieldValues.id, v.id));
          fieldValsDropped += 1;
        }
      }
    }

    // Merge keeper data with dupes (fill any blanks on keeper from any dupe)
    const updates: Partial<typeof crmCompanies.$inferInsert> = {};
    for (const d of dupesToFold) {
      if (!keeper.website && d.website) { updates.website = d.website; (keeper as { website: string | null }).website = d.website; }
      if (!keeper.phone && d.phone)     { updates.phone = d.phone; (keeper as { phone: string | null }).phone = d.phone; }
      if (!keeper.address && d.address) { updates.address = d.address; (keeper as { address: string | null }).address = d.address; }
      if (!keeper.linkedinUrl && d.linkedinUrl) { updates.linkedinUrl = d.linkedinUrl; (keeper as { linkedinUrl: string | null }).linkedinUrl = d.linkedinUrl; }
      if (!keeper.twitterUrl && d.twitterUrl)   { updates.twitterUrl = d.twitterUrl; (keeper as { twitterUrl: string | null }).twitterUrl = d.twitterUrl; }
      if (!keeper.facebookUrl && d.facebookUrl) { updates.facebookUrl = d.facebookUrl; (keeper as { facebookUrl: string | null }).facebookUrl = d.facebookUrl; }
      if (!keeper.domain && d.domain) { updates.domain = d.domain; (keeper as { domain: string | null }).domain = d.domain; }
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(crmCompanies).set(updates).where(eq(crmCompanies.id, keeper.id));
    }

    // Delete dupes
    await db.delete(crmCompanies).where(inArray(crmCompanies.id, dupIds));
    dupesDeleted += dupIds.length;
    merged += 1;
  }

  console.log(`\n=== DEDUP DONE${DRY_RUN ? ' (DRY RUN)' : ''} ===`);
  console.log(`Groups merged:           ${merged}`);
  console.log(`Dup firms deleted:       ${dupesDeleted}`);
  console.log(`Contacts re-pointed:     ${contactsRepointed}`);
  console.log(`Custom-field values moved: ${fieldValsMoved}`);
  console.log(`Custom-field values dropped: ${fieldValsDropped}`);
  void sql;
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
