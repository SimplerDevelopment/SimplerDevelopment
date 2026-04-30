/**
 * Generate a markdown end-of-night status report and write it to
 * scripts/migrations/crosscap/REPORT.md. Reads everything live from the DB.
 *
 *   npx tsx scripts/migrations/crosscap/report.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmCompanies, crmContacts, crmCustomFields, crmCustomFieldValues, crmTags, crmContactTags } = await import('../../../lib/db/schema');
  const { and, eq, sql, isNotNull, isNull, inArray } = await import('drizzle-orm');

  // ── Headline counts ────────────────────────────────────────────────
  const [{ totalCompanies }]    = await db.select({ totalCompanies: sql<number>`count(*)::int` }).from(crmCompanies).where(eq(crmCompanies.clientId, clientId));
  const [{ companiesWithSite }] = await db.select({ companiesWithSite: sql<number>`count(*)::int` }).from(crmCompanies).where(and(eq(crmCompanies.clientId, clientId), isNotNull(crmCompanies.website)));
  const [{ totalContacts }]     = await db.select({ totalContacts: sql<number>`count(*)::int` }).from(crmContacts).where(eq(crmContacts.clientId, clientId));
  const [{ withEmail }]         = await db.select({ withEmail: sql<number>`count(*)::int` }).from(crmContacts).where(and(eq(crmContacts.clientId, clientId), isNotNull(crmContacts.email)));
  const [{ withPhone }]         = await db.select({ withPhone: sql<number>`count(*)::int` }).from(crmContacts).where(and(eq(crmContacts.clientId, clientId), isNotNull(crmContacts.phone)));
  const [{ withLinkedin }]      = await db.select({ withLinkedin: sql<number>`count(*)::int` }).from(crmContacts).where(and(eq(crmContacts.clientId, clientId), isNotNull(crmContacts.linkedinUrl)));
  const sourceRows = await db.select({ src: crmContacts.source, c: sql<number>`count(*)::int` })
    .from(crmContacts).where(eq(crmContacts.clientId, clientId)).groupBy(crmContacts.source);

  // ── Custom field counts ────────────────────────────────────────────
  const fields = await db.select().from(crmCustomFields).where(eq(crmCustomFields.clientId, clientId));
  const fieldStats: Array<{ entity: string; name: string; populated: number }> = [];
  for (const f of fields) {
    const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, f.id),
      eq(crmCustomFieldValues.entityType, f.entityType),
    ));
    fieldStats.push({ entity: f.entityType, name: f.fieldName, populated: c });
  }

  // ── Crawl breakdown ────────────────────────────────────────────────
  const statusFid = fields.find(f => f.entityType === 'company' && f.fieldName === 'Website Crawl Status')?.id;
  const statusBreakdown: Record<string, number> = {};
  if (statusFid) {
    const rows = await db.select({ value: crmCustomFieldValues.value }).from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, statusFid),
      eq(crmCustomFieldValues.entityType, 'company'),
    ));
    for (const r of rows) statusBreakdown[r.value ?? 'null'] = (statusBreakdown[r.value ?? 'null'] ?? 0) + 1;
  }

  const aamlFid = fields.find(f => f.entityType === 'company' && f.fieldName === 'AAML Affiliation')?.id;
  const aamlBreakdown: Record<string, number> = {};
  if (aamlFid) {
    const rows = await db.select({ value: crmCustomFieldValues.value }).from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, aamlFid),
      eq(crmCustomFieldValues.entityType, 'company'),
    ));
    for (const r of rows) aamlBreakdown[r.value ?? 'null'] = (aamlBreakdown[r.value ?? 'null'] ?? 0) + 1;
  }

  const sizeFid = fields.find(f => f.entityType === 'company' && f.fieldName === 'Firm Size')?.id;
  const sizeBreakdown: Record<string, number> = {};
  if (sizeFid) {
    const rows = await db.select({ value: crmCustomFieldValues.value }).from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, sizeFid),
      eq(crmCustomFieldValues.entityType, 'company'),
    ));
    for (const r of rows) sizeBreakdown[r.value ?? 'null'] = (sizeBreakdown[r.value ?? 'null'] ?? 0) + 1;
  }

  // ── Tag counts (top tags by usage) ─────────────────────────────────
  const tags = await db.select().from(crmTags).where(eq(crmTags.clientId, clientId));
  const tagCounts: Array<{ name: string; count: number; tagId: number }> = [];
  for (const t of tags) {
    const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(crmContactTags).where(eq(crmContactTags.tagId, t.id));
    tagCounts.push({ name: t.name, count: c, tagId: t.id });
  }

  // ── State coverage (Top 15 + total states) ─────────────────────────
  const stateTags = tagCounts.filter(t => /^State:\s*[A-Z]{2}$/.test(t.name)).sort((a, b) => b.count - a.count);

  // ── Tier 1 segment description ─────────────────────────────────────
  const tier1Tag = tagCounts.find(t => t.name === 'Tier 1 Prospect');

  // ── Render report ──────────────────────────────────────────────────
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  lines.push(`# Crossover Capital — CRM Status Report (${today})`);
  lines.push('');
  lines.push(`Auto-generated by \`scripts/migrations/crosscap/report.ts\`. Re-run any time.`);
  lines.push('');

  lines.push('## Headline');
  lines.push('');
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| Firms (companies) | **${totalCompanies}** |`);
  lines.push(`|   with website | ${companiesWithSite} (${pct(companiesWithSite, totalCompanies)}) |`);
  lines.push(`| Contacts (attorneys) | **${totalContacts}** |`);
  lines.push(`|   with email | ${withEmail} (${pct(withEmail, totalContacts)}) |`);
  lines.push(`|   with phone | ${withPhone} (${pct(withPhone, totalContacts)}) |`);
  lines.push(`|   with LinkedIn | ${withLinkedin} (${pct(withLinkedin, totalContacts)}) |`);
  lines.push('');

  lines.push('### Sources');
  lines.push('');
  for (const r of sourceRows.sort((a, b) => b.c - a.c)) {
    lines.push(`- \`${r.src ?? 'null'}\`: ${r.c}`);
  }
  lines.push('');

  lines.push('## Crawl status (firms with a website)');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|---|---:|');
  for (const [k, v] of Object.entries(statusBreakdown).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('');

  lines.push('## Firm Size distribution');
  lines.push('');
  lines.push('| Bucket | Count |');
  lines.push('|---|---:|');
  const sizeOrder = ['Solo', '2–5 attorneys', '6–20 attorneys', '21–50 attorneys', '51+ attorneys'];
  for (const k of sizeOrder) {
    if (sizeBreakdown[k]) lines.push(`| ${k} | ${sizeBreakdown[k]} |`);
  }
  lines.push('');

  lines.push('## AAML Affiliation');
  lines.push('');
  lines.push('| Bucket | Firms |');
  lines.push('|---|---:|');
  for (const [k, v] of Object.entries(aamlBreakdown).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('');

  lines.push('## Custom-field population');
  lines.push('');
  lines.push('| Entity | Field | Populated |');
  lines.push('|---|---|---:|');
  // Firm-side fields first
  for (const f of fieldStats.filter(f => f.entity === 'company').sort((a, b) => b.populated - a.populated)) {
    lines.push(`| company | ${f.name} | ${f.populated} |`);
  }
  for (const f of fieldStats.filter(f => f.entity === 'contact').sort((a, b) => b.populated - a.populated)) {
    lines.push(`| contact | ${f.name} | ${f.populated} |`);
  }
  lines.push('');

  if (tier1Tag) {
    lines.push('## Tier 1 Prospect segment');
    lines.push('');
    lines.push(`Crossover-aligned attorneys (≥2 of: AAML Fellow, HNW focus, Family Business, Crypto, Forensic) **with at least one outreach channel**.`);
    lines.push('');
    lines.push(`**${tier1Tag.count}** attorneys tagged \`Tier 1 Prospect\`.`);
    lines.push('');
  }

  lines.push('## State coverage');
  lines.push('');
  lines.push(`Active state tags: **${stateTags.filter(t => t.count > 0).length}** of 51.`);
  lines.push('');
  lines.push('Top 15:');
  lines.push('');
  lines.push('| State | Contacts |');
  lines.push('|---|---:|');
  for (const s of stateTags.slice(0, 15)) {
    lines.push(`| ${s.name.replace('State: ', '')} | ${s.count} |`);
  }
  lines.push('');

  lines.push('## Practice tags');
  lines.push('');
  lines.push('| Tag | Contacts |');
  lines.push('|---|---:|');
  for (const t of tagCounts.filter(t => !/^State:/.test(t.name)).sort((a, b) => b.count - a.count)) {
    lines.push(`| ${t.name} | ${t.count} |`);
  }
  lines.push('');

  const outPath = path.join(__dirname, 'REPORT.md');
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${outPath} (${lines.length} lines)`);
  process.exit(0);
}

function pct(n: number, d: number): string {
  if (!d) return '0%';
  return `${Math.round(n / d * 100)}%`;
}

main().catch(e => { console.error(e); process.exit(1); });
