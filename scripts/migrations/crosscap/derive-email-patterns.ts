/**
 * For each firm with ≥2 known attorney emails, derive the email pattern
 * the firm uses (e.g., firstname.lastname@domain, firstinitiallastname@domain)
 * and write it to a new firm-level custom field "Email Pattern".
 *
 * Patterns recognized:
 *   {first}.{last}     → e.g. "jane.doe"
 *   {first}{last}      → e.g. "janedoe"
 *   {first_initial}{last} → e.g. "jdoe"
 *   {first}_{last}     → e.g. "jane_doe"
 *   {first}            → e.g. "jane"
 *   {last}             → e.g. "doe"
 *   {first_initial}.{last} → e.g. "j.doe"
 *
 * The dominant pattern wins. We require at least 2 known emails to claim a
 * pattern; otherwise leave it blank. Output is meant for human-driven outreach
 * (not auto-fill of contact emails).
 *
 *   npx tsx scripts/migrations/crosscap/derive-email-patterns.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

interface AttorneyKnown {
  first: string;
  last: string;
  local: string;   // local-part of email (lowercased)
  domain: string;  // host of email
}

const PATTERNS: Array<{ name: string; build: (first: string, last: string) => string }> = [
  { name: '{first}.{last}',          build: (f, l) => `${f}.${l}` },
  { name: '{first}{last}',           build: (f, l) => `${f}${l}` },
  { name: '{first_initial}{last}',   build: (f, l) => `${f[0]}${l}` },
  { name: '{first}_{last}',          build: (f, l) => `${f}_${l}` },
  { name: '{first_initial}.{last}',  build: (f, l) => `${f[0]}.${l}` },
  { name: '{last}{first_initial}',   build: (f, l) => `${l}${f[0]}` },
  { name: '{first}{last_initial}',   build: (f, l) => `${f}${l[0]}` },
  { name: '{first}-{last}',          build: (f, l) => `${f}-${l}` },
  { name: '{first}',                 build: (f) => f },
  { name: '{last}',                  build: (_, l) => l },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function ensurePatternField(clientId: number) {
  const { db } = await import('../../../lib/db');
  const { crmCustomFields } = await import('../../../lib/db/schema');
  const { and, eq } = await import('drizzle-orm');
  const [existing] = await db.select().from(crmCustomFields).where(and(
    eq(crmCustomFields.clientId, clientId),
    eq(crmCustomFields.entityType, 'company'),
    eq(crmCustomFields.fieldName, 'Email Pattern'),
  )).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(crmCustomFields).values({
    clientId,
    entityType: 'company',
    fieldName: 'Email Pattern',
    fieldType: 'text',
    category: 'Outreach',
    sortOrder: 99,
  }).returning();
  console.log(`  + created field "Email Pattern" (id=${created.id})`);
  return created.id;
}

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmContacts, crmCompanies, crmCustomFieldValues } = await import('../../../lib/db/schema');
  const { and, eq, isNotNull } = await import('drizzle-orm');

  const fieldId = await ensurePatternField(clientId);

  const firms = await db.select().from(crmCompanies).where(eq(crmCompanies.clientId, clientId));
  const contacts = await db.select().from(crmContacts).where(and(eq(crmContacts.clientId, clientId), isNotNull(crmContacts.email)));
  const byFirm = new Map<number, typeof contacts>();
  for (const c of contacts) {
    if (!c.companyId) continue;
    let arr = byFirm.get(c.companyId);
    if (!arr) { arr = []; byFirm.set(c.companyId, arr); }
    arr.push(c);
  }

  let written = 0, skipped = 0;
  for (const firm of firms) {
    const known: AttorneyKnown[] = [];
    for (const c of byFirm.get(firm.id) ?? []) {
      if (!c.email || !c.firstName) continue;
      const at = c.email.indexOf('@');
      if (at < 1) continue;
      const local = c.email.slice(0, at).toLowerCase();
      const domain = c.email.slice(at + 1).toLowerCase();
      const first = norm(c.firstName);
      const last = norm(c.lastName ?? '');
      if (!first || !last) continue;
      known.push({ first, last, local, domain });
    }
    if (known.length < 2) { skipped += 1; continue; }

    // Score each pattern: how many known emails match it (allowing per-row fudge)?
    const scores = PATTERNS.map(p => {
      const hits = known.filter(k => p.build(k.first, k.last) === k.local).length;
      return { pattern: p.name, hits };
    }).sort((a, b) => b.hits - a.hits);

    if (scores[0].hits < 2 || scores[0].hits / known.length < 0.5) { skipped += 1; continue; }

    const dominantDomain = mostCommon(known.map(k => k.domain));
    const value = `${scores[0].pattern}@${dominantDomain}  (${scores[0].hits}/${known.length} known)`;

    // Idempotent upsert
    const [existing] = await db.select().from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, fieldId),
      eq(crmCustomFieldValues.entityId, firm.id),
      eq(crmCustomFieldValues.entityType, 'company'),
    )).limit(1);
    if (existing) {
      if (existing.value === value) continue;
      await db.update(crmCustomFieldValues).set({ value, updatedAt: new Date() }).where(eq(crmCustomFieldValues.id, existing.id));
    } else {
      await db.insert(crmCustomFieldValues).values({ customFieldId: fieldId, entityId: firm.id, entityType: 'company', value });
    }
    written += 1;
  }

  console.log(`\n=== EMAIL PATTERN DERIVE DONE ===`);
  console.log(`Patterns written: ${written}`);
  console.log(`Firms skipped (insufficient evidence): ${skipped}`);
  process.exit(0);
}

function mostCommon<T>(arr: T[]): T {
  const counts = new Map<T, number>();
  for (const x of arr) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best = arr[0], n = 0;
  for (const [k, v] of counts) if (v > n) { n = v; best = k; }
  return best;
}

main().catch(e => { console.error(e); process.exit(1); });
