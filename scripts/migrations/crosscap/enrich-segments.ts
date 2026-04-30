/**
 * Compute outreach-segment fields and tags from already-collected signals.
 *
 *   1. Best Outreach Channel — derive from what we have on the contact:
 *        Email > Phone > LinkedIn > unknown
 *   2. "Tier 1 Prospect" tag — attorneys at firms whose practice profile
 *      strongly aligns with Crossover's wedge (HNW divorce + complex assets +
 *      AAML credential). This is a research-derived shortlist, not a
 *      reply-derived score, so it lives as a tag, not as crm_contacts.score
 *      (per RESEARCH.md).
 *
 * Tier-1 criteria (any 2 of):
 *   • AAML Fellow
 *   • Firm HNW Divorce Focus = Primary focus | Significant
 *   • Firm Family Business / Closely-Held Assets = true
 *   • Firm Crypto-Asset Experience = Sophisticated | Some
 *   • Firm Forensic Accountant in Network = true
 * AND must have at least one outreach channel (email, phone, or LinkedIn).
 *
 *   npx tsx scripts/migrations/crosscap/enrich-segments.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const TIER1_TAG_NAME = 'Tier 1 Prospect';
const TIER1_TAG_COLOR = '#cfa122'; // Crossover gold

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmContacts, crmCustomFields, crmCustomFieldValues, crmTags, crmContactTags } = await import('../../../lib/db/schema');
  const { and, eq, inArray } = await import('drizzle-orm');

  const fields = await db.select().from(crmCustomFields).where(eq(crmCustomFields.clientId, clientId));
  const fid = (entity: 'company' | 'contact', name: string) =>
    fields.find(f => f.entityType === entity && f.fieldName === name)?.id;

  const channelFid = fid('contact', 'Best Outreach Channel');
  if (!channelFid) { console.log('Best Outreach Channel field missing — abort'); process.exit(1); }

  // Tag: ensure the Tier-1 tag exists
  let [tier1Tag] = await db.select().from(crmTags).where(and(eq(crmTags.clientId, clientId), eq(crmTags.name, TIER1_TAG_NAME))).limit(1);
  if (!tier1Tag) {
    [tier1Tag] = await db.insert(crmTags).values({ clientId, name: TIER1_TAG_NAME, color: TIER1_TAG_COLOR }).returning();
    console.log(`Created tag "${TIER1_TAG_NAME}" id=${tier1Tag.id}`);
  } else {
    console.log(`Tag "${TIER1_TAG_NAME}" exists id=${tier1Tag.id}`);
  }

  // Pre-load contacts
  const contacts = await db.select().from(crmContacts).where(eq(crmContacts.clientId, clientId));
  console.log(`Contacts: ${contacts.length}`);

  // Pre-load existing channel field values
  const existingChannelRows = await db.select().from(crmCustomFieldValues).where(and(
    eq(crmCustomFieldValues.customFieldId, channelFid),
    eq(crmCustomFieldValues.entityType, 'contact'),
  ));
  const existingChannel = new Map(existingChannelRows.map(r => [r.entityId, r.value]));

  // Pre-load existing contact tags
  const allCT = await db.select().from(crmContactTags);
  const tagsByContact = new Map<number, Set<number>>();
  for (const r of allCT) {
    let s = tagsByContact.get(r.contactId);
    if (!s) { s = new Set(); tagsByContact.set(r.contactId, s); }
    s.add(r.tagId);
  }

  // Pre-load firm signals
  const SIGNAL_FIELDS = ['HNW Divorce Focus','Crypto-Asset Experience','Family Business / Closely-Held Assets','Forensic Accountant in Network'];
  const signalIds = SIGNAL_FIELDS.map(n => fid('company', n)).filter((x): x is number => !!x);
  const signalRows = signalIds.length
    ? await db.select().from(crmCustomFieldValues).where(and(
        inArray(crmCustomFieldValues.customFieldId, signalIds),
        eq(crmCustomFieldValues.entityType, 'company'),
      ))
    : [];
  const signalsByFirm = new Map<number, Record<string, string>>();
  const fieldNameById: Record<number, string> = {};
  for (const f of fields) fieldNameById[f.id] = f.fieldName;
  for (const r of signalRows) {
    let bag = signalsByFirm.get(r.entityId);
    if (!bag) { bag = {}; signalsByFirm.set(r.entityId, bag); }
    bag[fieldNameById[r.customFieldId]] = r.value ?? '';
  }

  // AAML Fellow lookup per contact
  const aamlFid = fid('contact', 'AAML Fellow');
  let aamlFellowSet = new Set<number>();
  if (aamlFid) {
    const rows = await db.select({ entityId: crmCustomFieldValues.entityId }).from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, aamlFid),
      eq(crmCustomFieldValues.entityType, 'contact'),
      eq(crmCustomFieldValues.value, 'true'),
    ));
    aamlFellowSet = new Set(rows.map(r => r.entityId));
  }

  // ── Pass 1: Best Outreach Channel ───────────────────────────────
  let chSet = 0;
  for (const c of contacts) {
    let val: string | null = null;
    if (c.email)            val = 'Email';
    else if (c.phone)       val = 'Phone';
    else if (c.linkedinUrl) val = 'LinkedIn';
    if (!val) continue;
    if (existingChannel.get(c.id) === val) continue;
    if (existingChannel.has(c.id)) {
      // update
      await db.update(crmCustomFieldValues).set({ value: val, updatedAt: new Date() })
        .where(and(eq(crmCustomFieldValues.customFieldId, channelFid), eq(crmCustomFieldValues.entityId, c.id), eq(crmCustomFieldValues.entityType, 'contact')));
    } else {
      await db.insert(crmCustomFieldValues).values({ customFieldId: channelFid, entityId: c.id, entityType: 'contact', value: val });
    }
    chSet += 1;
  }
  console.log(`  → wrote/updated Best Outreach Channel on ${chSet} contacts`);

  // ── Pass 2: Tier 1 Prospect tag ─────────────────────────────────
  let t1Set = 0, t1Considered = 0;
  for (const c of contacts) {
    const hasOutreach = !!(c.email || c.phone || c.linkedinUrl);
    if (!hasOutreach) continue;
    t1Considered += 1;

    let signals = 0;
    if (aamlFellowSet.has(c.id)) signals += 1;
    const sig = c.companyId ? signalsByFirm.get(c.companyId) ?? {} : {};
    if (sig['HNW Divorce Focus'] === 'Primary focus' || sig['HNW Divorce Focus'] === 'Significant') signals += 1;
    if (sig['Family Business / Closely-Held Assets'] === 'true') signals += 1;
    if (sig['Crypto-Asset Experience'] === 'Sophisticated' || sig['Crypto-Asset Experience'] === 'Some') signals += 1;
    if (sig['Forensic Accountant in Network'] === 'true') signals += 1;

    if (signals < 2) continue;

    const existingSet = tagsByContact.get(c.id);
    if (existingSet?.has(tier1Tag.id)) continue;
    await db.insert(crmContactTags).values({ contactId: c.id, tagId: tier1Tag.id });
    if (existingSet) existingSet.add(tier1Tag.id); else tagsByContact.set(c.id, new Set([tier1Tag.id]));
    t1Set += 1;
  }
  console.log(`  → tagged ${t1Set} contacts as ${TIER1_TAG_NAME} (considered ${t1Considered} reachable contacts)`);

  console.log('\n=== ENRICH-SEGMENTS DONE ===');
  console.log(`Best Outreach Channel:  ${chSet}`);
  console.log(`Tier 1 Prospect tag:    ${t1Set}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
