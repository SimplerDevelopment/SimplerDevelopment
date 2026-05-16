// Single-field click-to-edit verification, with frame-by-frame state snaps.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const SITE_ID = 247;
const POST_ID = 705;
const USER_ID = 231;
const TARGET = '[data-field="sinceLabel"]';

async function run() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET missing');
  const token = await encode({
    token: { sub: String(USER_ID), id: String(USER_ID), email: 'sd@example.com', name: 'SD Admin' },
    secret,
    salt: 'authjs.session-token',
  });
  await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);

  await page.goto(`http://localhost:3000/portal/websites/${SITE_ID}/posts/${POST_ID}/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15000);

  const ifr = await page.$('iframe');
  const frame = ifr ? await ifr.contentFrame() : null;
  if (!frame) { console.log('NO FRAME'); await browser.close(); return; }

  const snap = async (label: string) => {
    const r = await frame.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return { found: false };
      const a = document.activeElement;
      const sel2 = window.getSelection();
      return {
        found: true,
        text: el.textContent?.trim() || '',
        ce: el.getAttribute('contenteditable'),
        isCE: el.isContentEditable,
        pe: getComputedStyle(el).pointerEvents,
        focused: a === el,
        activeTag: a?.tagName,
        activeField: (a as HTMLElement | null)?.closest?.('[data-field]')?.getAttribute('data-field') || '',
        selInTarget: sel2?.anchorNode ? el.contains(sel2.anchorNode) : false,
      };
    }, TARGET);
    console.log(`[${label}]`, JSON.stringify(r));
    return r;
  };

  console.log('--- before click ---');
  await snap('pre');

  console.log('--- clicking ---');
  await frame.locator(TARGET).first().click();
  await page.waitForTimeout(200);
  await snap('post-click-200ms');

  console.log('--- typing "ABC" via keyboard ---');
  await page.keyboard.type('ABC', { delay: 80 });
  await page.waitForTimeout(800);
  await snap('post-type');

  await page.screenshot({ path: '/tmp/e2e-single.png', fullPage: false });
  console.log('shot → /tmp/e2e-single.png');

  // Linger a bit so we can SEE in headed browser
  await page.waitForTimeout(2000);
  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
