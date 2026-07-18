// Public-render gate checks (G2-prod / G3 / G4) — loads the published scratch page
// (no auth needed) and inspects computed styles for render-side card verdicts.
// Run with node from repo root:  OUT=… URL=… node .../qa-render-check.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:3000/sites/simplerdevelopment.com/veqa-scratch';
const OUT = process.env.OUT || './veqa-render';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[render]', ...a);

const browser = await chromium.launch({ headless: true });

for (const [vp, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/render-${vp}.png`, fullPage: true });

  // VEQA-036 (default max-width ~250px) + VEQA-037 (default center) on the "Click Me" button
  const btn = await page.evaluate(() => {
    const el = [...document.querySelectorAll('a,button')].find((e) => /click me/i.test(e.textContent || ''));
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // walk up to find the alignment container
    const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
    return {
      found: true,
      maxWidth: cs.maxWidth,
      renderedWidth: Math.round(r.width),
      display: cs.display,
      leftOffset: Math.round(r.left),
      viewportWidth: window.innerWidth,
      parentTextAlign: parent?.textAlign,
      parentJustify: parent?.justifyContent,
    };
  });
  log(vp, JSON.stringify(btn));
  await ctx.close();
}
await browser.close();
log('done ->', OUT);
