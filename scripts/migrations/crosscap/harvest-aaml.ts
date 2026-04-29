/**
 * Harvest American Academy of Matrimonial Lawyers (AAML) fellows into the
 * Crossover Capital Advisors CRM. AAML fellows are the top family-law
 * attorneys nationwide — exactly Crossover's referral-partner persona.
 *
 * 1,329 fellows, ~16 per page, ~84 pages. No Cloudflare; plain HTTP works.
 *
 * Usage:
 *   npx tsx scripts/migrations/crosscap/harvest-aaml.ts            # all pages
 *   npx tsx scripts/migrations/crosscap/harvest-aaml.ts 5          # first 5 pages
 *   npx tsx scripts/migrations/crosscap/harvest-aaml.ts 5 10       # pages 5..10
 *
 * Idempotent: contacts matched by `AAML_SLUG:<slug>` token in notes;
 * firms matched by (clientId, normalized website host) or by firm name.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';

dotenv.config({ path: '.env' });

const UA = 'SimplerDevelopment Research Bot (info@danielpcoyle.com)';
const POLITE_DELAY_MS = 1500;

interface ParsedFellow {
  slug: string;            // from /lawyer/<slug>/ — stable per-fellow
  fullName: string;
  profileUrl: string;
  firmName: string | null;
  state: string | null;    // e.g., "NY"
  website: string | null;
  websiteHost: string | null;
  imageUrl: string | null;
}

function normalizeHost(href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch { return null; }
}

function splitName(full: string) {
  const parts = full.trim().replace(/\s+/g, ' ').split(' ');
  if (parts.length === 1) return { first: parts[0], last: null as string | null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function titleCaseHost(host: string): string {
  const root = host.split('.')[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function extractSlug(profileUrl: string): string | null {
  const m = profileUrl.match(/\/lawyer\/([^/]+)\/?/);
  return m ? m[1] : null;
}

async function fetchPage(url: string): Promise<string> {
  const resp = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

function parseFellows(html: string): ParsedFellow[] {
  const dom = new JSDOM(html);
  const cards = Array.from(dom.window.document.querySelectorAll<HTMLElement>('.lawyer.type-lawyer'));
  const out: ParsedFellow[] = [];

  for (const card of cards) {
    const nameEl = card.querySelector<HTMLElement>('h2.lawyer-name');
    const nameLink = nameEl?.parentElement as HTMLAnchorElement | null;
    const profileUrl = nameLink?.getAttribute('href') ?? '';
    const slug = extractSlug(profileUrl);
    const fullName = nameEl?.textContent?.trim() ?? '';
    if (!slug || !fullName) continue;

    // The lawyer-wrap holds H3/H4 pairs: Firm:/<firm>, State:/<ST>
    const wrap = card.querySelector<HTMLElement>('.lawyer-wrap');
    const h3s = wrap ? Array.from(wrap.querySelectorAll<HTMLElement>('h3')) : [];
    let firmName: string | null = null;
    let state: string | null = null;
    for (const h3 of h3s) {
      const label = h3.textContent?.trim().replace(':', '').toLowerCase() ?? '';
      const h4 = h3.nextElementSibling as HTMLElement | null;
      const value = h4?.textContent?.trim() || null;
      if (label === 'firm') firmName = value;
      else if (label === 'state') state = value;
    }

    // Website is the first .btn-wrap a[href] whose text starts with "Website".
    const btnWraps = wrap ? Array.from(wrap.querySelectorAll<HTMLElement>('.btn-wrap a[href]')) : [];
    let website: string | null = null;
    for (const a of btnWraps) {
      const txt = a.textContent?.trim().toLowerCase() ?? '';
      const href = (a as HTMLAnchorElement).getAttribute('href') ?? '';
      if (txt.startsWith('website') && href && href !== '#') { website = href; break; }
    }

    const bg = card.querySelector<HTMLElement>('.lawyer-bgrd-img');
    const bgStyle = bg?.getAttribute('style') ?? '';
    const imgMatch = bgStyle.match(/url\(['"]?([^'")]+)['"]?\)/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    out.push({
      slug,
      fullName,
      profileUrl,
      firmName,
      state,
      website,
      websiteHost: normalizeHost(website),
      imageUrl,
    });
  }
  return out;
}

async function main() {
  const argStart = parseInt(process.argv[2] ?? '0', 10);
  const argEnd = parseInt(process.argv[3] ?? '0', 10);

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;
  if (!clientId) throw new Error('No clientId in ids.json — run restore-standalone-client.ts first');

  const { db } = await import('../../../lib/db');
  const { crmCompanies, crmContacts, crmTags, crmContactTags } = await import('../../../lib/db/schema');
  const { and, eq, ilike } = await import('drizzle-orm');

  const allTags = await db.select().from(crmTags).where(eq(crmTags.clientId, clientId));
  const tagByName = new Map(allTags.map(t => [t.name, t.id]));
  const familyLawTagId = tagByName.get('Family Law')!;
  const divorceTagId = tagByName.get('Divorce')!;
  const hnwTagId = tagByName.get('High-Net-Worth')!;
  if (!familyLawTagId || !divorceTagId || !hnwTagId) {
    throw new Error('Required tags missing — run setup-crm.ts first');
  }

  // Probe page 1 to learn total page count.
  const firstHtml = await fetchPage('https://aaml.org/find-a-lawyer/');
  const totalMatch = firstHtml.match(/Found\s+([\d,]+)\s+Results.*?Page\s+\d+\s+of\s+(\d+)/is);
  const totalResults = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : null;
  const lastPage = totalMatch ? parseInt(totalMatch[2], 10) : 84;

  const startPage = argStart > 0 ? argStart : 1;
  const endPage = argEnd > 0 ? Math.min(argEnd, lastPage) : lastPage;
  console.log(`AAML directory: ~${totalResults ?? '?'} fellows across ${lastPage} pages.`);
  console.log(`Crawling pages ${startPage}..${endPage}\n`);

  let totalParsed = 0;
  let totalUpserted = 0;
  let totalFirmsCreated = 0;

  for (let p = startPage; p <= endPage; p++) {
    const url = p === 1 ? 'https://aaml.org/find-a-lawyer/' : `https://aaml.org/find-a-lawyer/page/${p}/`;
    let html: string;
    try {
      html = p === 1 ? firstHtml : await fetchPage(url);
    } catch (e) {
      console.warn(`[page ${p}] FAILED: ${(e as Error).message}`);
      continue;
    }
    const fellows = parseFellows(html);
    let upsertedHere = 0;
    let firmsHere = 0;

    for (const f of fellows) {
      totalParsed += 1;

      // ── Firm ─────────────────────────────────────────────────────
      let firmId: number | null = null;
      const firmKeyName = f.firmName && f.firmName.length > 0
        ? f.firmName
        : (f.websiteHost ? titleCaseHost(f.websiteHost) : `Solo: ${f.fullName}`);

      if (f.websiteHost) {
        const [existing] = await db.select().from(crmCompanies)
          .where(and(eq(crmCompanies.clientId, clientId), eq(crmCompanies.domain, f.websiteHost)))
          .limit(1);
        if (existing) firmId = existing.id;
      }
      if (firmId === null) {
        const [byName] = await db.select().from(crmCompanies)
          .where(and(eq(crmCompanies.clientId, clientId), eq(crmCompanies.name, firmKeyName)))
          .limit(1);
        if (byName) firmId = byName.id;
      }
      if (firmId === null) {
        const [created] = await db.insert(crmCompanies).values({
          clientId,
          name: firmKeyName,
          domain: f.websiteHost ?? null,
          website: f.website ?? null,
          industry: 'Legal Services',
          address: f.state ?? null,
          notes: `Source: AAML. AAML fellow firm — top-tier family-law practice.`,
        }).returning();
        firmId = created.id;
        firmsHere += 1;
      }

      // ── Contact ──────────────────────────────────────────────────
      const slugToken = `AAML_SLUG:${f.slug}`;
      const [existingContact] = await db.select().from(crmContacts)
        .where(and(
          eq(crmContacts.clientId, clientId),
          ilike(crmContacts.notes, `%${slugToken}%`),
        ))
        .limit(1);

      const { first, last } = splitName(f.fullName);
      const notesParts = [
        slugToken,
        `AAML profile: ${f.profileUrl}`,
        `AAML fellow (American Academy of Matrimonial Lawyers)`,
        f.state ? `State: ${f.state}` : null,
        f.firmName ? `Firm: ${f.firmName}` : null,
      ].filter(Boolean).join('\n');

      let contactId: number;
      if (existingContact) {
        await db.update(crmContacts).set({
          companyId: firmId,
          address: existingContact.address ?? f.state ?? null,
          notes: notesParts,
          avatarUrl: existingContact.avatarUrl ?? f.imageUrl ?? null,
          updatedAt: new Date(),
        }).where(eq(crmContacts.id, existingContact.id));
        contactId = existingContact.id;
      } else {
        const [created] = await db.insert(crmContacts).values({
          clientId,
          companyId: firmId,
          firstName: first,
          lastName: last,
          title: 'Family Law Attorney (AAML Fellow)',
          source: 'aaml',
          status: 'lead',
          address: f.state ?? null,
          avatarUrl: f.imageUrl ?? null,
          notes: notesParts,
        }).returning();
        contactId = created.id;
      }

      // ── Tags ────────────────────────────────────────────────────
      const stateTagId = f.state ? tagByName.get(`State: ${f.state}`) : undefined;
      const wantedTagIds = [familyLawTagId, divorceTagId, hnwTagId, ...(stateTagId ? [stateTagId] : [])];
      const existingLinks = await db.select().from(crmContactTags)
        .where(eq(crmContactTags.contactId, contactId));
      const haveTagIds = new Set(existingLinks.map(l => l.tagId));
      const toInsert = wantedTagIds.filter(id => !haveTagIds.has(id)).map(tagId => ({ contactId, tagId }));
      if (toInsert.length > 0) await db.insert(crmContactTags).values(toInsert);

      upsertedHere += 1;
      totalUpserted += 1;
    }

    totalFirmsCreated += firmsHere;
    console.log(`[page ${p.toString().padStart(2)}] parsed ${fellows.length}, upserted ${upsertedHere} contacts, created ${firmsHere} new firms`);

    if (p < endPage) await new Promise(r => setTimeout(r, POLITE_DELAY_MS));
  }

  console.log(`\n=== AAML HARVEST DONE ===`);
  console.log(`Pages: ${endPage - startPage + 1}, parsed: ${totalParsed}, upserted: ${totalUpserted}, new firms: ${totalFirmsCreated}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
