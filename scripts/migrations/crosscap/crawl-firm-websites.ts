/**
 * Crawl each law firm's own website to:
 *   • discover additional attorneys at the firm (and add them as contacts)
 *   • capture firm-level signals → custom fields (HNW focus, crypto, etc.)
 *   • collect LinkedIn / Twitter / Facebook URLs from footer/header
 *   • populate "Practice Areas (Crawled)" with a short snippet
 *   • record per-attorney bio snippet + LinkedIn when found
 *
 * Usage:
 *   npx tsx scripts/migrations/crosscap/crawl-firm-websites.ts          # all uncrawled
 *   npx tsx scripts/migrations/crosscap/crawl-firm-websites.ts 50       # cap to 50 firms
 *   npx tsx scripts/migrations/crosscap/crawl-firm-websites.ts 50 1     # firms 1..50 by id asc
 *
 * Idempotent: skips firms whose "Website Crawled At" custom field is set.
 * Pass FORCE=1 env to re-crawl already-done firms.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { JSDOM } from 'jsdom';

dotenv.config({ path: '.env' });

// Best-effort: keep the worker alive on stray async errors from jsdom / fetch.
// We don't want a single broken homepage's CSS to take down a multi-hour shard.
process.on('uncaughtException', (e) => { console.error('[uncaughtException]', (e as Error).message); });
process.on('unhandledRejection', (e) => { console.error('[unhandledRejection]', (e as Error)?.message ?? e); });

const UA ='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36 SimplerDevResearchBot/1.0 (info@danielpcoyle.com)';
const FETCH_TIMEOUT_MS = 5000;         // tighter — slow hosts kill throughput
const INTRA_FIRM_DELAY_MS = 200;
const PER_FIRM_DELAY_MS = 250;
const MAX_PROFILES_PER_FIRM = 8;
const CONCURRENCY = parseInt(process.env.CRAWL_CONCURRENCY ?? '3', 10);

// ── Heuristic keyword maps for firm-level inference ────────────────────
const HNW_PRIMARY = /(ultra[-\s]high[-\s]net[-\s]worth|complex high[-\s]net[-\s]worth|complex (?:asset|estate)|wealthy clientele|high asset divorce|high[-\s]net[-\s]worth divorce)/i;
const HNW_SOME    = /(high[-\s]net[-\s]worth|hnw|affluent|substantial assets)/i;
const CRYPTO_SOPH = /(cryptocurrency disputes|digital asset (?:disputes|valuation)|cryptocurrency in divorce|crypto[-\s]asset (?:disputes|valuation|tracing))/i;
const CRYPTO_SOME = /(cryptocurrency|crypto|bitcoin|digital assets?|blockchain)/i;
const FAMILY_BIZ  = /(closely[-\s]held|family[-\s]owned business|family business|business valuation|business succession|succession planning)/i;
const CDFA_ON     = /(CDFA|Certified Divorce Financial Analyst)/i;
const FORENSIC    = /(forensic accountant|forensic accounting|forensic CPA)/i;
const MEDIATION   = /(mediation|collaborative divorce|collaborative law|collaborative practice|cooperative divorce)/i;

// Discovery hints — paths likely to host the team listing.
const TEAM_PATH_HINTS = [
  '/our-team', '/team', '/attorneys', '/lawyers', '/our-attorneys',
  '/our-lawyers', '/people', '/our-people', '/firm/attorneys',
  '/about/team', '/about/attorneys', '/our-firm/attorneys',
];

interface FieldRef { id: number; entityType: 'company' | 'contact'; fieldName: string; }

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!r.ok) return null;
    const text = await r.text();
    return { html: text, finalUrl: r.url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function abs(href: string, base: string): string | null {
  try { return new URL(href, base).toString(); } catch { return null; }
}

// JSDOM occasionally throws inside its CSS parser (cssstyle/cssom) on malformed
// inline styles. We only need anchors and <p> text, so strip style/script blocks
// and wrap construction in try/catch to keep workers alive.
function safeJsdom(html: string, url?: string): JSDOM | null {
  const cleaned = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
  try {
    return url ? new JSDOM(cleaned, { url }) : new JSDOM(cleaned);
  } catch {
    return null;
  }
}

function sameHost(href: string, base: string): boolean {
  try {
    const a = new URL(href);
    const b = new URL(base);
    return a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');
  } catch { return false; }
}

function findTeamPageUrl(homeHtml: string, homeUrl: string): string | null {
  const dom = safeJsdom(homeHtml, homeUrl);
  if (!dom) return null;
  const links = Array.from(dom.window.document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  // 1) Exact path hints, prioritized
  for (const hint of TEAM_PATH_HINTS) {
    const found = links.find(a => {
      const href = a.getAttribute('href') ?? '';
      return new RegExp(hint.replace('/', '\\/') + '/?$', 'i').test(href.split('?')[0]);
    });
    if (found) {
      const u = abs(found.getAttribute('href')!, homeUrl);
      if (u && sameHost(u, homeUrl)) return u;
    }
  }
  // 2) Anchor text fallback
  for (const a of links) {
    const text = (a.textContent ?? '').trim().toLowerCase();
    const href = a.getAttribute('href') ?? '';
    if (!href) continue;
    if (/^(our )?(attorneys|lawyers|team|our team|our people|people)$/.test(text)) {
      const u = abs(href, homeUrl);
      if (u && sameHost(u, homeUrl)) return u;
    }
  }
  return null;
}

interface AttorneyHit { name: string; profileUrl: string; }

function findAttorneyProfiles(teamHtml: string, teamUrl: string): AttorneyHit[] {
  const dom = safeJsdom(teamHtml, teamUrl);
  const out: AttorneyHit[] = [];
  if (!dom) return out;
  const seen = new Set<string>();

  // Heuristic: look for anchors whose href contains "/attorney/", "/lawyer/", "/our-team/<slug>"
  // or "/people/<slug>" etc., and whose visible text looks like a person name (≤4 words, capitalized).
  const anchors = Array.from(dom.window.document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  for (const a of anchors) {
    const href = a.getAttribute('href') ?? '';
    if (!/\/(attorney|lawyer|attorneys|lawyers|our-team|team|people)\/[a-z0-9][a-z0-9\-_]*\/?$/i.test(href.split('?')[0])) continue;
    const text = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text || text.length > 60) continue;
    if (text.split(' ').length < 2 || text.split(' ').length > 5) continue;
    // Capitalized words only — eliminates "Read Full Bio".
    if (!/^[A-Z][a-zA-Z'.\-]+(\s+[A-Z][a-zA-Z'.\-]+)+/.test(text)) continue;
    const u = abs(href, teamUrl);
    if (!u || !sameHost(u, teamUrl)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ name: text, profileUrl: u });
    if (out.length >= MAX_PROFILES_PER_FIRM) break;
  }
  return out;
}

interface ProfileFacts {
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  bioSnippet: string | null;
}

function parseProfile(html: string): ProfileFacts {
  // mailto / tel
  let email: string | null = null;
  const mailM = Array.from(html.matchAll(/mailto:([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})/gi));
  for (const m of mailM) { email = m[1].toLowerCase(); break; }
  let phone: string | null = null;
  const telM = Array.from(html.matchAll(/tel:([+\d().\s\-]+)/gi));
  for (const m of telM) {
    const digits = m[1].replace(/[^\d]/g, '').replace(/^1(?=\d{10}$)/, '');
    if (digits.length >= 10) {
      phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
      break;
    }
  }

  // LinkedIn
  let linkedinUrl: string | null = null;
  const liM = html.match(/href=["']([^"']*linkedin\.com\/in\/[^"'?]+)/i);
  if (liM) linkedinUrl = liM[1];

  // Bio snippet — the first <p> with reasonable length inside the body.
  let bioSnippet: string | null = null;
  const dom = safeJsdom(html);
  if (dom) {
    const ps = Array.from(dom.window.document.querySelectorAll<HTMLParagraphElement>('p'));
    for (const p of ps) {
      const t = (p.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (t.length >= 80 && t.length <= 500) { bioSnippet = t; break; }
      if (t.length > 500) { bioSnippet = t.slice(0, 480) + '…'; break; }
    }
  }

  return { email, phone, linkedinUrl, bioSnippet };
}

function inferCompanySignals(allText: string) {
  const tl = allText;
  return {
    hnwFocus:
      HNW_PRIMARY.test(tl) ? 'Primary focus' :
      HNW_SOME.test(tl)    ? 'Significant'   : null,
    cryptoExp:
      CRYPTO_SOPH.test(tl) ? 'Sophisticated' :
      CRYPTO_SOME.test(tl) ? 'Some'          : null,
    familyBiz:  FAMILY_BIZ.test(tl)  || null,
    cdfaOn:     CDFA_ON.test(tl)     || null,
    forensic:   FORENSIC.test(tl)    || null,
    mediation:  MEDIATION.test(tl)   || null,
  };
}

function findFirmSocials(homeHtml: string): { linkedinUrl: string | null; twitterUrl: string | null; facebookUrl: string | null; } {
  const linkedin = homeHtml.match(/href=["']([^"']*linkedin\.com\/(?:company|school|in)\/[^"'?#]+)/i)?.[1] ?? null;
  const twitter  = homeHtml.match(/href=["']([^"']*(?:twitter|x)\.com\/[A-Za-z0-9_]{1,15})/i)?.[1] ?? null;
  const facebook = homeHtml.match(/href=["']([^"']*facebook\.com\/[^"'?#\/]+)/i)?.[1] ?? null;
  return { linkedinUrl: linkedin, twitterUrl: twitter, facebookUrl: facebook };
}

function extractPracticeSnippet(homeHtml: string): string | null {
  const m = homeHtml.match(/(?:Practice Areas|Areas of Practice|Our Services|Services|What We Do)[^<]{0,4}<\/[^>]+>([\s\S]{0,2500})/i);
  if (!m) return null;
  // Aggressively strip script/style/HTML tags, decode common entities, collapse.
  let text = m[1]
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<source[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Drop trailing CTAs / copyright cruft.
  text = text.replace(/(Contact Us|Read More|Learn More|FAQs?|Resources|Client Reviews|Testimonials)\b[\s\S]*$/i, '').trim();
  if (text.length < 20) return null;
  return text.slice(0, 300);
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null as string | null };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

async function ensureExtraCustomFields(clientId: number) {
  const { db } = await import('../../../lib/db');
  const { crmCustomFields } = await import('../../../lib/db/schema');
  const { and, eq } = await import('drizzle-orm');

  type FieldType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'url' | 'email' | 'phone' | 'boolean';
  const extras: Array<{
    entityType: 'company' | 'contact';
    fieldName: string;
    fieldType: FieldType;
    options?: string[];
    filterable?: boolean;
    category?: string;
  }> = [
    { entityType: 'company', fieldName: 'Website Crawled At', fieldType: 'date', category: 'Crawl Audit' },
    { entityType: 'company', fieldName: 'Website Crawl Status', fieldType: 'select',
      options: ['Success', 'No team page found', 'Fetch failed', 'JS-rendered (no static content)', 'Blocked'],
      filterable: true, category: 'Crawl Audit' },
    { entityType: 'company', fieldName: 'Practice Areas (Crawled)', fieldType: 'text', category: 'Practice Profile' },
    { entityType: 'contact', fieldName: 'Bio Snippet', fieldType: 'text', category: 'Outreach' },
  ];

  const result: Record<string, FieldRef> = {};
  for (const def of extras) {
    const [existing] = await db.select().from(crmCustomFields).where(and(
      eq(crmCustomFields.clientId, clientId),
      eq(crmCustomFields.entityType, def.entityType),
      eq(crmCustomFields.fieldName, def.fieldName),
    )).limit(1);
    let id: number;
    if (existing) {
      id = existing.id;
    } else {
      const [created] = await db.insert(crmCustomFields).values({
        clientId,
        entityType: def.entityType,
        fieldName: def.fieldName,
        fieldType: def.fieldType,
        options: def.options ?? null,
        filterable: def.filterable ?? false,
        category: def.category ?? null,
        sortOrder: 99,
      }).returning();
      id = created.id;
      console.log(`  + ${def.entityType} field: ${def.fieldName}`);
    }
    result[`${def.entityType}:${def.fieldName}`] = { id, entityType: def.entityType, fieldName: def.fieldName };
  }
  return result;
}

async function main() {
  const cap = parseInt(process.argv[2] ?? '0', 10) || Infinity;
  const startId = parseInt(process.argv[3] ?? '0', 10) || 0;
  const force = process.env.FORCE === '1';

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmCompanies, crmContacts, crmCustomFieldValues, crmCustomFields, crmContactTags, crmTags } =
    await import('../../../lib/db/schema');
  const { and, eq, isNotNull, gte, sql, ilike } = await import('drizzle-orm');

  console.log('Ensuring crawler-specific custom fields…');
  const extra = await ensureExtraCustomFields(clientId);

  // Pre-load all custom fields into a name→id map (companies + contacts).
  const allFields = await db.select().from(crmCustomFields).where(eq(crmCustomFields.clientId, clientId));
  const fieldId = (entity: 'company' | 'contact', name: string) =>
    allFields.find(f => f.entityType === entity && f.fieldName === name)?.id;

  // Helper: idempotent custom field upsert
  async function upsertField(entityType: 'company' | 'contact', entityId: number, fieldNm: string, value: string) {
    const id = fieldId(entityType, fieldNm);
    if (!id) return;
    const [existing] = await db.select().from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, id),
      eq(crmCustomFieldValues.entityId, entityId),
      eq(crmCustomFieldValues.entityType, entityType),
    )).limit(1);
    if (existing) {
      if (existing.value === value) return;
      await db.update(crmCustomFieldValues).set({ value, updatedAt: new Date() }).where(eq(crmCustomFieldValues.id, existing.id));
    } else {
      await db.insert(crmCustomFieldValues).values({ customFieldId: id, entityId, entityType, value });
    }
  }

  // Pull firms with websites, optionally skip already-crawled.
  const crawledFieldId = extra['company:Website Crawled At'].id;
  const allFirms = await db.select().from(crmCompanies)
    .where(and(eq(crmCompanies.clientId, clientId), isNotNull(crmCompanies.website)));
  const firms = allFirms.filter(f => f.id >= startId).sort((a, b) => a.id - b.id);

  console.log(`Firms with website: ${firms.length} (force=${force}, cap=${cap === Infinity ? 'none' : cap})\n`);

  let processed = 0, fetchOk = 0, teamFound = 0, profilesParsed = 0,
      newContacts = 0, signalsWritten = 0, socialsWritten = 0;

  // Pre-skim the already-crawled set in one query so worker startup is cheap.
  const alreadyCrawled = new Set<number>(
    (await db.select({ entityId: crmCustomFieldValues.entityId }).from(crmCustomFieldValues)
      .where(and(
        eq(crmCustomFieldValues.customFieldId, crawledFieldId),
        eq(crmCustomFieldValues.entityType, 'company'),
      ))).map(r => r.entityId),
  );

  // Optional sharding: SHARD=n/m → only handle firms where (id % m) === n.
  // Lets multiple processes carve up the queue without overlap.
  const shardEnv = (process.env.SHARD ?? '').match(/^(\d+)\/(\d+)$/);
  const shardN = shardEnv ? parseInt(shardEnv[1], 10) : 0;
  const shardM = shardEnv ? parseInt(shardEnv[2], 10) : 1;

  const queue = firms.filter(f =>
    (force || !alreadyCrawled.has(f.id)) &&
    (f.id % shardM) === shardN
  );
  console.log(`Shard ${shardN}/${shardM} | already crawled: ${alreadyCrawled.size} | this shard remaining: ${queue.length} | concurrency=${CONCURRENCY}\n`);

  let cursor = 0;
  async function worker(workerId: number) {
    while (true) {
      if (processed >= cap) return;
      const my = cursor++;
      if (my >= queue.length) return;
      const firm = queue[my];
      processed += 1;
      const tag = `[w${workerId} ${processed}/${Math.min(cap, queue.length)}]`;

      const homeUrl = firm.website!;
      const home = await fetchHtml(homeUrl);
      if (!home) {
        console.log(`${tag} firm ${firm.id} ${firm.name} → FETCH FAILED`);
        await upsertField('company', firm.id, 'Website Crawl Status', 'Fetch failed');
        await upsertField('company', firm.id, 'Website Crawled At', new Date().toISOString().slice(0, 10));
        await new Promise(r => setTimeout(r, PER_FIRM_DELAY_MS));
        continue;
      }
      fetchOk += 1;
      await crawlFirm(firm, home, tag);
      await new Promise(r => setTimeout(r, PER_FIRM_DELAY_MS));
    }
  }

  // Per-firm crawl logic, after we have the homepage HTML.
  async function crawlFirm(firm: typeof firms[number], home: { html: string; finalUrl: string }, tag: string) {
    const homeUrl = firm.website!;

    // Firm socials + practice areas snippet
    const socials = findFirmSocials(home.html);
    const firmUpdates: Partial<typeof crmCompanies.$inferInsert> = {};
    if (socials.linkedinUrl && !firm.linkedinUrl) firmUpdates.linkedinUrl = socials.linkedinUrl;
    if (socials.twitterUrl && !firm.twitterUrl)   firmUpdates.twitterUrl  = socials.twitterUrl;
    if (socials.facebookUrl && !firm.facebookUrl) firmUpdates.facebookUrl = socials.facebookUrl;
    if (Object.keys(firmUpdates).length) {
      await db.update(crmCompanies).set({ ...firmUpdates, updatedAt: new Date() }).where(eq(crmCompanies.id, firm.id));
      socialsWritten += 1;
    }
    const practice = extractPracticeSnippet(home.html);
    if (practice) await upsertField('company', firm.id, 'Practice Areas (Crawled)', practice);

    // Find team page
    const teamUrl = findTeamPageUrl(home.html, home.finalUrl);
    if (!teamUrl) {
      // still infer signals from home
      const sig = inferCompanySignals(home.html);
      let any = false;
      if (sig.hnwFocus)  { await upsertField('company', firm.id, 'HNW Divorce Focus', sig.hnwFocus); any = true; }
      if (sig.cryptoExp) { await upsertField('company', firm.id, 'Crypto-Asset Experience', sig.cryptoExp); any = true; }
      if (sig.familyBiz) { await upsertField('company', firm.id, 'Family Business / Closely-Held Assets', 'true'); any = true; }
      if (sig.cdfaOn)    { await upsertField('company', firm.id, 'CDFA on Staff', 'true'); any = true; }
      if (sig.forensic)  { await upsertField('company', firm.id, 'Forensic Accountant in Network', 'true'); any = true; }
      if (sig.mediation) { await upsertField('company', firm.id, 'Mediation / Collaborative Practice', 'true'); any = true; }
      if (any) signalsWritten += 1;

      await upsertField('company', firm.id, 'Website Crawl Status', 'No team page found');
      await upsertField('company', firm.id, 'Website Crawled At', new Date().toISOString().slice(0, 10));
      console.log(`${tag} firm ${firm.id} ${firm.name} → no team page${any ? ' ✓signals' : ''}`);
      return;
    }
    teamFound += 1;

    await new Promise(r => setTimeout(r, INTRA_FIRM_DELAY_MS));
    const team = await fetchHtml(teamUrl);
    const teamHtml = team?.html ?? '';

    const hits = team ? findAttorneyProfiles(team.html, team.finalUrl) : [];

    // Aggregate text we have so far for signal inference (home + team + first 3 profiles).
    let cumulativeText = home.html + ' ' + teamHtml;

    let profilesAdded = 0;
    for (const hit of hits) {
      await new Promise(r => setTimeout(r, INTRA_FIRM_DELAY_MS));
      const prof = await fetchHtml(hit.profileUrl);
      if (!prof) continue;
      profilesParsed += 1;
      cumulativeText += ' ' + prof.html;
      const facts = parseProfile(prof.html);

      // Look up existing contact at this firm by name.
      const { first, last } = splitName(hit.name);
      const [existing] = await db.select().from(crmContacts).where(and(
        eq(crmContacts.clientId, clientId),
        eq(crmContacts.companyId, firm.id),
        eq(crmContacts.firstName, first),
        last ? eq(crmContacts.lastName, last) : sql`true`,
      )).limit(1);

      const noteAdd = `\nFirm-site crawl ${new Date().toISOString().slice(0, 10)}: ${hit.profileUrl}`;
      if (existing) {
        const updates: Partial<typeof crmContacts.$inferInsert> = {};
        if (facts.email && !existing.email)        updates.email = facts.email;
        if (facts.phone && !existing.phone)        updates.phone = facts.phone;
        if (facts.linkedinUrl && !existing.linkedinUrl) updates.linkedinUrl = facts.linkedinUrl;
        const newNotes = (existing.notes ?? '') + noteAdd;
        updates.notes = newNotes;
        updates.updatedAt = new Date();
        await db.update(crmContacts).set(updates).where(eq(crmContacts.id, existing.id));
        if (facts.bioSnippet) await upsertField('contact', existing.id, 'Bio Snippet', facts.bioSnippet);
        if (facts.linkedinUrl) await upsertField('contact', existing.id, 'LinkedIn URL Verified', 'true');
      } else {
        const newNotes =
          `Source: firm-site crawl (${homeUrl}). Profile: ${hit.profileUrl}.` +
          `\nDiscovered ${new Date().toISOString().slice(0, 10)} by Cross Cap research bot.`;
        const [created] = await db.insert(crmContacts).values({
          clientId,
          companyId: firm.id,
          firstName: first,
          lastName: last,
          email: facts.email ?? null,
          phone: facts.phone ?? null,
          linkedinUrl: facts.linkedinUrl ?? null,
          title: 'Family Law Attorney',
          source: 'firm-site',
          status: 'lead',
          notes: newNotes,
        }).returning();
        if (facts.bioSnippet) await upsertField('contact', created.id, 'Bio Snippet', facts.bioSnippet);
        if (facts.linkedinUrl) await upsertField('contact', created.id, 'LinkedIn URL Verified', 'true');

        // Tag with firm's state if we know it (from any other contact at this firm).
        const [peer] = await db.select().from(crmContacts)
          .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.companyId, firm.id), isNotNull(crmContacts.address)))
          .limit(1);
        const peerState = peer?.address && /^[A-Z]{2}$/.test(peer.address) ? peer.address : null;
        if (peerState) {
          await db.update(crmContacts).set({ address: peerState }).where(eq(crmContacts.id, created.id));
          const stTag = await db.select().from(crmTags).where(and(eq(crmTags.clientId, clientId), eq(crmTags.name, `State: ${peerState}`))).limit(1);
          const familyTag = await db.select().from(crmTags).where(and(eq(crmTags.clientId, clientId), eq(crmTags.name, 'Family Law'))).limit(1);
          for (const t of [...stTag, ...familyTag]) {
            await db.insert(crmContactTags).values({ contactId: created.id, tagId: t.id }).onConflictDoNothing?.() ??
              await db.insert(crmContactTags).values({ contactId: created.id, tagId: t.id });
          }
        }

        newContacts += 1;
        profilesAdded += 1;
      }
    }

    // Infer firm signals from accumulated text
    const sig = inferCompanySignals(cumulativeText);
    let any = false;
    if (sig.hnwFocus)  { await upsertField('company', firm.id, 'HNW Divorce Focus', sig.hnwFocus); any = true; }
    if (sig.cryptoExp) { await upsertField('company', firm.id, 'Crypto-Asset Experience', sig.cryptoExp); any = true; }
    if (sig.familyBiz) { await upsertField('company', firm.id, 'Family Business / Closely-Held Assets', 'true'); any = true; }
    if (sig.cdfaOn)    { await upsertField('company', firm.id, 'CDFA on Staff', 'true'); any = true; }
    if (sig.forensic)  { await upsertField('company', firm.id, 'Forensic Accountant in Network', 'true'); any = true; }
    if (sig.mediation) { await upsertField('company', firm.id, 'Mediation / Collaborative Practice', 'true'); any = true; }
    if (any) signalsWritten += 1;

    // Append crawl note to firm
    const newFirmNotes = (firm.notes ?? '') +
      `\nFirm-site crawl ${new Date().toISOString().slice(0, 10)}: team page=${teamUrl}, profiles found=${hits.length}, new contacts=${profilesAdded}.`;
    await db.update(crmCompanies).set({ notes: newFirmNotes, updatedAt: new Date() }).where(eq(crmCompanies.id, firm.id));

    await upsertField('company', firm.id, 'Website Crawl Status', 'Success');
    await upsertField('company', firm.id, 'Website Crawled At', new Date().toISOString().slice(0, 10));

    console.log(`${tag} firm ${firm.id} ${firm.name} → team(${hits.length}) +${profilesAdded} new${any ? ' ✓signals' : ''}`);
    void ilike; void gte;
  } // end crawlFirm

  // Spawn workers
  const workerPromises = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workerPromises);

  console.log(`\n=== CRAWL DONE ===`);
  console.log(`Processed firms: ${processed}`);
  console.log(`  Fetch OK:           ${fetchOk}`);
  console.log(`  Team page found:    ${teamFound}`);
  console.log(`  Profile pages read: ${profilesParsed}`);
  console.log(`  New contacts:       ${newContacts}`);
  console.log(`  Firms w/ signals:   ${signalsWritten}`);
  console.log(`  Firms w/ socials:   ${socialsWritten}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
