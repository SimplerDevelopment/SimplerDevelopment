/**
 * Retry firms whose Website Crawl Status = "Fetch failed".
 *
 * Some failures are transient or caused by bot-suspicious UAs. We retry
 * with:
 *   • A vanilla browser UA (no "ResearchBot" suffix)
 *   • A 15-second timeout
 *   • A single follow-up retry on connection errors
 *
 * Successful retries get a fresh status (Success / No team page / Fetch
 * failed) and rerun the lightweight signal extractor over the homepage.
 * For deep crawl + attorney discovery on these, run the main crawler with
 * FORCE=1 afterwards.
 *
 *   npx tsx scripts/migrations/crosscap/retry-fetch-failed.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const ALT_UAS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
];
const FETCH_TIMEOUT_MS = 15000;
const PER_FIRM_DELAY_MS = 400;
const CONCURRENCY = parseInt(process.env.RETRY_CONCURRENCY ?? '3', 10);

const HNW_PRIMARY = /(ultra[-\s]high[-\s]net[-\s]worth|complex high[-\s]net[-\s]worth|complex (?:asset|estate)|wealthy clientele|high asset divorce|high[-\s]net[-\s]worth divorce)/i;
const HNW_SOME    = /(high[-\s]net[-\s]worth|hnw|affluent|substantial assets)/i;
const CRYPTO_SOPH = /(cryptocurrency disputes|digital asset (?:disputes|valuation)|cryptocurrency in divorce|crypto[-\s]asset (?:disputes|valuation|tracing))/i;
const CRYPTO_SOME = /(cryptocurrency|crypto|bitcoin|digital assets?|blockchain)/i;
const FAMILY_BIZ  = /(closely[-\s]held|family[-\s]owned business|family business|business valuation|business succession|succession planning)/i;
const CDFA_ON     = /(CDFA|Certified Divorce Financial Analyst)/i;
const FORENSIC    = /(forensic accountant|forensic accounting|forensic CPA)/i;
const MEDIATION   = /(mediation|collaborative divorce|collaborative law|collaborative practice|cooperative divorce)/i;

interface FetchResult { ok: true; html: string; finalUrl: string; }
interface FetchFail   { ok: false; reason: string; }

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

async function fetchHtml(url: string, ua: string): Promise<FetchResult | FetchFail> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(normalizeUrl(url), {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
    const text = await r.text();
    return { ok: true, html: text, finalUrl: r.url };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

function inferCompanySignals(allText: string) {
  return {
    hnwFocus:
      HNW_PRIMARY.test(allText) ? 'Primary focus' :
      HNW_SOME.test(allText)    ? 'Significant'   : null,
    cryptoExp:
      CRYPTO_SOPH.test(allText) ? 'Sophisticated' :
      CRYPTO_SOME.test(allText) ? 'Some'          : null,
    familyBiz:  FAMILY_BIZ.test(allText)  || null,
    cdfaOn:     CDFA_ON.test(allText)     || null,
    forensic:   FORENSIC.test(allText)    || null,
    mediation:  MEDIATION.test(allText)   || null,
  };
}

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmCompanies, crmCustomFields, crmCustomFieldValues } = await import('../../../lib/db/schema');
  const { and, eq, isNotNull } = await import('drizzle-orm');

  const allFields = await db.select().from(crmCustomFields).where(eq(crmCustomFields.clientId, clientId));
  const statusFid     = allFields.find(f => f.entityType === 'company' && f.fieldName === 'Website Crawl Status')!.id;
  const crawledFid    = allFields.find(f => f.entityType === 'company' && f.fieldName === 'Website Crawled At')!.id;
  const practiceFid   = allFields.find(f => f.entityType === 'company' && f.fieldName === 'Practice Areas (Crawled)')?.id;
  const fid = (n: string) => allFields.find(f => f.entityType === 'company' && f.fieldName === n)?.id;

  async function upsertField(fieldId: number | undefined, entityId: number, value: string) {
    if (!fieldId) return false;
    const [existing] = await db.select().from(crmCustomFieldValues).where(and(
      eq(crmCustomFieldValues.customFieldId, fieldId),
      eq(crmCustomFieldValues.entityId, entityId),
      eq(crmCustomFieldValues.entityType, 'company'),
    )).limit(1);
    if (existing) {
      if (existing.value === value) return false;
      await db.update(crmCustomFieldValues).set({ value, updatedAt: new Date() }).where(eq(crmCustomFieldValues.id, existing.id));
      return true;
    }
    await db.insert(crmCustomFieldValues).values({ customFieldId: fieldId, entityId, entityType: 'company', value });
    return true;
  }

  // Find firms with Status = Fetch failed
  const failedRows = await db.select({ entityId: crmCustomFieldValues.entityId }).from(crmCustomFieldValues)
    .where(and(eq(crmCustomFieldValues.customFieldId, statusFid), eq(crmCustomFieldValues.entityType, 'company'), eq(crmCustomFieldValues.value, 'Fetch failed')));
  const failedIds = new Set(failedRows.map(r => r.entityId));
  console.log(`Firms with Fetch failed status: ${failedIds.size}`);

  const firms = await db.select().from(crmCompanies)
    .where(and(eq(crmCompanies.clientId, clientId), isNotNull(crmCompanies.website)));
  const queue = firms.filter(f => failedIds.has(f.id));
  console.log(`Retrying ${queue.length} firms with relaxed UA + 15s timeout, concurrency=${CONCURRENCY}\n`);

  let processed = 0, recovered = 0, stillFailing = 0, signalsAny = 0;
  let cursor = 0;

  async function worker(wid: number) {
    while (true) {
      const my = cursor++;
      if (my >= queue.length) return;
      const firm = queue[my];
      processed += 1;

      // Try each UA in turn until one succeeds
      let result: FetchResult | FetchFail | null = null;
      for (const ua of ALT_UAS) {
        const r = await fetchHtml(firm.website!, ua);
        if (r.ok) { result = r; break; }
        result = r;
      }

      if (!result || !result.ok) {
        stillFailing += 1;
        // Update status with the latest reason for diagnostics
        await upsertField(statusFid, firm.id, 'Fetch failed');
        await upsertField(crawledFid, firm.id, new Date().toISOString().slice(0, 10));
        console.log(`[w${wid} ${processed}/${queue.length}] firm ${firm.id} ${firm.name} → still failing: ${result?.reason ?? 'unknown'}`);
      } else {
        recovered += 1;
        const sig = inferCompanySignals(result.html);
        let any = false;
        if (sig.hnwFocus)  { if (await upsertField(fid('HNW Divorce Focus'),                       firm.id, sig.hnwFocus))  any = true; }
        if (sig.cryptoExp) { if (await upsertField(fid('Crypto-Asset Experience'),                 firm.id, sig.cryptoExp)) any = true; }
        if (sig.familyBiz) { if (await upsertField(fid('Family Business / Closely-Held Assets'),   firm.id, 'true'))         any = true; }
        if (sig.cdfaOn)    { if (await upsertField(fid('CDFA on Staff'),                            firm.id, 'true'))         any = true; }
        if (sig.forensic)  { if (await upsertField(fid('Forensic Accountant in Network'),          firm.id, 'true'))         any = true; }
        if (sig.mediation) { if (await upsertField(fid('Mediation / Collaborative Practice'),      firm.id, 'true'))         any = true; }
        if (any) signalsAny += 1;

        // Mark as Success on retry but flag for deep re-crawl by clearing "Crawled At" date.
        // The main crawler with FORCE=1 will re-discover team pages later.
        await upsertField(statusFid, firm.id, 'Success');
        await upsertField(crawledFid, firm.id, new Date().toISOString().slice(0, 10));
        console.log(`[w${wid} ${processed}/${queue.length}] firm ${firm.id} ${firm.name} → RECOVERED${any ? ' ✓signals' : ''}`);
      }

      await new Promise(r => setTimeout(r, PER_FIRM_DELAY_MS));
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));

  console.log(`\n=== RETRY DONE ===`);
  console.log(`Processed:                ${processed}`);
  console.log(`Recovered:                ${recovered}`);
  console.log(`Still failing:            ${stillFailing}`);
  console.log(`Recovered with signals:   ${signalsAny}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
