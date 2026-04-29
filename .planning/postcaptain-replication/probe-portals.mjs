import { chromium } from 'playwright-core';
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/sites/postcaptain.com', { waitUntil: 'load', timeout: 60000 });
await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

const portalsDesc = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="portals-desc"] > div');
  if (!el) return null;
  const cs = window.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const p = el.querySelector('p');
  const pRect = p?.getBoundingClientRect();
  return {
    inlineStyle: el.getAttribute('style'),
    maxWidth: cs.maxWidth,
    width: r.width,
    pHeight: pRect?.height,
    pText: p?.textContent.slice(0, 50),
    pFontSize: p ? window.getComputedStyle(p).fontSize : null,
  };
});
console.log('portals-desc:', portalsDesc);

// Trace ancestors
const ancestry = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="portals-desc"]');
  const chain = [];
  let cur = el;
  while (cur && chain.length < 8) {
    const r = cur.getBoundingClientRect();
    const cs = window.getComputedStyle(cur);
    chain.push({
      tag: cur.tagName,
      id: cur.getAttribute('data-block-id') || null,
      class: cur.className?.toString().slice(0, 60),
      width: r.width,
      maxWidth: cs.maxWidth,
      display: cs.display,
    });
    cur = cur.parentElement;
  }
  return chain;
});
console.log('ancestry:', JSON.stringify(ancestry, null, 2));

await browser.close();
