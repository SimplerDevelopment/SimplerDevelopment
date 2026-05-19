// Monitors the editor iframe for full reloads vs DOM-replacement re-renders.
// Sits on the edit page, listens for `framenavigated` (full reload) and for
// changes to the hero block's first child (signals dangerouslySetInnerHTML
// replacement). Reports every event so we can tell what kind of "refresh"
// is happening on each tick.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const SITE_ID = 247;
const POST_ID = 705;
const USER_ID = 231;

async function run() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const page = await ctx.newPage();

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET missing');
  const token = await encode({
    token: { sub: String(USER_ID), id: String(USER_ID), email: 'simplerdevelopment@simplerdevelopment.com', name: 'SD Admin' },
    secret,
    salt: 'authjs.session-token',
  });
  await ctx.addCookies([
    { name: 'authjs.session-token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);

  // Log iframe navigations (full reloads)
  page.on('framenavigated', (f) => {
    if (f.url().includes('mancuso')) console.log(`[NAV ${new Date().toISOString().slice(11, 23)}] iframe →`, f.url().slice(0, 120));
  });

  await page.goto(`http://localhost:3000/portal/websites/${SITE_ID}/posts/${POST_ID}/edit`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);

  // Install a MutationObserver inside the iframe that reports every subtree
  // replacement of the hero block.
  const frame = await (await page.$('iframe'))!.contentFrame();
  if (!frame) { console.log('no iframe'); await browser.close(); return; }

  await frame.evaluate(() => {
    const hero = document.querySelector('[data-block-id="mc-home-hero"]');
    if (!hero) return;
    let lastChildKey = '';
    const fingerprint = () => {
      const first = hero.firstElementChild;
      return first ? (first.outerHTML || '').length + ':' + (first.firstElementChild?.outerHTML?.length || 0) : 'empty';
    };
    lastChildKey = fingerprint();
    new MutationObserver(() => {
      const next = fingerprint();
      if (next !== lastChildKey) {
        console.log(`[MUT ${new Date().toISOString().slice(11, 23)}] hero subtree replaced (was ${lastChildKey}, now ${next})`);
        lastChildKey = next;
      }
    }).observe(hero, { childList: true, subtree: true });
  });

  // Also forward iframe console messages so we see what the customJs reports
  frame.on('console', (msg) => {
    if (msg.type() === 'error' || msg.text().includes('hero')) console.log(`[IFR ${msg.type()}]`, msg.text());
  });

  console.log('watching for 25s — leave the editor idle and any "ticks" will be reported below');
  await page.waitForTimeout(25_000);

  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
