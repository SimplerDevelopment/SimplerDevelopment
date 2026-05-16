// Opens the editor, selects the Signature cheeses block, and screenshots
// the right-panel field list. Confirms that the new array field shows up
// as one "Cheeses" entry with 4 nested items, instead of 16 tileN_x fields.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const SITE_ID = 247;
const POST_ID = 705;
const USER_ID = 231;

async function run() {
  const browser = await chromium.launch();
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
  await page.waitForTimeout(5000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  // Click the "Signature cheeses" entry in the layers panel
  await page.locator('text=/Signature cheeses/').first().click();
  await page.waitForTimeout(2500);

  // Wait for the right panel to populate
  await page.waitForTimeout(1500);

  // Take a screenshot of the full editor
  await page.screenshot({ path: '/tmp/editor-cheeses.png', fullPage: false });
  console.log('saved → /tmp/editor-cheeses.png');

  // Dump the right-side panel labels so we can see what fields render
  const labels = await page.evaluate(() => {
    const w = window.innerWidth;
    return Array.from(document.querySelectorAll('label, button, [role="button"]'))
      .filter((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.left > w - 500 && r.width > 30 && r.height > 10 && r.height < 80;
      })
      .map((el) => (el as HTMLElement).innerText.trim().slice(0, 80))
      .filter((t) => t.length > 0 && t.length < 60)
      .slice(0, 30);
  });
  console.log('right-panel labels:');
  for (const l of labels) console.log('  ', l);

  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
