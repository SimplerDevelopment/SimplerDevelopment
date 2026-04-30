/**
 * Derived enrichment passes that don't need any HTTP — they roll up data
 * we already collected during the AAML/Justia/firm-site crawls into
 * filterable CRM fields and tags.
 *
 *   Pass 1: AAML Affiliation per firm (No fellows / One / Multiple)
 *   Pass 2: Firm Size per firm (Solo / 2–5 / 6–20 / 21–50 / 51+)
 *   Pass 3: Propagate firm-level signal flags to per-attorney practice tags
 *           (HNW Divorce Focus, Crypto, Forensic, Family Business, Mediation)
 *   Pass 4: Backfill State: XX tag on contacts whose address is a state code
 *           or whose firm address contains a state.
 *
 * Idempotent — re-running is safe and produces a clean diff.
 *
 *   npx tsx scripts/migrations/crosscap/enrich-derived.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const STATE_ABBR = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
  'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR',
  'PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]);

// State name → abbreviation for parsing free-form firm addresses.
const STATE_NAME_TO_ABBR: Record<string, string> = {
  Alabama:'AL', Alaska:'AK', Arizona:'AZ', Arkansas:'AR', California:'CA', Colorado:'CO',
  Connecticut:'CT', Delaware:'DE', Florida:'FL', Georgia:'GA', Hawaii:'HI', Idaho:'ID',
  Illinois:'IL', Indiana:'IN', Iowa:'IA', Kansas:'KS', Kentucky:'KY', Louisiana:'LA', Maine:'ME',
  Maryland:'MD', Massachusetts:'MA', Michigan:'MI', Minnesota:'MN', Mississippi:'MS', Missouri:'MO',
  Montana:'MT', Nebraska:'NE', Nevada:'NV', 'New Hampshire':'NH', 'New Jersey':'NJ', 'New Mexico':'NM',
  'New York':'NY', 'North Carolina':'NC', 'North Dakota':'ND', Ohio:'OH', Oklahoma:'OK', Oregon:'OR',
  Pennsylvania:'PA', 'Rhode Island':'RI', 'South Carolina':'SC', 'South Dakota':'SD', Tennessee:'TN',
  Texas:'TX', Utah:'UT', Vermont:'VT', Virginia:'VA', Washington:'WA', 'West Virginia':'WV',
  Wisconsin:'WI', Wyoming:'WY', 'District of Columbia':'DC',
};

function extractState(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const trimmed = addr.trim();
  if (/^[A-Z]{2}$/.test(trimmed) && STATE_ABBR.has(trimmed)) return trimmed;
  // Pattern: ", PA 19103" or " PA 19103"
  const m = trimmed.match(/[,\s]([A-Z]{2})\s+\d{5}/);
  if (m && STATE_ABBR.has(m[1])) return m[1];
  // Pattern: full state name, e.g., "Philadelphia, Pennsylvania"
  for (const [name, abbr] of Object.entries(STATE_NAME_TO_ABBR)) {
    if (new RegExp(`\\b${name}\\b`).test(trimmed)) return abbr;
  }
  return null;
}

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmCompanies, crmContacts, crmCustomFields, crmCustomFieldValues, crmTags, crmContactTags } =
    await import('../../../lib/db/schema');
  const { and, eq, sql, inArray } = await import('drizzle-orm');

  // ── Lookup helpers ────────────────────────────────────────────────
  const allFields = await db.select().from(crmCustomFields).where(eq(crmCustomFields.clientId, clientId));
  function fieldId(entity: 'company' | 'contact', name: string): number | undefined {
    return allFields.find(f => f.entityType === entity && f.fieldName === name)?.id;
  }

  async function upsertField(entityType: 'company' | 'contact', entityId: number, fieldNm: string, value: string) {
    const id = fieldId(entityType, fieldNm);
    if (!id) return false;
    const [existing] = await db.select().from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, id),
      eq(crmCustomFieldValues.entityId, entityId),
      eq(crmCustomFieldValues.entityType, entityType),
    )).limit(1);
    if (existing) {
      if (existing.value === value) return false;
      await db.update(crmCustomFieldValues).set({ value, updatedAt: new Date() }).where(eq(crmCustomFieldValues.id, existing.id));
      return true;
    }
    await db.insert(crmCustomFieldValues).values({ customFieldId: id, entityId, entityType, value });
    return true;
  }

  const allTags = await db.select().from(crmTags).where(eq(crmTags.clientId, clientId));
  const tagId = (name: string) => allTags.find(t => t.name === name)?.id;

  async function attachTag(contactId: number, tagName: string): Promise<boolean> {
    const tid = tagId(tagName);
    if (!tid) return false;
    const [existing] = await db.select().from(crmContactTags)
      .where(and(eq(crmContactTags.contactId, contactId), eq(crmContactTags.tagId, tid))).limit(1);
    if (existing) return false;
    await db.insert(crmContactTags).values({ contactId, tagId: tid });
    return true;
  }

  // ── Pre-load firms + contacts in bulk ────────────────────────────
  const firms = await db.select().from(crmCompanies).where(eq(crmCompanies.clientId, clientId));
  const contacts = await db.select().from(crmContacts).where(eq(crmContacts.clientId, clientId));
  const contactsByFirm = new Map<number, typeof contacts>();
  for (const c of contacts) {
    if (!c.companyId) continue;
    let arr = contactsByFirm.get(c.companyId);
    if (!arr) { arr = []; contactsByFirm.set(c.companyId, arr); }
    arr.push(c);
  }
  console.log(`Firms: ${firms.length} | Contacts: ${contacts.length}\n`);

  // ── Pre-load all relevant company custom-field values into memory ─
  // We need: HNW Divorce Focus, Crypto-Asset Experience, Family Business / Closely-Held Assets,
  // CDFA on Staff, Forensic Accountant in Network, Mediation / Collaborative Practice
  const SIGNAL_FIELDS = [
    'HNW Divorce Focus', 'Crypto-Asset Experience', 'Family Business / Closely-Held Assets',
    'CDFA on Staff', 'Forensic Accountant in Network', 'Mediation / Collaborative Practice',
  ];
  const signalFieldIds = SIGNAL_FIELDS.map(name => ({ name, id: fieldId('company', name)! })).filter(f => f.id);
  const signalValues = signalFieldIds.length
    ? await db.select().from(crmCustomFieldValues).where(and(
        inArray(crmCustomFieldValues.customFieldId, signalFieldIds.map(f => f.id)),
        eq(crmCustomFieldValues.entityType, 'company'),
      ))
    : [];
  const signalsByFirm = new Map<number, Record<string, string>>();
  for (const v of signalValues) {
    const fname = signalFieldIds.find(f => f.id === v.customFieldId)?.name;
    if (!fname) continue;
    let bag = signalsByFirm.get(v.entityId);
    if (!bag) { bag = {}; signalsByFirm.set(v.entityId, bag); }
    bag[fname] = v.value ?? '';
  }

  // ── Pass 1: AAML Affiliation ─────────────────────────────────────
  console.log('Pass 1: AAML Affiliation per firm');
  let p1Set = 0;
  for (const f of firms) {
    const peers = contactsByFirm.get(f.id) ?? [];
    const aamlCount = peers.filter(c => c.source === 'aaml').length;
    const value = aamlCount === 0 ? 'No fellows'
                : aamlCount === 1 ? 'One AAML Fellow'
                                   : 'Multiple AAML Fellows';
    if (await upsertField('company', f.id, 'AAML Affiliation', value)) p1Set += 1;
  }
  console.log(`  → wrote/updated AAML Affiliation on ${p1Set} firms`);

  // ── Pass 2: Firm Size ────────────────────────────────────────────
  console.log('\nPass 2: Firm Size per firm');
  let p2Set = 0;
  for (const f of firms) {
    const n = (contactsByFirm.get(f.id) ?? []).length;
    if (n === 0) continue; // unknown — leave it alone
    const bucket =
      n === 1            ? 'Solo' :
      n <= 5             ? '2–5 attorneys' :
      n <= 20            ? '6–20 attorneys' :
      n <= 50            ? '21–50 attorneys' :
                            '51+ attorneys';
    if (await upsertField('company', f.id, 'Firm Size', bucket)) p2Set += 1;
  }
  console.log(`  → wrote/updated Firm Size on ${p2Set} firms`);

  // ── Pass 3: Propagate firm signals → attorney tags ───────────────
  console.log('\nPass 3: Propagate firm signals to attorney tags');
  // Mapping: which firm signal triggers which tag
  const SIGNAL_TO_TAG: Array<{ field: string; predicate: (v: string) => boolean; tag: string }> = [
    { field: 'HNW Divorce Focus',                       predicate: v => v === 'Primary focus' || v === 'Significant', tag: 'High-Net-Worth' },
    { field: 'Crypto-Asset Experience',                 predicate: v => v === 'Sophisticated' || v === 'Some',         tag: 'Crypto Asset Disputes' },
    { field: 'Family Business / Closely-Held Assets',   predicate: v => v === 'true',                                   tag: 'Business Valuation' },
    { field: 'Forensic Accountant in Network',          predicate: v => v === 'true',                                   tag: 'Forensic Accounting' },
    // Mediation and CDFA don't have direct practice tags in setup-crm.ts — skipped.
  ];
  const applicable = SIGNAL_TO_TAG.filter(s => tagId(s.tag));
  let p3Tags = 0, p3Contacts = 0;
  for (const f of firms) {
    const sig = signalsByFirm.get(f.id);
    if (!sig) continue;
    const peers = contactsByFirm.get(f.id) ?? [];
    if (peers.length === 0) continue;
    const tagsForFirm = applicable.filter(s => sig[s.field] && s.predicate(sig[s.field])).map(s => s.tag);
    if (tagsForFirm.length === 0) continue;
    for (const c of peers) {
      let attached = false;
      for (const t of tagsForFirm) {
        if (await attachTag(c.id, t)) { p3Tags += 1; attached = true; }
      }
      if (attached) p3Contacts += 1;
    }
  }
  console.log(`  → attached ${p3Tags} tags across ${p3Contacts} attorneys (signal → practice)`);

  // ── Pass 4: Backfill State tag on contacts ───────────────────────
  console.log('\nPass 4: Backfill State: XX tag on contacts');
  // Index existing contact_tags by contactId so we don't re-query per contact
  const allContactTagRows = await db.select().from(crmContactTags);
  const tagsByContact = new Map<number, Set<number>>();
  for (const r of allContactTagRows) {
    let s = tagsByContact.get(r.contactId);
    if (!s) { s = new Set(); tagsByContact.set(r.contactId, s); }
    s.add(r.tagId);
  }
  // Pre-resolve State tag ids
  const stateTagIds = new Map<string, number>();
  for (const t of allTags) {
    const m = t.name.match(/^State:\s*([A-Z]{2})$/);
    if (m) stateTagIds.set(m[1], t.id);
  }

  let p4Set = 0;
  for (const c of contacts) {
    // 1) State directly on contact.address (often "PA")
    let state = extractState(c.address);
    // 2) Else state from firm.address
    if (!state && c.companyId) {
      const firm = firms.find(f => f.id === c.companyId);
      if (firm) state = extractState(firm.address);
    }
    if (!state) continue;
    const stid = stateTagIds.get(state);
    if (!stid) continue;
    const existingSet = tagsByContact.get(c.id);
    if (existingSet?.has(stid)) continue;
    await db.insert(crmContactTags).values({ contactId: c.id, tagId: stid });
    if (existingSet) existingSet.add(stid); else tagsByContact.set(c.id, new Set([stid]));
    p4Set += 1;
  }
  console.log(`  → attached State tag on ${p4Set} contacts`);

  // ── Bonus: Family Law tag on every firm-site / justia contact (they're all family lawyers) ─
  console.log('\nPass 5: Family Law tag on all attorneys');
  const familyTagId = tagId('Family Law');
  let p5Set = 0;
  if (familyTagId) {
    for (const c of contacts) {
      const existingSet = tagsByContact.get(c.id);
      if (existingSet?.has(familyTagId)) continue;
      await db.insert(crmContactTags).values({ contactId: c.id, tagId: familyTagId });
      if (existingSet) existingSet.add(familyTagId); else tagsByContact.set(c.id, new Set([familyTagId]));
      p5Set += 1;
    }
  }
  console.log(`  → attached Family Law tag on ${p5Set} contacts`);

  // ── Recompute AAML Fellow boolean for any contact whose source = aaml but missing the field
  console.log('\nPass 6: AAML Fellow flag (defensive backfill)');
  const aamlFellowFid = fieldId('contact', 'AAML Fellow');
  let p6Set = 0;
  if (aamlFellowFid) {
    const existingRows = await db.select({ entityId: crmCustomFieldValues.entityId }).from(crmCustomFieldValues)
      .where(and(eq(crmCustomFieldValues.customFieldId, aamlFellowFid), eq(crmCustomFieldValues.entityType, 'contact')));
    const existingSet = new Set(existingRows.map(r => r.entityId));
    for (const c of contacts) {
      if (c.source !== 'aaml') continue;
      if (existingSet.has(c.id)) continue;
      await db.insert(crmCustomFieldValues).values({ customFieldId: aamlFellowFid, entityId: c.id, entityType: 'contact', value: 'true' });
      p6Set += 1;
    }
  }
  console.log(`  → set AAML Fellow=true on ${p6Set} additional contacts`);

  console.log('\n=== ENRICH-DERIVED DONE ===');
  console.log(`Pass 1 AAML Affiliation:   ${p1Set} firms`);
  console.log(`Pass 2 Firm Size:           ${p2Set} firms`);
  console.log(`Pass 3 Signal → tags:       ${p3Tags} tags / ${p3Contacts} contacts`);
  console.log(`Pass 4 State tag:           ${p4Set} contacts`);
  console.log(`Pass 5 Family Law tag:      ${p5Set} contacts`);
  console.log(`Pass 6 AAML Fellow flag:    ${p6Set} contacts`);
  void sql;
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
