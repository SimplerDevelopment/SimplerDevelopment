/**
 * Import US 4-year colleges from a CSV file into the PostCaptain (clientId 103) CRM.
 *
 * NOTE: us-4yr-colleges-flagged.csv is no longer checked into the repo.
 * Callers must supply the CSV path via --csv <path>.
 *
 * Each CSV row becomes:
 *   - 1 CRM company (college)
 *   - 1 CRM contact (the president, linked to the company)
 *   - ~22 custom field values on the company
 *
 * Custom field definitions are bootstrapped on first run (idempotent).
 * Dedupe key: the `unitid` custom field — re-runs skip colleges already imported.
 *
 * Flags:
 *   --dry-run         Parse + plan only, no writes
 *   --limit N         Import only the first N rows
 *   --client-id N     Override clientId (default 103 = Post Captain Consulting)
 *   --csv PATH        Path to the colleges CSV file (required — not bundled in repo)
 */

import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

dotenv.config({ path: '.env' });

// ── Config ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argVal(name: string, def?: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return def;
  return args[idx + 1];
}
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(argVal('--limit', '0') ?? '0', 10);
const CLIENT_ID = parseInt(argVal('--client-id', '100') ?? '100', 10);
const CSV_PATH = resolve(argVal('--csv', 'us-4yr-colleges-flagged.csv') ?? 'us-4yr-colleges-flagged.csv');

// ── CSV parser (RFC 4180, handles quoted fields + embedded commas + "") ────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cell += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') { /* skip */ }
      else cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.length > 0));
}

// ── Custom field definitions (entityType: 'company') ───────────────────────
type FieldType =
  | 'text' | 'number' | 'date' | 'select' | 'multiselect'
  | 'url' | 'email' | 'phone' | 'boolean';

interface FieldDef {
  fieldName: string;
  fieldType: FieldType;
  options?: string[];
  sortOrder: number;
}

const COMPANY_FIELDS: FieldDef[] = [
  { fieldName: 'IPEDS Unit ID', fieldType: 'text', sortOrder: 0 },
  { fieldName: 'Alias', fieldType: 'text', sortOrder: 1 },
  { fieldName: 'City', fieldType: 'text', sortOrder: 2 },
  { fieldName: 'State', fieldType: 'text', sortOrder: 3 },
  { fieldName: 'ZIP', fieldType: 'text', sortOrder: 4 },
  { fieldName: 'County', fieldType: 'text', sortOrder: 5 },
  { fieldName: 'Region', fieldType: 'text', sortOrder: 6 },
  { fieldName: 'Admissions URL', fieldType: 'url', sortOrder: 7 },
  { fieldName: 'Applications URL', fieldType: 'url', sortOrder: 8 },
  { fieldName: 'Financial Aid URL', fieldType: 'url', sortOrder: 9 },
  { fieldName: 'Net Price Calculator URL', fieldType: 'url', sortOrder: 10 },
  { fieldName: 'Sector', fieldType: 'text', sortOrder: 11 },
  { fieldName: 'Control', fieldType: 'text', sortOrder: 12 },
  { fieldName: 'Highest Degree Offered', fieldType: 'text', sortOrder: 13 },
  { fieldName: 'Size Category', fieldType: 'text', sortOrder: 14 },
  { fieldName: 'HBCU', fieldType: 'boolean', sortOrder: 15 },
  { fieldName: 'Tribal College', fieldType: 'boolean', sortOrder: 16 },
  { fieldName: 'Locale', fieldType: 'text', sortOrder: 17 },
  { fieldName: 'Longitude', fieldType: 'number', sortOrder: 18 },
  { fieldName: 'Latitude', fieldType: 'number', sortOrder: 19 },
  { fieldName: 'OPEID', fieldType: 'text', sortOrder: 20 },
  { fieldName: 'EIN', fieldType: 'text', sortOrder: 21 },
  { fieldName: 'Slate Org Participant', fieldType: 'boolean', sortOrder: 22 },
];

// ── Name parsing helpers ───────────────────────────────────────────────────
const NAME_PREFIX_RE = /^(dr|mr|mrs|ms|prof|sr|rev|hon)\.?\s+/i;

