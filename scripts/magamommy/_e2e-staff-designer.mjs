// End-to-end Playwright test for the staff designer flow.
// Mints a NextAuth v5 session JWE token directly (so we don't need to know
// the user's password), injects it as the session cookie, then walks through:
//
//   1. /portal/websites/248/store/products/66                 → product page renders, "Open in Designer" CTA visible
//   2. Click "Open in Designer" (target=_blank → manually navigate to its href)
//   3. /portal/.../products/66/designer                       → server redirects to /sites/<host>/designer/<slug>?staff=1&designId=...
//   4. /sites/.../designer/<slug>?staff=1&designId=...        → portalUserHasSiteAccess passes, DesignerClient renders in staff mode
//
// Captures screenshots at every step and asserts the chain.

import { chromium } from 'playwright';
import { encode } from 'next-auth/jwt';
import * as dotenv from 'dotenv';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const BASE = 'http://localhost:3001';
const OUT = path.resolve('.qa-reports/magamommy-staff-e2e');
await mkdir(OUT, { recursive: true });

const SITE_ID = 1;
const PRODUCT_ID = 2;
const USER_ID = 1;
const USER_EMAIL = 'info@danielpcoyle.com';

const secret = process.env.AUTH_SECRET;
if (!secret) {
  console.error('AUTH_SECRET not in env. Cannot mint a session token.');
  process.exit(1);
}

// NextAuth v5 default cookie names (no host prefix on http localhost).
const COOKIE_NAME = 'authjs.session-token';

console.log('Minting NextAuth session JWE for user', USER_EMAIL);
const sessionToken = await encode({
  token: {
    sub: String(USER_ID),
    id: String(USER_ID),
    email: USER_EMAIL,
    name: 'Dan Coyle',
    role: 'client',
  },
  secret,
  salt: COOKIE_NAME,
  maxAge: 60 * 60 * 24 * 7,
});
console.log('Token minted, length=', sessionToken.length);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});

// Inject the session cookie before any navigation.
await ctx.addCookies([
  {
    name: COOKIE_NAME,
    value: sessionToken,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  },
]);

const page = await ctx.newPage();
const log = (s) => console.log(s);

// ── Step 1: portal product detail ─────────────────────────────────────────
log('\n── 1. Portal product detail page ──');
const productUrl = `${BASE}/portal/websites/${SITE_ID}/store/products/${PRODUCT_ID}`;
log(`  → ${productUrl}`);
const r1 = await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 60_000 });
log(`  HTTP ${r1?.status()} final=${page.url()}`);

// The product detail page loads form data async via /api/portal/.../products/:id.
// Wait for the product name field to populate before probing.
try {
  await page.waitForSelector('input[name="name"], input[value*="Make Bedtime"], button:has-text("Customization")', { timeout: 30_000 });
} catch {}
await page.waitForTimeout(2_500);
await page.screenshot({ path: path.join(OUT, '1-portal-product.png'), fullPage: true });

// Try to expand the Customization section (collapsed by default).
const customizationBtn = page.locator('button:has-text("Customization")');
if (await customizationBtn.count()) {
  log('  expanding Customization section…');
  await customizationBtn.first().click();
  await page.waitForTimeout(1_500);
}
await page.screenshot({ path: path.join(OUT, '1b-customization-open.png'), fullPage: true });

// Look for the "Open in Designer" CTA.
const designerCta = page.locator('a:has-text("Open in Designer")');
const ctaCount = await designerCta.count();
log(`  "Open in Designer" CTA count: ${ctaCount}`);
const designerHref = ctaCount > 0 ? await designerCta.first().getAttribute('href') : null;
log(`  CTA href: ${designerHref ?? '(none)'}`);

// ── Step 2: navigate to the portal entry route ────────────────────────────
log('\n── 2. Portal entry route (should redirect to /sites/...) ──');
const portalEntry = `${BASE}/portal/websites/${SITE_ID}/store/products/${PRODUCT_ID}/designer`;
log(`  → ${portalEntry}`);
const responses2 = [];
page.on('response', (r) => {
  if (r.request().resourceType() === 'document') responses2.push({ status: r.status(), url: r.url() });
});
const r2 = await page.goto(portalEntry, { waitUntil: 'networkidle', timeout: 60_000 }).catch((e) => ({ status: () => `ERR ${e.message}` }));
log(`  initial HTTP ${r2?.status?.() ?? '?'}`);
log(`  final URL: ${page.url()}`);
log('  redirect chain:');
for (const r of responses2) log(`    [${r.status}] ${r.url}`);
page.removeAllListeners('response');
await page.screenshot({ path: path.join(OUT, '2-after-portal-entry.png'), fullPage: false });

// ── Step 3: confirm the designer page rendered in staff mode ─────────────
log('\n── 3. Staff designer page DOM probe ──');
const finalUrl = page.url();
const isStaffUrl = finalUrl.includes('?staff=1') && finalUrl.includes('designId=');
log(`  URL is staff-shaped: ${isStaffUrl ? 'PASS' : 'FAIL'} (${finalUrl})`);

// Wait for the designer shell to render (it lazy-loads fabric).
await page.waitForTimeout(3_000);
const canvasCount = await page.locator('canvas').count();
const designerShell = await page.locator('[data-designer-shell], [class*="DesignerShell"], #design-canvas, canvas').count();
log(`  canvas elements on page: ${canvasCount}`);
log(`  designer-shell candidates: ${designerShell}`);
const title = await page.title();
log(`  document title: ${title}`);

await page.screenshot({ path: path.join(OUT, '3-designer-loaded.png'), fullPage: true });

// ── Step 4: staff-mode UI assertions ─────────────────────────────────────
log('\n── 4. Staff-mode UI gates ──');
const addToCartBtn = await page.locator('button:has-text("Add to cart")').count();
const staffBadge = await page.locator('text="Staff edit"').count();
log(`  Add-to-cart buttons present: ${addToCartBtn} (expect 0 in staff mode)`);
log(`  "Staff edit" badge present: ${staffBadge} (expect 1)`);

// ── Verdict ─────────────────────────────────────────────────────────────
const pass1 = ctaCount > 0;
const pass2 = isStaffUrl;
const pass3 = canvasCount > 0;
const pass4 = addToCartBtn === 0;
const pass5 = staffBadge >= 1;
log('\n── Verdict ──');
log(`  1. Portal product page renders w/ "Open in Designer" CTA: ${pass1 ? 'PASS' : 'FAIL'}`);
log(`  2. Portal entry → /sites/<host>/designer?staff=1&designId=:  ${pass2 ? 'PASS' : 'FAIL'}`);
log(`  3. DesignerClient mounted (canvas present):                  ${pass3 ? 'PASS' : 'FAIL'}`);
log(`  4. Add-to-cart hidden in staff mode:                         ${pass4 ? 'PASS' : 'FAIL'}`);
log(`  5. "Staff edit" badge visible:                               ${pass5 ? 'PASS' : 'FAIL'}`);

await browser.close();
process.exit(pass1 && pass2 && pass3 && pass4 && pass5 ? 0 : 1);
