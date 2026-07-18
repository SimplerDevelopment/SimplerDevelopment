// VEQA capture harness. Logs in via the NextAuth credentials flow (cookies shared
// with the browser context), opens the editor, records video, screenshots the block
// under test across viewports/themes. Run with bun from the repo root so the repo's
// Playwright + Chromium resolve:
//   OUT=/path SITE=241 POST=2007 EMAIL=… PASSWORD=… bun .agents/skills/simplerdev-visual-editor-qa/scripts/qa-capture.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3000';
const EMAIL = process.env.EMAIL || 'simplerdevelopment@simplerdevelopment.com';
const PASSWORD = process.env.PASSWORD || 'veqa-local-123';
const SITE = Number(process.env.SITE || 241);
const POST = Number(process.env.POST || 2007);
const OUT = process.env.OUT || './veqa-out';

fs.mkdirSync(OUT + '/video', { recursive: true });
const log = (...a) => console.log('[cap]', ...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: OUT + '/video', size: { width: 1440, height: 900 } },
});

// auth via credentials callback (cookies land in ctx, shared with pages)
const { csrfToken } = await (await ctx.request.get(`${BASE}/api/auth/csrf`)).json();
await ctx.request.post(`${BASE}/api/auth/callback/credentials`, {
  form: { email: EMAIL, password: PASSWORD, csrfToken, json: 'true' },
});
const session = await (await ctx.request.get(`${BASE}/api/auth/session`)).json();
log('session:', session?.user?.email, session?.user?.role);
if (!session?.user) { log('AUTH FAILED'); await browser.close(); process.exit(2); }

const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') log('console-error:', m.text().slice(0, 160)); });

log('opening editor…');
await page.goto(`${BASE}/portal/websites/${SITE}/posts/${POST}/edit`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(9000); // heavy editor (iframe canvas + panels)
await page.screenshot({ path: OUT + '/01-editor-loaded.png' });

// enumerate toolbar/controls so we can target viewport + theme toggles precisely
const controls = await page.evaluate(() => {
  const named = [...document.querySelectorAll('button,[role="button"],[aria-label]')]
    .map((el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim())
    .filter((t) => t && t.length < 24);
  return [...new Set(named)].slice(0, 60);
});
log('controls:', JSON.stringify(controls));

// --- VEQA-026: select the columns block, capture its editor panel ---
try {
  await page.getByText('columns', { exact: true }).first().click({ timeout: 8000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/02-columns-selected.png' });
  log('columns selected + captured');
  // dump the right-panel text so we can confirm per-column delete controls exist
  const panel = await page.evaluate(() => {
    // right properties panel = last major column; grab its text + any delete affordances
    const bodyText = document.body.innerText.replace(/\s+/g, ' ');
    const hasWidth = /width/i.test(bodyText);
    const deleteish = [...document.querySelectorAll('button,[role="button"]')]
      .map((el) => (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase())
      .filter((t) => /delete|remove|trash|column/.test(t));
    const trashIcons = [...document.querySelectorAll('*')]
      .filter((el) => (el.textContent || '').trim() === 'delete' || (el.textContent || '').trim() === 'delete_outline').length;
    return { hasWidth, deleteish: [...new Set(deleteish)].slice(0, 10), trashIconCount: trashIcons };
  });
  log('panel:', JSON.stringify(panel));

  // functional proof: click the always-visible "delete column 2" and confirm the count drops
  const countBefore = await page.evaluate(() => (document.body.innerText.match(/Columns \((\d+)\)/) || [])[1]);
  await page.getByRole('button', { name: /delete column 2/i }).click({ timeout: 6000 });
  await page.waitForTimeout(1200);
  // handle a possible confirm dialog
  const confirmBtn = page.getByRole('button', { name: /^(delete|confirm|yes|remove)$/i });
  if (await confirmBtn.count()) { await confirmBtn.first().click().catch(() => {}); await page.waitForTimeout(800); }
  await page.screenshot({ path: OUT + '/03-after-delete-col2.png' });
  const countAfter = await page.evaluate(() => (document.body.innerText.match(/Columns \((\d+)\)/) || [])[1]);
  log(`column count: before=${countBefore} after=${countAfter}`);
} catch (e) { log('columns interaction failed:', String(e).slice(0, 140)); }

await ctx.close(); // flush video
await browser.close();
log('done ->', OUT);