function splitPresidentName(full: string): { firstName: string; lastName: string | null } {
  const cleaned = full.trim().replace(NAME_PREFIX_RE, '').trim();
  if (!cleaned) return { firstName: 'Unknown', lastName: null };
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

function normalizeUrl(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

function normalizePhone(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw.trim();
}

function toBool(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (['yes', 'true', '1', 'y'].includes(v)) return 'true';
  return 'false';
}

function clean(raw: string | undefined): string {
  return (raw ?? '').trim();
}

// ── Main ───────────────────────────────────────────────────────────────────
async function run() {
  const { db } = await import('../lib/db');
  const { clients, crmCompanies, crmContacts, crmCustomFields, crmCustomFieldValues } =
    await import('../lib/db/schema');
  const { and, eq, inArray } = await import('drizzle-orm');

  // 1. Verify client exists
  const [client] = await db.select({ id: clients.id, company: clients.company })
    .from(clients).where(eq(clients.id, CLIENT_ID)).limit(1);
  if (!client) {
    console.error(`Client ${CLIENT_ID} not found.`);
    process.exit(1);
  }
  console.log(`Target: client ${client.id} — "${client.company ?? '(no company name)'}"`);
  console.log(`CSV: ${CSV_PATH}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE WRITE'}`);
  if (LIMIT > 0) console.log(`Limit: first ${LIMIT} rows`);

  // 2. Load CSV
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(raw);
  const header = rows[0];
  const dataRows = rows.slice(1);
  console.log(`Parsed ${dataRows.length} data rows, ${header.length} columns.`);

  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Missing column: ${name}`);
    return i;
  };
  const cols = {
    unitid: col('unitid'),
    name: col('name'),
    alias: col('alias'),
    address: col('address'),
    city: col('city'),
    state: col('state'),
    zip: col('zip'),
    county: col('county'),
    region: col('region'),
    phone: col('phone'),
    website: col('website'),
    admissions_url: col('admissions_url'),
    applications_url: col('applications_url'),
    financial_aid_url: col('financial_aid_url'),
    net_price_calc_url: col('net_price_calc_url'),
    sector: col('sector'),
    control: col('control'),
    highest_degree_offered: col('highest_degree_offered'),
    size_category: col('size_category'),
    hbcu: col('hbcu'),
    tribal: col('tribal'),
    locale: col('locale'),
    longitude: col('longitude'),
    latitude: col('latitude'),
    ipeds_opeid: col('ipeds_opeid'),
    ein: col('ein'),
    president_name: col('president_name'),
    president_title: col('president_title'),
    is_slate_org_participant: col('is_slate_org_participant'),
  };

  // 3. Bootstrap custom fields (idempotent)
  const existingFields = await db.select().from(crmCustomFields)
    .where(and(eq(crmCustomFields.clientId, CLIENT_ID), eq(crmCustomFields.entityType, 'company')));
  const existingByName = new Map(existingFields.map(f => [f.fieldName, f]));

  const fieldIdByName = new Map<string, number>();
  for (const def of COMPANY_FIELDS) {
    const existing = existingByName.get(def.fieldName);
    if (existing) {
      fieldIdByName.set(def.fieldName, existing.id);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  [would create field] ${def.fieldName} (${def.fieldType})`);
      fieldIdByName.set(def.fieldName, -1);
      continue;
    }
    const [row] = await db.insert(crmCustomFields).values({
      clientId: CLIENT_ID,
      entityType: 'company',
      fieldName: def.fieldName,
      fieldType: def.fieldType,
      options: def.options ?? null,
      required: false,
      sortOrder: def.sortOrder,
    }).returning();
    fieldIdByName.set(def.fieldName, row.id);
    console.log(`  [created field] ${def.fieldName} (${def.fieldType})`);
  }

  // 4. Load existing unitids for dedupe
  const unitidFieldId = fieldIdByName.get('IPEDS Unit ID');
  const existingUnitids = new Set<string>();
  if (!DRY_RUN && unitidFieldId) {
    const existingValues = await db.select({
      entityId: crmCustomFieldValues.entityId,
      value: crmCustomFieldValues.value,
    })
      .from(crmCustomFieldValues)
      .where(and(
        eq(crmCustomFieldValues.customFieldId, unitidFieldId),
        eq(crmCustomFieldValues.entityType, 'company'),
      ));
    for (const v of existingValues) if (v.value) existingUnitids.add(v.value);
    console.log(`Dedupe: ${existingUnitids.size} existing unitids already in CRM.`);
  }

  // 5. Import rows
  const toProcess = LIMIT > 0 ? dataRows.slice(0, LIMIT) : dataRows;
  let imported = 0;
  let skippedDupe = 0;
  let skippedNoName = 0;
  const errors: { unitid: string; name: string; err: string }[] = [];
  const startTs = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const r = toProcess[i];
    const unitid = clean(r[cols.unitid]);
    const name = clean(r[cols.name]);

    if (!name) { skippedNoName++; continue; }
    if (existingUnitids.has(unitid)) { skippedDupe++; continue; }

    try {
      const addressParts = [
        clean(r[cols.address]),
        clean(r[cols.city]),
        clean(r[cols.state]) + ' ' + clean(r[cols.zip]),
      ].filter(Boolean);
      const addressFull = addressParts.join(', ').trim();

      const website = normalizeUrl(clean(r[cols.website]));
      const domain = website ? website.replace(/^https?:\/\//i, '').replace(/\/.*$/, '') : null;

      if (DRY_RUN) {
        console.log(`  [would import] ${name} (unitid=${unitid})`);
        imported++;
        continue;
      }

      // Insert company
      const [company] = await db.insert(crmCompanies).values({
        clientId: CLIENT_ID,
        name,
        domain,
        website,
        phone: normalizePhone(clean(r[cols.phone])),
        address: addressFull || null,
        industry: 'Higher Education',
      }).returning({ id: crmCompanies.id });

      // Insert president contact
      const presidentRaw = clean(r[cols.president_name]);
      if (presidentRaw) {
        const { firstName, lastName } = splitPresidentName(presidentRaw);
        await db.insert(crmContacts).values({
          clientId: CLIENT_ID,
          companyId: company.id,
          firstName,
          lastName,
          title: clean(r[cols.president_title]) || null,
          status: 'lead',
          source: 'csv-import',
        });
      }

      // Insert custom field values
      const values: Record<string, string> = {
        'IPEDS Unit ID': unitid,
        'Alias': clean(r[cols.alias]),
        'City': clean(r[cols.city]),
        'State': clean(r[cols.state]),
        'ZIP': clean(r[cols.zip]),
        'County': clean(r[cols.county]),
        'Region': clean(r[cols.region]),
        'Admissions URL': normalizeUrl(clean(r[cols.admissions_url])) ?? '',
        'Applications URL': normalizeUrl(clean(r[cols.applications_url])) ?? '',
        'Financial Aid URL': normalizeUrl(clean(r[cols.financial_aid_url])) ?? '',
        'Net Price Calculator URL': normalizeUrl(clean(r[cols.net_price_calc_url])) ?? '',
        'Sector': clean(r[cols.sector]),
        'Control': clean(r[cols.control]),
        'Highest Degree Offered': clean(r[cols.highest_degree_offered]),
        'Size Category': clean(r[cols.size_category]),
        'HBCU': toBool(clean(r[cols.hbcu])),
        'Tribal College': toBool(clean(r[cols.tribal])),
        'Locale': clean(r[cols.locale]),
        'Longitude': clean(r[cols.longitude]),
        'Latitude': clean(r[cols.latitude]),
        'OPEID': clean(r[cols.ipeds_opeid]),
        'EIN': clean(r[cols.ein]),
        'Slate Org Participant': toBool(clean(r[cols.is_slate_org_participant])),
      };

      const insertRows = Object.entries(values)
        .filter(([, v]) => v !== '' && v !== null)
        .map(([fname, value]) => ({
          customFieldId: fieldIdByName.get(fname)!,
          entityId: company.id,
          entityType: 'company',
          value,
        }))
        .filter(r => r.customFieldId);

      if (insertRows.length > 0) {
        await db.insert(crmCustomFieldValues).values(insertRows);
      }

      imported++;
      existingUnitids.add(unitid);

      if (imported % 100 === 0) {
        const elapsed = (Date.now() - startTs) / 1000;
        const rate = imported / elapsed;
        const remaining = toProcess.length - i - 1;
        const eta = Math.round(remaining / rate);
        console.log(`  [${imported}/${toProcess.length}] ${rate.toFixed(1)} rows/s, ETA ${eta}s`);
      }
    } catch (err) {
      errors.push({ unitid, name, err: err instanceof Error ? err.message : String(err) });
    }
  }

  const totalSecs = Math.round((Date.now() - startTs) / 1000);
  console.log('\n── Summary ──');
  console.log(`Imported:      ${imported}`);
  console.log(`Skipped (dupe): ${skippedDupe}`);
  console.log(`Skipped (no name): ${skippedNoName}`);
  console.log(`Errors:        ${errors.length}`);
  console.log(`Elapsed:       ${totalSecs}s`);
  if (errors.length > 0) {
    console.log('\nFirst 10 errors:');
    for (const e of errors.slice(0, 10)) console.log(`  - ${e.unitid} "${e.name}": ${e.err}`);
  }

  process.exit(errors.length > 0 && imported === 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
