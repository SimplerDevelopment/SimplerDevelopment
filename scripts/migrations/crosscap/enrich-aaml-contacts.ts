/**
 * Visit each AAML fellow's profile page and fill in the email + phone
 * fields that aren't present on the directory listing.
 *
 * Idempotent: skips contacts that already have BOTH email and phone.
 *
 * Usage:
 *   npx tsx scripts/migrations/crosscap/enrich-aaml-contacts.ts          # all missing
 *   npx tsx scripts/migrations/crosscap/enrich-aaml-contacts.ts 100      # cap to 100
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const UA = 'SimplerDevelopment Research Bot (info@danielpcoyle.com)';
const POLITE_DELAY_MS = 1200;

interface ProfileContact {
  email: string | null;
  phone: string | null;
  firmAddress: string | null;
}

function extractContact(html: string): ProfileContact {
  // Grab the Elementor icon-list section that holds the firm contact info.
  // We scan the full page but discard mailto links that are inside JS or are
  // share-by-email composers (?body=…).
  const mailRe = /href="mailto:([^"?]+?)"/gi;
  const telRe = /href="tel:([^"]+?)"/gi;

  let email: string | null = null;
  for (const m of html.matchAll(mailRe)) {
    const candidate = m[1].trim();
    // Skip share-by-email composers and any leftover JS-string fragments.
    if (!candidate.includes('@')) continue;
    if (candidate.includes('?')) continue;
    if (candidate.includes("'") || candidate.includes(' ')) continue;
    email = candidate.toLowerCase();
    break;
  }

  let phone: string | null = null;
  for (const m of html.matchAll(telRe)) {
    const candidate = m[1].trim();
    // Strip leading "1-" country code and non-digits, then re-format.
    const digits = candidate.replace(/[^\d]/g, '').replace(/^1(?=\d{10}$)/, '');
    if (digits.length < 10) continue;
    const fmt = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    phone = fmt;
    break;
  }

  // Address: look for the lawyer-meta block with "Address" or "Office".
  // Cheap heuristic — pull the first <p> after a "fa-map-marker" icon.
  let firmAddress: string | null = null;
  const addrMatch = html.match(/fa-map-marker[\s\S]{0,400}?<span[^>]*class="elementor-icon-list-text"[^>]*>([\s\S]*?)<\/span>/i);
  if (addrMatch) {
    firmAddress = addrMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!firmAddress) firmAddress = null;
  }

  return { email, phone, firmAddress };
}

async function fetchProfile(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

async function main() {
  const cap = parseInt(process.argv[2] ?? '0', 10) || Infinity;

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const clientId: number = ids.clientId;

  const { db } = await import('../../../lib/db');
  const { crmContacts, crmCompanies } = await import('../../../lib/db/schema');
  const { and, eq, ilike, or, isNull, sql } = await import('drizzle-orm');

  // Pull AAML contacts that are missing email OR phone.
  const candidates = await db.select().from(crmContacts).where(and(
    eq(crmContacts.clientId, clientId),
    eq(crmContacts.source, 'aaml'),
    or(isNull(crmContacts.email), isNull(crmContacts.phone)),
  ));
  console.log(`AAML contacts needing enrichment: ${candidates.length} (cap=${cap === Infinity ? 'none' : cap})`);

  let processed = 0, emailsFound = 0, phonesFound = 0, addrFound = 0, fetchFails = 0;

  for (const c of candidates) {
    if (processed >= cap) break;
    processed += 1;

    const slugMatch = c.notes?.match(/AAML_SLUG:([^\s\n]+)/);
    const slug = slugMatch?.[1];
    if (!slug) {
      console.warn(`  contact ${c.id} (${c.firstName} ${c.lastName}) has no AAML_SLUG; skip`);
      continue;
    }

    const url = `https://www.aaml.org/lawyer/${slug}/`;
    let html: string;
    try { html = await fetchProfile(url); }
    catch (e) { fetchFails += 1; console.warn(`  ${slug}: fetch failed — ${(e as Error).message}`); continue; }

    const { email, phone, firmAddress } = extractContact(html);

    const updates: Partial<typeof crmContacts.$inferInsert> = {};
    if (email && !c.email) { updates.email = email; emailsFound += 1; }
    if (phone && !c.phone) { updates.phone = phone; phonesFound += 1; }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(crmContacts).set(updates).where(eq(crmContacts.id, c.id));
    }

    // Bubble firm address up to the firm row when present + missing.
    if (firmAddress && c.companyId) {
      const [firm] = await db.select().from(crmCompanies).where(eq(crmCompanies.id, c.companyId)).limit(1);
      if (firm && (!firm.address || firm.address.length < 5 || /^[A-Z]{2}$/.test(firm.address))) {
        await db.update(crmCompanies).set({ address: firmAddress, updatedAt: new Date() }).where(eq(crmCompanies.id, firm.id));
        addrFound += 1;
      }
    }

    if (processed % 25 === 0) {
      console.log(`  …${processed} processed: +${emailsFound} emails, +${phonesFound} phones, +${addrFound} firm addresses`);
    }

    await new Promise(r => setTimeout(r, POLITE_DELAY_MS));
  }

  console.log(`\n=== ENRICHMENT DONE ===`);
  console.log(`Processed: ${processed} | Emails added: ${emailsFound} | Phones added: ${phonesFound} | Firm addresses added: ${addrFound} | Fetch failures: ${fetchFails}`);
  void sql; void ilike;
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
