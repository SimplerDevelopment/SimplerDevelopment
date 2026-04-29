/**
 * Define Cross Cap–specific CRM custom fields and backfill defaults from
 * what we already know.
 *
 * The fields are tailored to Crossover Capital's actual wedge:
 *   • divorce financial planning (CDFA® on staff)
 *   • family business / closely-held asset succession
 *   • cryptocurrency education for HNW investors
 *
 * → For COMPANIES (law firms) we want fast filters for HNW-divorce focus,
 *   crypto sophistication, whether they already have a CDFA, and where the
 *   relationship sits.
 * → For CONTACTS (attorneys) we want credential markers, the best channel
 *   to reach them, and whether they'd open the door to joint education /
 *   crypto education for their HNW clients.
 *
 * Idempotent: re-runs upsert by (clientId, entityType, fieldName).
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

type FieldType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'url' | 'email' | 'phone' | 'boolean';
interface FieldDef {
  fieldName: string;
  fieldType: FieldType;
  options?: string[];
  filterable?: boolean;
  category?: string;
}

const COMPANY_FIELDS: FieldDef[] = [
  // Practice Profile — what kind of family-law work do they do, and how
  // well does it overlap Crossover's wedge?
  { fieldName: 'HNW Divorce Focus',                  fieldType: 'select',
    options: ['Primary focus', 'Significant', 'Occasional', 'Unknown'],
    filterable: true, category: 'Practice Profile' },
  { fieldName: 'Crypto-Asset Experience',            fieldType: 'select',
    options: ['Sophisticated', 'Some', 'None', 'Unknown'],
    filterable: true, category: 'Practice Profile' },
  { fieldName: 'Family Business / Closely-Held Assets', fieldType: 'boolean',
    filterable: true, category: 'Practice Profile' },
  { fieldName: 'CDFA on Staff',                      fieldType: 'boolean',
    filterable: true, category: 'Practice Profile' },
  { fieldName: 'Forensic Accountant in Network',     fieldType: 'boolean',
    category: 'Practice Profile' },
  { fieldName: 'Mediation / Collaborative Practice', fieldType: 'boolean',
    category: 'Practice Profile' },

  // Firm Profile
  { fieldName: 'Firm Size',                          fieldType: 'select',
    options: ['Solo', '2–5 attorneys', '6–20 attorneys', '21–50 attorneys', '51+ attorneys'],
    filterable: true, category: 'Firm Profile' },
  { fieldName: 'Year Established',                   fieldType: 'number',
    category: 'Firm Profile' },
  { fieldName: 'AAML Affiliation',                   fieldType: 'select',
    options: ['No fellows', 'One AAML Fellow', 'Multiple AAML Fellows', 'Unknown'],
    filterable: true, category: 'Firm Profile' },

  // Relationship
  { fieldName: 'Referral Status',                    fieldType: 'select',
    options: ['Not yet contacted', 'Outreach started', 'In conversation', 'Active referral partner', 'Inactive', 'Not a fit'],
    filterable: true, category: 'Relationship' },
  { fieldName: 'Referral Direction',                 fieldType: 'select',
    options: ['None', 'We refer to them', 'They refer to us', 'Mutual'],
    filterable: true, category: 'Relationship' },
];

const CONTACT_FIELDS: FieldDef[] = [
  // Credentials — what makes this attorney a credible referral partner?
  { fieldName: 'Bar Admitted Year',                  fieldType: 'number',
    category: 'Credentials' },
  { fieldName: 'AAML Fellow',                        fieldType: 'boolean',
    filterable: true, category: 'Credentials' },
  { fieldName: 'Family-Law Specialist Certification',fieldType: 'boolean',
    filterable: true, category: 'Credentials' },
  { fieldName: 'Speaks / Writes on Family Law',      fieldType: 'boolean',
    category: 'Credentials' },
  { fieldName: 'Languages',                          fieldType: 'text',
    category: 'Credentials' },

  // Outreach — how does Crossover open and warm this relationship?
  { fieldName: 'Best Outreach Channel',              fieldType: 'select',
    options: ['Email', 'Phone', 'LinkedIn', 'Warm intro', 'Conference / event'],
    filterable: true, category: 'Outreach' },
  { fieldName: 'Open to Crypto-Asset Education',     fieldType: 'select',
    options: ['Yes — interested', 'Maybe', 'Not interested', 'Unknown'],
    filterable: true, category: 'Outreach' },
  { fieldName: 'Open to Joint Webinar / Speaking',   fieldType: 'boolean',
    filterable: true, category: 'Outreach' },
  { fieldName: 'LinkedIn URL Verified',              fieldType: 'boolean',
    category: 'Outreach' },
  { fieldName: 'Met At',                             fieldType: 'text',
    category: 'Outreach' },
];

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;
  if (!clientId) throw new Error('No clientId in ids.json');

  const { db } = await import('../../../lib/db');
  const { crmCustomFields, crmCustomFieldValues, crmContacts } = await import('../../../lib/db/schema');
  const { and, eq } = await import('drizzle-orm');

  async function upsertField(entityType: 'company' | 'contact', def: FieldDef, sortOrder: number) {
    const [existing] = await db.select().from(crmCustomFields).where(and(
      eq(crmCustomFields.clientId, clientId),
      eq(crmCustomFields.entityType, entityType),
      eq(crmCustomFields.fieldName, def.fieldName),
    )).limit(1);
    if (existing) {
      await db.update(crmCustomFields).set({
        fieldType: def.fieldType,
        options: def.options ?? null,
        filterable: def.filterable ?? false,
        category: def.category ?? null,
        sortOrder,
      }).where(eq(crmCustomFields.id, existing.id));
      return { id: existing.id, created: false };
    }
    const [created] = await db.insert(crmCustomFields).values({
      clientId,
      entityType,
      fieldName: def.fieldName,
      fieldType: def.fieldType,
      options: def.options ?? null,
      filterable: def.filterable ?? false,
      category: def.category ?? null,
      sortOrder,
    }).returning();
    return { id: created.id, created: true };
  }

  console.log('=== Custom field definitions ===');
  let createdCount = 0;
  const fieldIds = { company: new Map<string, number>(), contact: new Map<string, number>() };

  for (let i = 0; i < COMPANY_FIELDS.length; i++) {
    const def = COMPANY_FIELDS[i];
    const r = await upsertField('company', def, i);
    fieldIds.company.set(def.fieldName, r.id);
    if (r.created) createdCount += 1;
    console.log(`  company  ${r.created ? '+' : '·'} ${def.fieldName}  (${def.fieldType}${def.filterable ? ', filterable' : ''})`);
  }
  for (let i = 0; i < CONTACT_FIELDS.length; i++) {
    const def = CONTACT_FIELDS[i];
    const r = await upsertField('contact', def, i);
    fieldIds.contact.set(def.fieldName, r.id);
    if (r.created) createdCount += 1;
    console.log(`  contact  ${r.created ? '+' : '·'} ${def.fieldName}  (${def.fieldType}${def.filterable ? ', filterable' : ''})`);
  }
  console.log(`\nNew definitions created: ${createdCount} (others updated in place).`);

  // ── Backfill what we already know from the harvest ─────────────────
  // Every AAML harvest row → "AAML Fellow" = true on the contact.
  // Every harvested firm/contact → "Referral Status" = "Not yet contacted".
  console.log('\n=== Backfilling defaults from harvest data ===');

  const aamlFellowFieldId = fieldIds.contact.get('AAML Fellow')!;
  const referralStatusFieldId = fieldIds.company.get('Referral Status')!;

  // 1. Set AAML Fellow = true for every contact whose source = 'aaml'.
  const aamlContacts = await db.select({ id: crmContacts.id }).from(crmContacts)
    .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.source, 'aaml')));

  let aamlSet = 0;
  for (const c of aamlContacts) {
    const [existing] = await db.select().from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, aamlFellowFieldId),
      eq(crmCustomFieldValues.entityId, c.id),
      eq(crmCustomFieldValues.entityType, 'contact'),
    )).limit(1);
    if (existing) continue;
    await db.insert(crmCustomFieldValues).values({
      customFieldId: aamlFellowFieldId,
      entityId: c.id,
      entityType: 'contact',
      value: 'true',
    });
    aamlSet += 1;
  }
  console.log(`  AAML Fellow = true → set on ${aamlSet} contacts`);

  // 2. Set Referral Status = "Not yet contacted" on every firm with no value yet.
  const { crmCompanies } = await import('../../../lib/db/schema');
  const allFirms = await db.select({ id: crmCompanies.id }).from(crmCompanies)
    .where(eq(crmCompanies.clientId, clientId));
  let firmsSeeded = 0;
  for (const f of allFirms) {
    const [existing] = await db.select().from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, referralStatusFieldId),
      eq(crmCustomFieldValues.entityId, f.id),
      eq(crmCustomFieldValues.entityType, 'company'),
    )).limit(1);
    if (existing) continue;
    await db.insert(crmCustomFieldValues).values({
      customFieldId: referralStatusFieldId,
      entityId: f.id,
      entityType: 'company',
      value: 'Not yet contacted',
    });
    firmsSeeded += 1;
  }
  console.log(`  Referral Status = "Not yet contacted" → set on ${firmsSeeded} firms`);

  console.log('\n=== DONE ===');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
