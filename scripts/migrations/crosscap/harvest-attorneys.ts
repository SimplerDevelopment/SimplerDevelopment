/**
 * Harvest family-law attorneys from Justia's directory into the
 * Crossover Capital Advisors CRM (clientId from ids.json).
 *
 * Usage:
 *   npx tsx scripts/migrations/crosscap/harvest-attorneys.ts <state-slug> [maxPages]
 *
 * Examples:
 *   npx tsx scripts/migrations/crosscap/harvest-attorneys.ts pennsylvania
 *   npx tsx scripts/migrations/crosscap/harvest-attorneys.ts new-jersey 5
 *
 * Idempotent: contacts are matched by `JUSTIA_ID:<id>` token written into
 * crm_contacts.notes; firms are matched by (clientId, normalized host).
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { chromium, type Page } from 'playwright';

dotenv.config({ path: '.env' });

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';
const MIN_DELAY_MS = 4500;
const MAX_DELAY_MS = 8500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));

const STATE_SLUG_TO_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district-of-columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new-hampshire': 'NH', 'new-jersey': 'NJ',
  'new-mexico': 'NM', 'new-york': 'NY', 'north-carolina': 'NC',
  'north-dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode-island': 'RI', 'south-carolina': 'SC',
  'south-dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west-virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
};

interface ParsedCard {
  justiaId: string;          // stable per-lawyer numeric id from data-vars-profile
  fullName: string;
  profileUrl: string;
  city: string | null;
  phone: string | null;
  website: string | null;    // raw href
  websiteHost: string | null;// normalized host (e.g., "jordanreillylaw.com")
  tagline: string | null;
  description: string | null;
  rating: string | null;
  premium: boolean;          // paid placement → likely a serious firm
}

function normalizeHost(href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

function splitName(full: string): { first: string; last: string | null } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function titleCaseHost(host: string): string {
  // "weinbergerlaw.com" → "Weinbergerlaw"
  const root = host.split('.')[0];
  return root.charAt(0).toUpperCase() + root.slice(1);
}

async function parsePage(page: Page): Promise<ParsedCard[]> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLDivElement>('.jld-card'));
    return cards.map((card) => {
      const profileLink = card.querySelector<HTMLAnchorElement>('.name a[href]');
      const tel = card.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
      const websiteAnchor = card.querySelector<HTMLAnchorElement>('a[data-vars-action="FeaturedListingWebsite"]');
      const outline = card.querySelector<HTMLElement>('.outline');
      const tagline = card.querySelector<HTMLElement>('.tagline');
      const description = card.querySelector<HTMLElement>('.description');
      const rating = card.querySelector<HTMLElement>('.rating strong');

      // Outline text is "Family Lawyer Serving City, ST"
      const outlineText = outline?.innerText.trim() ?? '';
      const cityMatch = outlineText.match(/Serving\s+(.+)$/i);
      const city = cityMatch ? cityMatch[1].trim() : null;

      const justiaId = card.getAttribute('data-vars-profile') ?? '';
      const premium = (card.className || '').includes('-premium');

      return {
        justiaId,
        fullName: profileLink?.innerText.trim() ?? '',
        profileUrl: profileLink?.href ?? '',
        city,
        phone: tel?.innerText.trim() ?? null,
        website: websiteAnchor?.href ?? null,
        tagline: tagline?.innerText.trim() ?? null,
        description: description?.innerText.replace(/Read More.*$/i, '').trim() || null,
        rating: rating?.innerText.trim() ?? null,
        premium,
      } as Omit<ParsedCard, 'websiteHost'>;
    });
  }).then(records => records.map(r => ({ ...r, websiteHost: normalizeHost(r.website) })));
}

async function nextPageUrl(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    // Pagination is at the bottom; the active link's text is "NEXT"
    const candidates = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
    const next = candidates.find(a => a.innerText.trim().toUpperCase() === 'NEXT' && a.href);
    return next ? next.href : null;
  });
}

async function harvestState(slug: string, maxPages: number) {
  // Accept both "state" and "state/city" — for city scope, the state abbr
  // is taken from the leading state segment, and the URL appends the city.
  const stateRoot = slug.split('/')[0];
  const stateAbbr = STATE_SLUG_TO_ABBR[stateRoot];
  if (!stateAbbr) throw new Error(`Unknown state slug: ${slug}. Use one of: ${Object.keys(STATE_SLUG_TO_ABBR).join(', ')}`);

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;
  if (!clientId) throw new Error('No clientId in ids.json — run restore-standalone-client.ts first');

  const { db } = await import('../../../lib/db');
  const { crmCompanies, crmContacts, crmTags, crmContactTags } = await import('../../../lib/db/schema');
  const { and, eq, ilike, sql } = await import('drizzle-orm');

  // Resolve tag IDs.
  const allTags = await db.select().from(crmTags).where(eq(crmTags.clientId, clientId));
  const tagByName = new Map(allTags.map(t => [t.name, t.id]));
  const stateTagId = tagByName.get(`State: ${stateAbbr}`);
  const familyLawTagId = tagByName.get('Family Law');
  const divorceTagId = tagByName.get('Divorce');
  if (!stateTagId || !familyLawTagId || !divorceTagId) {
    throw new Error('Required tags missing — run setup-crm.ts first');
  }

  console.log(`Harvesting Justia family-law lawyers in ${stateAbbr} (slug=${slug}), max ${maxPages} pages`);

  // Use the real Chrome binary if installed — far less fingerprintable than
  // bundled headless Chromium, which Cloudflare reliably blocks beyond page 1.
  const useRealChrome = process.env.HARVEST_USE_CHROME !== '0';
  const browser = await chromium.launch(
    useRealChrome ? { headless: true, channel: 'chrome' } : { headless: true }
  );
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Chromium";v="127", "Not.A/Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
    },
  });
  const page = await ctx.newPage();

  const startUrl = `https://www.justia.com/lawyers/family-law/${slug}`;
  let pageNum = 0;
  const seenJustiaIds = new Set<string>();
  let totalParsed = 0;
  let totalUpserted = 0;

  while (pageNum < maxPages) {
    pageNum += 1;
    if (pageNum === 1) {
      console.log(`\n[${stateAbbr} page ${pageNum}] ${startUrl}`);
      const resp = await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (!resp || !resp.ok()) { console.warn(`  bad response: ${resp?.status()}`); break; }
    } else {
      // Click NEXT inside the running session (warm cookies, looks human).
      const nextLoc = page.locator('a').filter({ hasText: /^NEXT$/i }).first();
      if ((await nextLoc.count()) === 0) { console.log('  no NEXT link — done'); break; }
      console.log(`\n[${stateAbbr} page ${pageNum}] (clicking NEXT)`);
      // Scroll to the pagination, hover, then click — more human than raw click.
      await nextLoc.scrollIntoViewIfNeeded();
      await sleep(700 + Math.random() * 600);
      await nextLoc.hover();
      await sleep(300 + Math.random() * 400);
      try {
        await Promise.all([
          page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
          nextLoc.click(),
        ]);
      } catch (e) {
        console.warn(`  click NEXT failed: ${(e as Error).message}`);
        break;
      }
      const status = page.url().includes('justia.com') ? 200 : 0;
      if (!status) { console.warn('  navigated off-domain'); break; }
    }
    // Wait up to 25s for the cards to appear — Cloudflare challenge can take time.
    let cardSeen = 0;
    const tStart = Date.now();
    while (Date.now() - tStart < 25000) {
      cardSeen = await page.locator('.jld-card').count();
      if (cardSeen > 0) break;
      await sleep(1500);
    }
    if (cardSeen === 0) {
      console.warn(`  no .jld-card on page after 25s — likely blocked. URL=${page.url()}`);
      const title = await page.title();
      console.warn(`  page title: "${title}"`);
      const dumpPath = `/tmp/justia/blocked-${stateAbbr}-${pageNum}.html`;
      try { fs.writeFileSync(dumpPath, await page.content()); console.warn(`  dumped to ${dumpPath}`); } catch {}
      break;
    }
    const cards = await parsePage(page);

    let upsertedThisPage = 0;
    for (const c of cards) {
      if (!c.justiaId || !c.fullName) continue;
      if (seenJustiaIds.has(c.justiaId)) continue;
      seenJustiaIds.add(c.justiaId);
      totalParsed += 1;

      // ── Firm (crm_companies) ──────────────────────────────────────
      let firmId: number | null = null;
      const firmName = c.websiteHost
        ? titleCaseHost(c.websiteHost)
        : `Solo: ${c.fullName}`;
      const firmDomain = c.websiteHost; // e.g., jordanreillylaw.com

      if (c.websiteHost) {
        const [existing] = await db.select().from(crmCompanies)
          .where(and(eq(crmCompanies.clientId, clientId), eq(crmCompanies.domain, c.websiteHost)))
          .limit(1);
        if (existing) {
          firmId = existing.id;
        } else {
          const [created] = await db.insert(crmCompanies).values({
            clientId,
            name: firmName,
            domain: firmDomain ?? null,
            website: c.website ?? null,
            phone: c.phone ?? null,
            address: c.city ? `${c.city}` : null,
            industry: 'Legal Services',
            notes: `Source: Justia. Discovered via family-law directory for ${stateAbbr}.`,
          }).returning();
          firmId = created.id;
        }
      } else {
        const [existing] = await db.select().from(crmCompanies)
          .where(and(eq(crmCompanies.clientId, clientId), eq(crmCompanies.name, firmName)))
          .limit(1);
        if (existing) firmId = existing.id;
        else {
          const [created] = await db.insert(crmCompanies).values({
            clientId, name: firmName, industry: 'Legal Services',
            phone: c.phone ?? null,
            address: c.city ?? null,
            notes: `Source: Justia. Solo practitioner (no firm website listed).`,
          }).returning();
          firmId = created.id;
        }
      }

      // ── Contact (crm_contacts) ────────────────────────────────────
      const justiaToken = `JUSTIA_ID:${c.justiaId}`;
      const [existingContact] = await db.select().from(crmContacts)
        .where(and(
          eq(crmContacts.clientId, clientId),
          ilike(crmContacts.notes, `%${justiaToken}%`),
        ))
        .limit(1);

      const { first, last } = splitName(c.fullName);
      const notesParts = [
        justiaToken,
        `Justia profile: ${c.profileUrl}`,
        c.tagline ? `Tagline: ${c.tagline}` : null,
        c.rating ? `Rating: ${c.rating}` : null,
        c.premium ? 'Paid placement on Justia' : null,
        c.description ? `\nDescription: ${c.description}` : null,
      ].filter(Boolean).join('\n');

      let contactId: number;
      if (existingContact) {
        await db.update(crmContacts).set({
          companyId: firmId,
          phone: existingContact.phone ?? c.phone ?? null,
          address: existingContact.address ?? c.city ?? null,
          notes: notesParts,
          updatedAt: new Date(),
        }).where(eq(crmContacts.id, existingContact.id));
        contactId = existingContact.id;
      } else {
        const [created] = await db.insert(crmContacts).values({
          clientId,
          companyId: firmId,
          firstName: first,
          lastName: last,
          phone: c.phone ?? null,
          title: 'Family Law Attorney',
          source: 'justia',
          status: 'lead',
          address: c.city ?? null,
          notes: notesParts,
        }).returning();
        contactId = created.id;
      }

      // ── Tags ──────────────────────────────────────────────────────
      const wantedTagIds = [stateTagId, familyLawTagId, divorceTagId];
      // existing tag links for this contact
      const existingLinks = await db.select().from(crmContactTags)
        .where(eq(crmContactTags.contactId, contactId));
      const haveTagIds = new Set(existingLinks.map(l => l.tagId));
      const toInsert = wantedTagIds
        .filter(id => !haveTagIds.has(id))
        .map(tagId => ({ contactId, tagId }));
      if (toInsert.length > 0) await db.insert(crmContactTags).values(toInsert);

      upsertedThisPage += 1;
      totalUpserted += 1;
    }

    console.log(`  parsed ${cards.length} cards, upserted ${upsertedThisPage} (deduped within run)`);
    void sql; void nextPageUrl; // silence unused-symbol warnings

    const wait = jitter();
    console.log(`  ↓ waiting ${(wait / 1000).toFixed(1)}s before next page`);
    await sleep(wait);
  }

  await browser.close();

  console.log(`\n=== ${stateAbbr} HARVEST DONE ===`);
  console.log(`Pages crawled: ${pageNum}, attorneys parsed: ${totalParsed}, upserted: ${totalUpserted}`);
}

async function main() {
  const slug = process.argv[2];
  const maxPages = parseInt(process.argv[3] ?? '6', 10);
  if (!slug) {
    console.error('Usage: harvest-attorneys.ts <state-slug> [maxPages]');
    console.error('State slugs (kebab-case): pennsylvania, new-jersey, new-york, california, ...');
    process.exit(2);
  }
  await harvestState(slug, maxPages);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
