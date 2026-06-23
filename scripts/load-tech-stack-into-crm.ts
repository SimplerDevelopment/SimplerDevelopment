/**
 * One-time loader: take the latest tech-stack CSV and write its results into
 * the CRM as company-scoped custom fields.
 *
 * Creates (or updates) these custom fields on the company entity:
 *
 *   - Uses Slate         select   (Yes / Maybe / No)         filterable
 *   - Tech Stack         multi    (every detected technology)  filterable
 *   - CMS                select   (first detected CMS)          filterable
 *   - Hosting / CDN      select   (first detected host)         filterable
 *   - Server Header      text
 *   - Powered By         text
 *   - Generator          text
 *   - HTTP Status        number
 *   - Final URL          url
 *   - Last Tech Scan     date
 *
 * Then wipes existing values for those fields (company entities only) and
 * bulk-inserts the fresh values from the CSV. Idempotent — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/load-tech-stack-into-crm.ts <csv-path> [--email <email>] [--client-id N] [--dry-run]
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import * as fs from 'node:fs';

const args = process.argv.slice(2);
function argVal(name: string, def?: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return def;
  return args[idx + 1];
}
const CSV_PATH = args.find((a) => !a.startsWith('--') && a.endsWith('.csv'));
if (!CSV_PATH) {
  console.error('Usage: tsx scripts/load-tech-stack-into-crm.ts <csv-path>');
  process.exit(1);
}
const DRY_RUN = args.includes('--dry-run');
const EMAIL = argVal('--email', process.env.SCAN_CONTACT_EMAIL || 'bot@example.com')!;
const CLIENT_ID_ARG = argVal('--client-id');
const SCAN_DATE = argVal('--scan-date', new Date().toISOString().slice(0, 10))!;

// ── id → human name (mirror of TECH array in scan-tech-stack.ts) ───────────
const TECH_NAMES: Record<string, string> = {
  slate: 'Slate (Technolutions)',
  element451: 'Element451',
  enrollmentrx: 'EnrollmentRx',
  targetx: 'TargetX',
  liaison: 'Liaison / SlideRoom',
  'sf-edu': 'Salesforce Education Cloud',
  wordpress: 'WordPress',
  drupal: 'Drupal',
  squarespace: 'Squarespace',
  wix: 'Wix',
  webflow: 'Webflow',
  shopify: 'Shopify',
  ghost: 'Ghost',
  omniupdate: 'Modern Campus (OmniUpdate)',
  finalsite: 'Finalsite',
  cascade: 'Hannon Hill Cascade',
  'hubspot-cms': 'HubSpot CMS',
  nextjs: 'Next.js',
  gatsby: 'Gatsby',
  nuxt: 'Nuxt',
  react: 'React',
  vue: 'Vue',
  angular: 'Angular',
  hubspot: 'HubSpot',
  marketo: 'Marketo',
  pardot: 'Salesforce Pardot',
  mailchimp: 'Mailchimp',
  mailgun: 'Mailgun',
  gtm: 'Google Tag Manager',
  ga: 'Google Analytics',
  'meta-pixel': 'Meta Pixel',
  hotjar: 'Hotjar',
  segment: 'Segment',
  intercom: 'Intercom',
  drift: 'Drift',
  zendesk: 'Zendesk',
  tawk: 'Tawk.to',
  cloudflare: 'Cloudflare',
  vercel: 'Vercel',
  netlify: 'Netlify',
  cloudfront: 'AWS CloudFront',
  akamai: 'Akamai',
  fastly: 'Fastly',
};
const CMS_IDS = ['wordpress', 'drupal', 'squarespace', 'wix', 'webflow', 'shopify', 'ghost', 'omniupdate', 'finalsite', 'cascade', 'hubspot-cms'];
const HOSTING_IDS = ['cloudflare', 'vercel', 'netlify', 'cloudfront', 'akamai', 'fastly'];

const ALL_TECH_NAMES = Object.values(TECH_NAMES);
const CMS_OPTIONS = [...CMS_IDS.map((id) => TECH_NAMES[id]), 'Other / Unknown'];
const HOSTING_OPTIONS = [...HOSTING_IDS.map((id) => TECH_NAMES[id]), 'Other / Unknown'];

interface FieldDef {
  key: string;
  fieldName: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'url';
  options: string[] | null;
  filterable: boolean;
  sortOrder: number;
}
const FIELDS: FieldDef[] = [
  { key: 'uses_slate',    fieldName: 'Uses Slate',     fieldType: 'select',      options: ['Yes', 'Maybe', 'No'], filterable: true,  sortOrder: 1 },
  { key: 'tech_stack',    fieldName: 'Tech Stack',     fieldType: 'multiselect', options: ALL_TECH_NAMES,         filterable: true,  sortOrder: 2 },
  { key: 'cms',           fieldName: 'CMS',            fieldType: 'select',      options: CMS_OPTIONS,            filterable: true,  sortOrder: 3 },
  { key: 'hosting',       fieldName: 'Hosting / CDN',  fieldType: 'select',      options: HOSTING_OPTIONS,        filterable: true,  sortOrder: 4 },
  { key: 'server',        fieldName: 'Server Header',  fieldType: 'text',        options: null,                   filterable: false, sortOrder: 5 },
  { key: 'powered_by',    fieldName: 'Powered By',     fieldType: 'text',        options: null,                   filterable: false, sortOrder: 6 },
  { key: 'generator',     fieldName: 'Generator',      fieldType: 'text',        options: null,                   filterable: false, sortOrder: 7 },
  { key: 'http_status',   fieldName: 'HTTP Status',    fieldType: 'number',      options: null,                   filterable: false, sortOrder: 8 },
  { key: 'final_url',     fieldName: 'Final URL',      fieldType: 'url',         options: null,                   filterable: false, sortOrder: 9 },
  { key: 'last_tech_scan',fieldName: 'Last Tech Scan', fieldType: 'date',        options: null,                   filterable: false, sortOrder: 10 },
];

// ── CSV parser (RFC 4180-ish) ──────────────────────────────────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

async function run() {
  const text = fs.readFileSync(CSV_PATH!, 'utf8');
  const rows = parseCsv(text);
  const header = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.length === header.length);
  const colIdx = (n: string) => {
    const i = header.indexOf(n);
    if (i === -1) throw new Error(`CSV missing column: ${n}`);
    return i;
  };
  const I_ID = colIdx('company_id');
  const I_FINAL = colIdx('final_url');
  const I_STATUS = colIdx('http_status');
  const I_SERVER = colIdx('server');
  const I_PB = colIdx('x_powered_by');
  const I_GEN = colIdx('generator_meta');
  const I_SLATE = colIdx('tech__slate');
  const I_DETECTED = colIdx('detected_techs');

  const { db } = await import('../lib/db');
  const { users, clients, crmCompanies, crmCustomFields, crmCustomFieldValues } = await import('../lib/db/schema');
  const { eq, and, inArray } = await import('drizzle-orm');

  // Resolve client
  let clientId: number;
  if (CLIENT_ID_ARG) {
    clientId = parseInt(CLIENT_ID_ARG, 10);
    console.log(`Using clientId ${clientId} (from --client-id flag)`);
  } else {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
    if (!u) { console.error(`No user with email ${EMAIL}`); process.exit(1); }
    const [c] = await db.select({ id: clients.id, company: clients.company }).from(clients).where(eq(clients.userId, u.id)).limit(1);
    if (!c) { console.error(`User ${u.id} has no client`); process.exit(1); }
    clientId = c.id;
    console.log(`Resolved ${EMAIL} → client ${clientId} ("${c.company ?? '—'}")`);
  }

  // Upsert field defs
  console.log(`\nUpserting ${FIELDS.length} custom field definitions…`);
  const fieldIds: Record<string, number> = {};
  for (const def of FIELDS) {
    const existing = await db
      .select({ id: crmCustomFields.id })
      .from(crmCustomFields)
      .where(
        and(
          eq(crmCustomFields.clientId, clientId),
          eq(crmCustomFields.entityType, 'company'),
          eq(crmCustomFields.fieldName, def.fieldName),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      if (!DRY_RUN) {
        await db
          .update(crmCustomFields)
          .set({
            fieldType: def.fieldType,
            options: def.options,
            filterable: def.filterable,
            sortOrder: def.sortOrder,
          })
          .where(eq(crmCustomFields.id, existing[0].id));
      }
      fieldIds[def.key] = existing[0].id;
      console.log(`  [keep] ${def.fieldName.padEnd(20)} id=${existing[0].id}`);
    } else {
      if (DRY_RUN) {
        console.log(`  [new]  ${def.fieldName.padEnd(20)} would create`);
        fieldIds[def.key] = -1; // sentinel
      } else {
        const [created] = await db
          .insert(crmCustomFields)
          .values({
            clientId,
            entityType: 'company',
            fieldName: def.fieldName,
            fieldType: def.fieldType,
            options: def.options,
            required: false,
            filterable: def.filterable,
            sortOrder: def.sortOrder,
          })
          .returning({ id: crmCustomFields.id });
        fieldIds[def.key] = created.id;
        console.log(`  [new]  ${def.fieldName.padEnd(20)} id=${created.id}`);
      }
    }
  }

  // Constrain to companies that actually belong to this client
  const csvIds = [...new Set(dataRows.map((r) => parseInt(r[I_ID], 10)).filter(Number.isFinite))];
  console.log(`\nVerifying ${csvIds.length} CSV company IDs belong to client ${clientId}…`);
  const validRows: { id: number }[] = [];
  // chunk to avoid massive IN list
  for (let i = 0; i < csvIds.length; i += 1000) {
    const chunk = csvIds.slice(i, i + 1000);
    const found = await db
      .select({ id: crmCompanies.id })
      .from(crmCompanies)
      .where(and(eq(crmCompanies.clientId, clientId), inArray(crmCompanies.id, chunk)));
    validRows.push(...found);
  }
  const validIds = new Set(validRows.map((r) => r.id));
  console.log(`  ${validIds.size}/${csvIds.length} match.`);

  // Build value rows
  type ValRow = { customFieldId: number; entityId: number; entityType: 'company'; value: string };
  const inserts: ValRow[] = [];
  let skippedMissing = 0;

  for (const r of dataRows) {
    const id = parseInt(r[I_ID], 10);
    if (!validIds.has(id)) { skippedMissing++; continue; }

    const detected = (r[I_DETECTED] || '').split('|').filter(Boolean);
    const techIds = detected.filter((t) => TECH_NAMES[t]); // skip "slate?" markers etc.

    // Uses Slate
    const slateRaw = r[I_SLATE];
    const slateLabel = slateRaw === 'true' ? 'Yes' : slateRaw === 'maybe' ? 'Maybe' : 'No';
    inserts.push({ customFieldId: fieldIds.uses_slate, entityId: id, entityType: 'company', value: slateLabel });

    // Tech Stack (multiselect comma-joined)
    if (techIds.length > 0) {
      const names = techIds.map((t) => TECH_NAMES[t]).filter(Boolean);
      inserts.push({ customFieldId: fieldIds.tech_stack, entityId: id, entityType: 'company', value: names.join(',') });
    }

    // CMS — first detected
    const cms = techIds.find((t) => CMS_IDS.includes(t));
    if (cms) inserts.push({ customFieldId: fieldIds.cms, entityId: id, entityType: 'company', value: TECH_NAMES[cms] });

    // Hosting — first detected
    const hosting = techIds.find((t) => HOSTING_IDS.includes(t));
    if (hosting) inserts.push({ customFieldId: fieldIds.hosting, entityId: id, entityType: 'company', value: TECH_NAMES[hosting] });

    // Server Header
    if (r[I_SERVER]) inserts.push({ customFieldId: fieldIds.server, entityId: id, entityType: 'company', value: r[I_SERVER] });

    // Powered By
    if (r[I_PB]) inserts.push({ customFieldId: fieldIds.powered_by, entityId: id, entityType: 'company', value: r[I_PB] });

    // Generator
    if (r[I_GEN]) inserts.push({ customFieldId: fieldIds.generator, entityId: id, entityType: 'company', value: r[I_GEN] });

    // HTTP Status
    if (r[I_STATUS]) inserts.push({ customFieldId: fieldIds.http_status, entityId: id, entityType: 'company', value: r[I_STATUS] });

    // Final URL
    if (r[I_FINAL]) inserts.push({ customFieldId: fieldIds.final_url, entityId: id, entityType: 'company', value: r[I_FINAL] });

    // Last Tech Scan
    inserts.push({ customFieldId: fieldIds.last_tech_scan, entityId: id, entityType: 'company', value: SCAN_DATE });
  }

  console.log(`\nPrepared ${inserts.length} value rows (skipped ${skippedMissing} CSV rows whose company didn't match client).`);

  if (DRY_RUN) {
    console.log('\n── Dry run — sample of value rows ──');
    for (const v of inserts.slice(0, 12)) {
      const def = FIELDS.find((f) => fieldIds[f.key] === v.customFieldId);
      console.log(`  company ${v.entityId}  ${def?.fieldName ?? '?'}  =  ${v.value.slice(0, 80)}${v.value.length > 80 ? '…' : ''}`);
    }
    console.log(`  …and ${Math.max(0, inserts.length - 12)} more`);
    process.exit(0);
  }

  // Wipe existing values for these fields (company-scope) so the load is clean
  const ourFieldIds = Object.values(fieldIds);
  console.log(`\nWiping existing company values for these ${ourFieldIds.length} fields…`);
  await db
    .delete(crmCustomFieldValues)
    .where(
      and(
        inArray(crmCustomFieldValues.customFieldId, ourFieldIds),
        eq(crmCustomFieldValues.entityType, 'company'),
      ),
    );

  // Bulk INSERT in batches
  const BATCH = 500;
  console.log(`Inserting ${inserts.length} value rows in batches of ${BATCH}…`);
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const chunk = inserts.slice(i, i + BATCH);
    await db.insert(crmCustomFieldValues).values(chunk);
    inserted += chunk.length;
    if (inserted % 2500 === 0 || inserted === inserts.length) {
      console.log(`  ${inserted}/${inserts.length}`);
    }
  }

  // Final tally
  console.log('\n── Done ──');
  console.log(`Custom fields:   ${FIELDS.length} (created or kept)`);
  console.log(`Companies updated: ${validIds.size}`);
  console.log(`Value rows written: ${inserted}`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
