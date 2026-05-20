// Reproduces the "content flickers then goes blank" scenario.
//
// Loads the edit page, lets the iframe render, then manually replaces one
// html-render block's innerHTML to simulate what BLOCKS_UPDATE does. With
// the MutationObserver in place, the new mc-reveal elements should reach
// is-in within ~100ms instead of staying invisible forever.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const SITE_ID = 247;
const POST_ID = 705;
const USER_ID = 231;
const USER_EMAIL = 'simplerdevelopment@simplerdevelopment.com';

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const page = await ctx.newPage();

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET missing');
  const token = await encode({
    token: { sub: String(USER_ID), id: String(USER_ID), email: USER_EMAIL, name: 'SD Admin' },
    secret,
    salt: 'authjs.session-token',
  });
  await ctx.addCookies([
    { name: 'authjs.session-token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);

  await page.goto(`http://localhost:3000/portal/websites/${SITE_ID}/posts/${POST_ID}/edit`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(6000);

  const ifr = await page.$('iframe');
  const frame = ifr ? await ifr.contentFrame() : null;
  if (!frame) { console.log('no iframe'); await browser.close(); return; }

  const baseline = await frame.evaluate(() => {
    const all = document.querySelectorAll('.mc-reveal');
    return { total: all.length, visible: Array.from(all).filter(el => el.classList.contains('is-in')).length };
  });
  console.log('baseline:', baseline);

  // Simulate BLOCKS_UPDATE: replace innerHTML of one html-render block with
  // its OWN innerHTML (forces a teardown + re-add of all children, which
  // strips .is-in).
  console.log('simulating BLOCKS_UPDATE…');
  const afterReplace = await frame.evaluate(() => {
    const heroWrapper = document.querySelector('[data-block-id="mc-home-hero"]');
    if (!heroWrapper) return { error: 'no hero' };
    // Find the .mc-reveal descendants count BEFORE
    const beforeReveal = heroWrapper.querySelectorAll('.mc-reveal').length;
    const beforeVisible = Array.from(heroWrapper.querySelectorAll('.mc-reveal'))
      .filter(el => el.classList.contains('is-in')).length;

    // Strip is-in from all reveals (simulates fresh innerHTML)
    heroWrapper.querySelectorAll('.mc-reveal.is-in').forEach(el => el.classList.remove('is-in'));
    // Force a mutation by re-setting innerHTML
    heroWrapper.innerHTML = heroWrapper.innerHTML;

    return { beforeReveal, beforeVisible };
  });
  console.log('immediately after wipe:', afterReplace);

  // Wait for MutationObserver to fire (debounced 50ms + microtask)
  await page.waitForTimeout(400);

  const afterObserver = await frame.evaluate(() => {
    const all = document.querySelectorAll('.mc-reveal');
    return { total: all.length, visible: Array.from(all).filter(el => el.classList.contains('is-in')).length };
  });
  console.log('400ms after wipe:', afterObserver);

  await page.screenshot({ path: '/tmp/editor-after-update.png', fullPage: false });
  console.log('screenshot → /tmp/editor-after-update.png');
  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
