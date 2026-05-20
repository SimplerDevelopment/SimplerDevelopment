// Inspect the visual editor for the Mancuso home page. The user reports
// "blank sections in the editor, but working live" — we open the editor
// in Playwright with an injected session cookie, navigate to the home
// post's edit page, wait for the iframe to load, and capture the canvas.

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

  // Mint a NextAuth session JWT manually using the same secret the server uses
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

  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const t = msg.text();
      if (!t.includes('Stripe') && !t.includes('frame-src')) console.log(`[${msg.type()}]`, t);
    }
  });

  const url = `http://localhost:3000/portal/websites/${SITE_ID}/posts/${POST_ID}/edit`;
  console.log('opening', url);
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('landed on:', page.url());

  // Hard-reload so iframe gets the latest site-js
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(6000);

  // Was login bypassed?
  if (page.url().includes('/login') || page.url().includes('/auth')) {
    console.log('!! still on login page — auth bypass failed');
    await page.screenshot({ path: '/tmp/editor-login.png', fullPage: false });
    await browser.close();
    return;
  }

  // Wait for the iframe to load
  await page.waitForTimeout(2500);
  const iframeInfo = await page.evaluate(() => {
    const ifr = document.querySelector('iframe') as HTMLIFrameElement | null;
    return ifr ? { src: ifr.src, w: ifr.clientWidth, h: ifr.clientHeight } : null;
  });
  console.log('iframe:', iframeInfo);

  // Set up an iframe-level console listener so we see errors from inside
  const iframe = await page.$('iframe');
  if (iframe) {
    const ifrFrame = await iframe.contentFrame();
    if (ifrFrame) {
      ifrFrame.on('pageerror', (err) => console.log('[iframe-pageerror]', err.message));
      ifrFrame.on('console', (msg) => {
        if (msg.type() === 'error') console.log('[iframe-error]', msg.text());
      });
      // Try manually triggering reveal-all from inside the iframe context to confirm
      // the JS works — if it does, the issue is timing
      const result = await ifrFrame.evaluate(() => {
        try {
          const reveals = document.querySelectorAll('.mc-reveal');
          const before = Array.from(reveals).filter((el) => el.classList.contains('is-in')).length;
          reveals.forEach((el) => el.classList.add('is-in'));
          const after = Array.from(reveals).filter((el) => el.classList.contains('is-in')).length;
          return {
            total: reveals.length,
            beforeVisible: before,
            afterVisible: after,
            mcInit: (window as { __mcInit?: boolean }).__mcInit,
            search: location.search,
            isInIframe: window.self !== window.top,
          };
        } catch (e) {
          return { error: (e as Error).message };
        }
      });
      console.log('manual reveal-all:', JSON.stringify(result, null, 2));
    }
  }

  // Inspect the iframe's body to see what's actually rendered inside
  const iframeContent = await page.evaluate(() => {
    const ifr = document.querySelector('iframe') as HTMLIFrameElement | null;
    const doc = ifr?.contentDocument;
    if (!doc) return { ok: false, reason: 'no iframe contentDocument' };
    const reveals = Array.from(doc.querySelectorAll('.mc-reveal'));
    const blocks = Array.from(doc.querySelectorAll('[data-block-id]'));
    return {
      ok: true,
      bodyLen: doc.body.innerHTML.length,
      revealCount: reveals.length,
      revealVisibleCount: reveals.filter((el) => el.classList.contains('is-in')).length,
      blockCount: blocks.length,
      url: ifr?.src,
    };
  });
  console.log('iframe content:', JSON.stringify(iframeContent, null, 2));

  // Also dump the LayersPanel contents
  const layers = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[class*="group/layer"]'));
    if (items.length === 0) {
      // Try a generic look for the layer list
      const candidates = Array.from(document.querySelectorAll('button, div'))
        .filter((el) => el.textContent && el.textContent.includes('Mancuso'))
        .slice(0, 12);
      return { fallback: true, count: candidates.length, samples: candidates.map((el) => el.textContent?.trim().slice(0, 80)) };
    }
    return { count: items.length, samples: items.slice(0, 12).map((el) => el.textContent?.trim().slice(0, 80)) };
  });
  console.log('layers panel:', JSON.stringify(layers, null, 2));

  await page.screenshot({ path: '/tmp/editor-full.png', fullPage: false });
  console.log('screenshot → /tmp/editor-full.png');

  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
