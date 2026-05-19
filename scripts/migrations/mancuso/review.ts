// Comprehensive Playwright review of the Mancuso site + visual editor.
// Captures screenshots and flags any console errors / broken images /
// network failures so we can see at a glance whether everything is working.

import { chromium, type Page } from 'playwright';
import { encode } from '@auth/core/jwt';

const SITE_ID = 247;
const POST_ID = 705;
const USER_ID = 231;

interface Report {
  page: string;
  url: string;
  shot: string;
  status: number | null;
  pageErrors: string[];
  consoleErrors: string[];
  brokenImgs: string[];
  blockIds: string[];
  h1: string | null;
  bytesHtml: number;
}

async function visit(page: Page, label: string, url: string, shot: string): Promise<Report> {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.removeAllListeners('pageerror');
  page.removeAllListeners('console');
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('Stripe') && !t.includes('frame-src') && !t.includes('CSP')) consoleErrors.push(t);
    }
  });
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  // Force-load all images
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise((r) => {
              img.addEventListener('load', () => r(null), { once: true });
              img.addEventListener('error', () => r(null), { once: true });
              setTimeout(() => r(null), 6000);
            }),
      ),
    );
  });
  await page.screenshot({ path: shot, fullPage: true });
  const summary = await page.evaluate(() => {
    const brokenImgs = Array.from(document.querySelectorAll('img'))
      .filter((img) => img.src && img.naturalWidth === 0)
      .map((img) => img.src.slice(0, 100));
    const blockIds = Array.from(new Set(Array.from(document.querySelectorAll('[data-block-id]')).map((el) => el.getAttribute('data-block-id'))));
    const h1 = document.querySelector('h1')?.textContent?.trim().slice(0, 80) || null;
    return { brokenImgs, blockIds, h1, bytesHtml: document.documentElement.outerHTML.length };
  });
  return { page: label, url, shot, status: resp?.status() ?? null, pageErrors, consoleErrors, ...summary };
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const page = await ctx.newPage();

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET missing');
  const token = await encode({
    token: { sub: String(USER_ID), id: String(USER_ID), email: 'sd@example.com', name: 'SD Admin' },
    secret,
    salt: 'authjs.session-token',
  });
  await ctx.addCookies([
    { name: 'authjs.session-token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);

  // Unlock the site so subsequent visits bypass the wall
  const unlockResp = await fetch('http://localhost:3000/api/preview-unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'CHEESE26' }),
  });
  const unlockJson: { success: boolean; data?: { url: string } } = await unlockResp.json();
  await page.goto(unlockJson.data!.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const reports: Report[] = [];

  // 1. Marketing homepage (still has the access-code form)
  reports.push(await visit(page, 'sd-homepage', 'http://localhost:3000/', '/tmp/review-sd-home.png'));

  // 2. Each of the 5 Mancuso pages
  const SLUGS = ['', 'cheese', 'sandwiches', 'story', 'visit'];
  for (const s of SLUGS) {
    const url = `http://localhost:3000/sites/mancuso.simplerdevelopment.com/${s}`;
    const label = `mancuso-${s || 'home'}`;
    reports.push(await visit(page, label, url, `/tmp/review-${label}.png`));
  }

  // 3. The visual editor
  reports.push(await visit(page, 'editor', `http://localhost:3000/portal/websites/${SITE_ID}/posts/${POST_ID}/edit`, '/tmp/review-editor.png'));

  await browser.close();

  // Final summary
  console.log('\n========================  REVIEW  ========================\n');
  for (const r of reports) {
    const flags: string[] = [];
    if (r.status !== 200) flags.push(`STATUS=${r.status}`);
    if (r.pageErrors.length) flags.push(`pageErrors=${r.pageErrors.length}`);
    if (r.consoleErrors.length) flags.push(`consoleErrors=${r.consoleErrors.length}`);
    if (r.brokenImgs.length) flags.push(`brokenImgs=${r.brokenImgs.length}`);
    const ok = flags.length === 0;
    console.log(`${ok ? '✓' : '✗'}  ${r.page.padEnd(20)} ${r.status}  blocks=${r.blockIds.length}  ${flags.join('  ')}`);
    if (r.h1) console.log(`   h1: ${r.h1}`);
    if (r.brokenImgs.length) for (const b of r.brokenImgs.slice(0, 3)) console.log(`   broken: ${b}`);
    if (r.consoleErrors.length) for (const e of r.consoleErrors.slice(0, 3)) console.log(`   console: ${e.slice(0, 120)}`);
    if (r.pageErrors.length) for (const e of r.pageErrors.slice(0, 3)) console.log(`   pageerr: ${e.slice(0, 120)}`);
    console.log(`   shot: ${r.shot}`);
    console.log();
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
