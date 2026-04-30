/**
 * Mine the per-contact "Bio Snippet" custom field for additional signals:
 *   • Bar Admitted Year
 *   • Family-Law Specialist Certification (boolean)
 *   • Speaks / Writes on Family Law (boolean)
 *   • Languages (text)
 *
 * Idempotent — only writes when the target field is empty for that contact
 * and the regex finds a confident match.
 *
 *   npx tsx scripts/migrations/crosscap/enrich-bios.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

interface BioFacts {
  barYear: number | null;
  specialist: boolean;
  speaksWrites: boolean;
  languages: string | null;
}

const LANG_NAMES = [
  'Spanish','French','German','Italian','Portuguese','Mandarin','Cantonese','Chinese','Japanese',
  'Korean','Vietnamese','Arabic','Hebrew','Russian','Polish','Romanian','Greek','Hindi','Urdu','Tagalog','Filipino','Tamil',
];

function mineBio(text: string): BioFacts {
  const out: BioFacts = { barYear: null, specialist: false, speaksWrites: false, languages: null };
  const lower = text.toLowerCase();

  // Bar admitted year — be strict to avoid grabbing graduation years
  const m =
    text.match(/admitted (?:to (?:the |[a-z ]*?))?(?:practice (?:law )?(?:in )?)?(?:to (?:the )?(?:[A-Z][A-Za-z .]+? )?(?:State )?Bar )?(?:in|of) (?:[A-Za-z .]+? )?(?:in )?(19[5-9]\d|20[0-2]\d)/i)
    ?? text.match(/(?:Bar|state bar)[^.]{0,40}?(?:in |since )?(19[5-9]\d|20[0-2]\d)/i)
    ?? text.match(/practicing law (?:since|in) (19[5-9]\d|20[0-2]\d)/i);
  if (m) out.barYear = parseInt(m[1], 10);

  // Specialist certification — strict phrasing
  if (/Board Certified[^.]*Family Law/i.test(text)
      || /Certified Family Law Specialist/i.test(text)
      || /\bCFLS\b/.test(text)
      || /Family Law Specialist by the State Bar/i.test(text)) {
    out.specialist = true;
  }

  // Speaks/writes: needs at least one strong noun + family-law context
  // Allow either domain mention nearby OR strong signal verbs.
  const speakSignals = /\b(?:frequently |often |regularly )?(?:lectured?|spoke|speaker|presents?|presented|panelist|moderator|keynote|co[- ]author|authored|published|writes? for|chapter author|contributing author|adjunct (?:professor|faculty)|legal commentator)\b/i;
  if (speakSignals.test(text) && /family law|divorce|matrimonial|custody|child support/i.test(text)) {
    out.speaksWrites = true;
  }

  // Languages — find "fluent in <lang>" / "speaks <lang>" / "bilingual <english/lang>"
  const found = new Set<string>();
  for (const lang of LANG_NAMES) {
    if (new RegExp(`(?:fluent in|speaks?|bilingual in|conversant in) [^.]*?\\b${lang}\\b`, 'i').test(text)) {
      found.add(lang);
    }
  }
  if (lower.includes('bilingual') && found.size === 0) {
    // generic mention without a named language → skip; too noisy
  }
  if (found.size > 0) out.languages = Array.from(found).sort().join(', ');

  return out;
}

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmCustomFields, crmCustomFieldValues } = await import('../../../lib/db/schema');
  const { and, eq } = await import('drizzle-orm');

  const allFields = await db.select().from(crmCustomFields).where(eq(crmCustomFields.clientId, clientId));
  const bioFid     = allFields.find(f => f.entityType === 'contact' && f.fieldName === 'Bio Snippet')?.id;
  const yearFid    = allFields.find(f => f.entityType === 'contact' && f.fieldName === 'Bar Admitted Year')?.id;
  const specFid    = allFields.find(f => f.entityType === 'contact' && f.fieldName === 'Family-Law Specialist Certification')?.id;
  const speakFid   = allFields.find(f => f.entityType === 'contact' && f.fieldName === 'Speaks / Writes on Family Law')?.id;
  const langFid    = allFields.find(f => f.entityType === 'contact' && f.fieldName === 'Languages')?.id;

  if (!bioFid) { console.log('no Bio Snippet field — exit'); process.exit(0); }

  const bios = await db.select().from(crmCustomFieldValues).where(and(
    eq(crmCustomFieldValues.customFieldId, bioFid),
    eq(crmCustomFieldValues.entityType, 'contact'),
  ));
  console.log(`Bio snippets: ${bios.length}`);

  // Pre-load existing values for the four target fields so we don't overwrite
  async function existingForField(fid: number) {
    const rows = await db.select({ entityId: crmCustomFieldValues.entityId }).from(crmCustomFieldValues)
      .where(and(eq(crmCustomFieldValues.customFieldId, fid), eq(crmCustomFieldValues.entityType, 'contact')));
    return new Set(rows.map(r => r.entityId));
  }
  const haveYear  = yearFid  ? await existingForField(yearFid)  : new Set<number>();
  const haveSpec  = specFid  ? await existingForField(specFid)  : new Set<number>();
  const haveSpeak = speakFid ? await existingForField(speakFid) : new Set<number>();
  const haveLang  = langFid  ? await existingForField(langFid)  : new Set<number>();

  let yearSet = 0, specSet = 0, speakSet = 0, langSet = 0;
  let i = 0;
  for (const row of bios) {
    i += 1;
    const cid = row.entityId;
    const text = row.value ?? '';
    if (!text) continue;
    const facts = mineBio(text);

    if (facts.barYear && yearFid && !haveYear.has(cid)) {
      await db.insert(crmCustomFieldValues).values({ customFieldId: yearFid, entityId: cid, entityType: 'contact', value: String(facts.barYear) });
      yearSet += 1;
    }
    if (facts.specialist && specFid && !haveSpec.has(cid)) {
      await db.insert(crmCustomFieldValues).values({ customFieldId: specFid, entityId: cid, entityType: 'contact', value: 'true' });
      specSet += 1;
    }
    if (facts.speaksWrites && speakFid && !haveSpeak.has(cid)) {
      await db.insert(crmCustomFieldValues).values({ customFieldId: speakFid, entityId: cid, entityType: 'contact', value: 'true' });
      speakSet += 1;
    }
    if (facts.languages && langFid && !haveLang.has(cid)) {
      await db.insert(crmCustomFieldValues).values({ customFieldId: langFid, entityId: cid, entityType: 'contact', value: facts.languages });
      langSet += 1;
    }
    if (i % 200 === 0) console.log(`  …${i}/${bios.length}: +${yearSet} year, +${specSet} spec, +${speakSet} speak, +${langSet} lang`);
  }

  console.log('\n=== BIO MINING DONE ===');
  console.log(`Bar Admitted Year:                       ${yearSet}`);
  console.log(`Family-Law Specialist Certification:     ${specSet}`);
  console.log(`Speaks / Writes on Family Law:           ${speakSet}`);
  console.log(`Languages:                                ${langSet}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
