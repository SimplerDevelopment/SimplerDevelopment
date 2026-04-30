/**
 * Identify and merge duplicate attorneys harvested from multiple sources.
 *
 * Common case: same attorney appears in AAML directory and Justia listing.
 * Detection: same client + same first+last name (case/whitespace-insensitive)
 * AND (same firm OR same email).
 *
 * Strategy:
 *   • Group by (lower(firstName), lower(lastName))
 *   • Within group, sub-group by companyId (when both sides have one) or by email
 *   • For each sub-group with size > 1, pick the keeper (richer data wins) and
 *     fold dupes:
 *       - Move tags to keeper
 *       - Fill blank fields on keeper from dupes
 *       - Append dupe notes
 *       - Move custom-field values where keeper lacks them; drop otherwise
 *       - Delete dupe contact rows
 *
 * Idempotent.
 *
 *   DRY_RUN=1 npx tsx scripts/migrations/crosscap/dedup-contacts.ts   # preview
 *   npx tsx scripts/migrations/crosscap/dedup-contacts.ts             # execute
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });
const DRY_RUN = process.env.DRY_RUN === '1';

function normName(s: string | null): string {
  return (s ?? '').toLowerCase().replace(/[.,'"-]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmContacts, crmContactTags, crmCustomFieldValues } = await import('../../../lib/db/schema');
  const { and, eq, inArray } = await import('drizzle-orm');

  const contacts = await db.select().from(crmContacts).where(eq(crmContacts.clientId, clientId));
  console.log(`Total contacts: ${contacts.length}`);

  const allTagLinks = await db.select().from(crmContactTags);
  const tagsByContact = new Map<number, number[]>();
  for (const t of allTagLinks) {
    let arr = tagsByContact.get(t.contactId);
    if (!arr) { arr = []; tagsByContact.set(t.contactId, arr); }
    arr.push(t.tagId);
  }
  const allFieldVals = await db.select().from(crmCustomFieldValues).where(eq(crmCustomFieldValues.entityType, 'contact'));
  const fvByContact = new Map<number, typeof allFieldVals>();
  for (const v of allFieldVals) {
    let arr = fvByContact.get(v.entityId);
    if (!arr) { arr = []; fvByContact.set(v.entityId, arr); }
    arr.push(v);
  }

  // Group by (firstNormalized || lastNormalized)
  const byName = new Map<string, typeof contacts>();
  for (const c of contacts) {
    const k = `${normName(c.firstName)}||${normName(c.lastName)}`;
    if (k === '||') continue;
    let arr = byName.get(k);
    if (!arr) { arr = []; byName.set(k, arr); }
    arr.push(c);
  }

  // For groups with 2+, sub-group by firm or email
  type Pair = { keeper: typeof contacts[number]; dupes: typeof contacts };
  const merges: Pair[] = [];
  for (const [, arr] of byName) {
    if (arr.length < 2) continue;
    // Sub-group by firm (companyId) — but only when companyId is set
    const sub = new Map<string, typeof contacts>();
    for (const c of arr) {
      const key = c.companyId ? `firm:${c.companyId}` : c.email ? `email:${c.email}` : `single:${c.id}`;
      let s = sub.get(key);
      if (!s) { s = []; sub.set(key, s); }
      s.push(c);
    }
    for (const [, group] of sub) {
      if (group.length < 2) continue;
      // Score: more tags + more fields + has email > has phone > has linkedin > lower id
      const ranked = group.slice().sort((a, b) => {
        const sA = (tagsByContact.get(a.id)?.length ?? 0) * 10
                 + (fvByContact.get(a.id)?.length ?? 0) * 5
                 + (a.email ? 8 : 0) + (a.phone ? 4 : 0) + (a.linkedinUrl ? 2 : 0)
                 - a.id * 0.0001;
        const sB = (tagsByContact.get(b.id)?.length ?? 0) * 10
                 + (fvByContact.get(b.id)?.length ?? 0) * 5
                 + (b.email ? 8 : 0) + (b.phone ? 4 : 0) + (b.linkedinUrl ? 2 : 0)
                 - b.id * 0.0001;
        return sB - sA;
      });
      merges.push({ keeper: ranked[0], dupes: ranked.slice(1) });
    }
  }

  console.log(`Duplicate groups found: ${merges.length}`);
  if (merges.length === 0) { console.log('Nothing to dedup.'); process.exit(0); }

  let foldedRows = 0, tagsMoved = 0, fieldsMoved = 0, fieldsDropped = 0;
  for (const { keeper, dupes } of merges) {
    if (DRY_RUN) {
      console.log(`KEEP id=${keeper.id} ${keeper.firstName} ${keeper.lastName} src=${keeper.source} co=${keeper.companyId} email=${keeper.email ? 'Y' : 'N'} phone=${keeper.phone ? 'Y' : 'N'}`);
      for (const d of dupes) {
        console.log(`FOLD id=${d.id} src=${d.source} co=${d.companyId} email=${d.email ? 'Y' : 'N'} phone=${d.phone ? 'Y' : 'N'}`);
      }
      continue;
    }

    const dupeIds = dupes.map(d => d.id);

    // Fill blank fields on keeper
    const updates: Partial<typeof crmContacts.$inferInsert> = {};
    let combinedNotes = keeper.notes ?? '';
    for (const d of dupes) {
      if (!keeper.email       && d.email)       { updates.email       = d.email;       (keeper as { email: string | null }).email       = d.email; }
      if (!keeper.phone       && d.phone)       { updates.phone       = d.phone;       (keeper as { phone: string | null }).phone       = d.phone; }
      if (!keeper.linkedinUrl && d.linkedinUrl) { updates.linkedinUrl = d.linkedinUrl; (keeper as { linkedinUrl: string | null }).linkedinUrl = d.linkedinUrl; }
      if (!keeper.address     && d.address)     { updates.address     = d.address;     (keeper as { address: string | null }).address     = d.address; }
      if (!keeper.title       && d.title)       { updates.title       = d.title;       (keeper as { title: string | null }).title       = d.title; }
      if (d.notes && !combinedNotes.includes(d.notes.slice(0, 80))) {
        combinedNotes += `\n— Merged from contact id ${d.id} (source ${d.source ?? 'unknown'}) —\n${d.notes}`;
      }
    }
    if (combinedNotes !== (keeper.notes ?? '')) updates.notes = combinedNotes;
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(crmContacts).set(updates).where(eq(crmContacts.id, keeper.id));
    }

    // Move tags from dupes to keeper (skip duplicates)
    const keeperTags = new Set(tagsByContact.get(keeper.id) ?? []);
    for (const d of dupes) {
      const dTags = tagsByContact.get(d.id) ?? [];
      for (const tid of dTags) {
        if (keeperTags.has(tid)) continue;
        await db.insert(crmContactTags).values({ contactId: keeper.id, tagId: tid });
        keeperTags.add(tid);
        tagsMoved += 1;
      }
    }
    // Delete dupe tag links (will cascade when contacts are deleted, but be explicit)
    if (dupeIds.length > 0) {
      await db.delete(crmContactTags).where(inArray(crmContactTags.contactId, dupeIds));
    }

    // Move custom field values
    const keeperFields = new Set((fvByContact.get(keeper.id) ?? []).map(v => v.customFieldId));
    for (const d of dupes) {
      const dVals = fvByContact.get(d.id) ?? [];
      for (const v of dVals) {
        if (!keeperFields.has(v.customFieldId)) {
          await db.update(crmCustomFieldValues).set({ entityId: keeper.id, updatedAt: new Date() }).where(eq(crmCustomFieldValues.id, v.id));
          keeperFields.add(v.customFieldId);
          fieldsMoved += 1;
        } else {
          await db.delete(crmCustomFieldValues).where(eq(crmCustomFieldValues.id, v.id));
          fieldsDropped += 1;
        }
      }
    }

    // Delete dupe contacts
    await db.delete(crmContacts).where(inArray(crmContacts.id, dupeIds));
    foldedRows += dupeIds.length;
  }

  console.log(`\n=== CONTACT DEDUP DONE${DRY_RUN ? ' (DRY RUN)' : ''} ===`);
  console.log(`Groups merged:          ${merges.length}`);
  console.log(`Contacts deleted:       ${foldedRows}`);
  console.log(`Tags moved:             ${tagsMoved}`);
  console.log(`Custom fields moved:    ${fieldsMoved}`);
  console.log(`Custom fields dropped:  ${fieldsDropped}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
