// One-off Playwright check: confirm the staff-mode designer routing/gating
// works without a portal session.
//
//   A. /sites/<domain>/designer/<store-mode-slug>            → redirects to /shop/<slug>
//   B. /sites/<domain>/designer/<store-mode-slug>?staff=1    → still redirects (no portal auth)
//   C. /portal/websites/<id>/store/products/<pid>/designer   → redirects to /portal/login
//   D. /portal/login                                          → renders OK
//
// Full happy path (logged-in staff edits + saves) requires NextAuth session and
// is out of scope for this no-auth probe.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'http://localhost:3001';
const OUT = path.resolve('.qa-reports/magamommy-staff-designer');
await mkdir(OUT, { recursive: true });

const DOMAIN = 'magamommy.simplerdevelopment.com';
const STORE_SLUG = 'make-bedtime-great-again-2026-w22'; // product #66, store-mode
const SITE_ID = 248;
const PRODUCT_ID = 66;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  // Do NOT follow redirects automatically — we want to inspect the chain.
});
const page = await ctx.newPage();

async function probe(label, url) {
  const responses = [];
  page.on('response', (res) => { if (res.request().resourceType() === 'document') responses.push({ url: res.url(), status: res.status() }); });
  console.log(`\n── ${label} ──`);
  console.log(`  start: ${url}`);
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 }).catch((err) => {
    console.log(`  navigate error: ${err.message}`);
  });
  const finalUrl = page.url();
  console.log(`  final: ${finalUrl}`);
  console.log(`  redirects:`);
  for (const r of responses) console.log(`    [${r.status}] ${r.url}`);
  // Clear listeners for next probe.
  page.removeAllListeners('response');
  await page.screenshot({ path: path.join(OUT, `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`), fullPage: false });
  return { finalUrl, responses };
}

const a = await probe('A-customer-designer-store-mode',
  `${BASE}/sites/${DOMAIN}/designer/${STORE_SLUG}`);
const b = await probe('B-staff-flag-but-no-auth',
  `${BASE}/sites/${DOMAIN}/designer/${STORE_SLUG}?staff=1`);
const c = await probe('C-portal-entry-no-auth',
  `${BASE}/portal/websites/${SITE_ID}/store/products/${PRODUCT_ID}/designer`);
const d = await probe('D-portal-login',
  `${BASE}/portal/login`);

console.log('\n── Verdict ──');
const expectA = a.finalUrl.includes('/shop/');
const expectB = b.finalUrl.includes('/shop/');  // still gated since no auth
const expectC = c.finalUrl.includes('/portal/login');
const expectD = d.finalUrl.includes('/portal/login');
console.log(`  A (customer → shop redirect):    ${expectA ? 'PASS' : 'FAIL'} → ${a.finalUrl}`);
console.log(`  B (staff flag no auth → shop):    ${expectB ? 'PASS' : 'FAIL'} → ${b.finalUrl}`);
console.log(`  C (portal entry no auth → login): ${expectC ? 'PASS' : 'FAIL'} → ${c.finalUrl}`);
console.log(`  D (portal login renders):         ${expectD ? 'PASS' : 'FAIL'} → ${d.finalUrl}`);

await browser.close();
process.exit((expectA && expectB && expectC && expectD) ? 0 : 1);
