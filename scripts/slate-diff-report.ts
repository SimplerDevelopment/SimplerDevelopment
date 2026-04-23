/**
 * One-time: compare the pre-existing `Slate Enabled` / `Slate Org Participant`
 * custom fields against the new `Uses Slate` field this scan produced.
 *
 * Output: scripts/output/slate-diff-<ts>.csv with one row per company that has
 * any slate-related field set, showing all signal columns side-by-side and a
 * `verdict` column flagging conflicts.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import * as fs from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);
function argVal(name: string, def?: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return def;
  return args[idx + 1];
}
const EMAIL = argVal('--email', 'postcaptain@simplerdevelopment.com')!;
const CLIENT_ID_ARG = argVal('--client-id');

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

(async () => {
  const { db } = await import('../lib/db');
  const { users, clients, crmCompanies, crmCustomFields, crmCustomFieldValues } = await import('../lib/db/schema');
  const { eq, and, inArray } = await import('drizzle-orm');

  let clientId: number;
  if (CLIENT_ID_ARG) {
    clientId = parseInt(CLIENT_ID_ARG, 10);
  } else {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
    if (!u) { console.error(`No user with email ${EMAIL}`); process.exit(1); }
    const [c] = await db.select({ id: clients.id, company: clients.company }).from(clients).where(eq(clients.userId, u.id)).limit(1);
    if (!c) { console.error(`User ${u.id} has no client`); process.exit(1); }
    clientId = c.id;
    console.log(`Resolved ${EMAIL} → client ${clientId} ("${c.company ?? '—'}")`);
  }

  // Find every slate-related field for this client (anything with "slate" in its name)
  const fields = await db
    .select({ id: crmCustomFields.id, fieldName: crmCustomFields.fieldName, fieldType: crmCustomFields.fieldType })
    .from(crmCustomFields)
    .where(and(eq(crmCustomFields.clientId, clientId), eq(crmCustomFields.entityType, 'company')));

  const slateFields = fields.filter((f) => /slate/i.test(f.fieldName));
  console.log(`\nFound ${slateFields.length} slate-related field(s):`);
  for (const f of slateFields) console.log(`  id=${f.id}  ${f.fieldName}  (${f.fieldType})`);
  if (slateFields.length === 0) { console.error('Nothing to compare.'); process.exit(1); }

  const fieldIds = slateFields.map((f) => f.id);

  // Pull all values for these fields
  const vals = await db
    .select({
      entityId: crmCustomFieldValues.entityId,
      customFieldId: crmCustomFieldValues.customFieldId,
      value: crmCustomFieldValues.value,
    })
    .from(crmCustomFieldValues)
    .where(and(inArray(crmCustomFieldValues.customFieldId, fieldIds), eq(crmCustomFieldValues.entityType, 'company')));

  // Pivot: entityId → { fieldName: value }
  const fieldNameById = new Map(slateFields.map((f) => [f.id, f.fieldName]));
  const byEntity = new Map<number, Record<string, string>>();
  for (const v of vals) {
    const fname = fieldNameById.get(v.customFieldId)!;
    const cur = byEntity.get(v.entityId) ?? {};
    cur[fname] = v.value ?? '';
    byEntity.set(v.entityId, cur);
  }

  const entityIds = [...byEntity.keys()];
  console.log(`\n${entityIds.length} companies have at least one slate signal set.`);

  // Hydrate company name + website
  const companies = new Map<number, { name: string; website: string | null }>();
  for (let i = 0; i < entityIds.length; i += 1000) {
    const chunk = entityIds.slice(i, i + 1000);
    const rows = await db
      .select({ id: crmCompanies.id, name: crmCompanies.name, website: crmCompanies.website })
      .from(crmCompanies)
      .where(and(eq(crmCompanies.clientId, clientId), inArray(crmCompanies.id, chunk)));
    for (const r of rows) companies.set(r.id, { name: r.name, website: r.website });
  }

  // Verdict logic — compare Uses Slate (new) vs the legacy boolean-ish fields
  function truthy(v: string | undefined): boolean | null {
    if (v === undefined || v === '') return null;
    const s = v.toLowerCase().trim();
    if (['true', 'yes', '1'].includes(s)) return true;
    if (['false', 'no', '0'].includes(s)) return false;
    return null;
  }
  const NEW_FIELD = 'Uses Slate';
  const LEGACY_NAMES = slateFields.map((f) => f.fieldName).filter((n) => n !== NEW_FIELD);

  // Tallies
  let agree = 0, conflictNewYesLegacyNo = 0, conflictNewNoLegacyYes = 0, newOnly = 0, legacyOnly = 0, maybe = 0;

  // Build CSV rows
  const headerCols = ['company_id', 'company_name', 'website', NEW_FIELD, ...LEGACY_NAMES, 'verdict'];
  const lines: string[] = [headerCols.join(',')];

  // Stable row order: by company_id
  entityIds.sort((a, b) => a - b);
  for (const id of entityIds) {
    const co = companies.get(id);
    if (!co) continue; // company belongs to another client / deleted
    const v = byEntity.get(id)!;
    const newVal = v[NEW_FIELD] ?? '';
    const newBool = newVal === 'Yes' ? true : newVal === 'No' ? false : null; // 'Maybe' → null

    const legacyBools = LEGACY_NAMES.map((n) => truthy(v[n]));
    const anyLegacyTrue = legacyBools.some((b) => b === true);
    const anyLegacyFalse = legacyBools.some((b) => b === false);

    let verdict: string;
    if (newVal === 'Maybe') { verdict = 'maybe (review)'; maybe++; }
    else if (newBool === true && anyLegacyTrue) { verdict = 'agree: both YES'; agree++; }
    else if (newBool === false && anyLegacyFalse && !anyLegacyTrue) { verdict = 'agree: both NO'; agree++; }
    else if (newBool === true && anyLegacyFalse && !anyLegacyTrue) { verdict = 'CONFLICT: new=YES, legacy=NO'; conflictNewYesLegacyNo++; }
    else if (newBool === false && anyLegacyTrue) { verdict = 'CONFLICT: new=NO, legacy=YES'; conflictNewNoLegacyYes++; }
    else if (newBool !== null && legacyBools.every((b) => b === null)) { verdict = 'new only (no legacy signal)'; newOnly++; }
    else if (newBool === null && (anyLegacyTrue || anyLegacyFalse)) { verdict = 'legacy only (no new signal)'; legacyOnly++; }
    else { verdict = 'indeterminate'; }

    lines.push([
      id,
      csvEscape(co.name),
      csvEscape(co.website ?? ''),
      csvEscape(newVal),
      ...LEGACY_NAMES.map((n) => csvEscape(v[n] ?? '')),
      csvEscape(verdict),
    ].join(','));
  }

  const outDir = path.join('scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `slate-diff-client${clientId}-${ts}.csv`);
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`\nWrote ${lines.length - 1} rows to ${outPath}`);

  console.log('\n── Verdict tallies ──');
  console.log(`agree:                          ${agree}`);
  console.log(`maybe (needs review):           ${maybe}`);
  console.log(`new YES, legacy NO  (conflict): ${conflictNewYesLegacyNo}`);
  console.log(`new NO,  legacy YES (conflict): ${conflictNewNoLegacyYes}`);
  console.log(`new only (no legacy signal):    ${newOnly}`);
  console.log(`legacy only (no new signal):    ${legacyOnly}`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
