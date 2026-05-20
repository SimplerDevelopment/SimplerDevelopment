// One-off Playwright script: navigate to the magamommy home, screenshot
// full page + per-section, and dump a quick DOM summary so we can review
// the actual rendered output and spot design issues.

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const URL = process.env.MM_URL ?? 'http://localhost:3001/sites/magamommy.simplerdevelopment.com/home';
const OUT = path.resolve('.qa-reports/magamommy-home');

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

console.log(`Navigating to ${URL}`);
const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });
console.log(`HTTP ${resp?.status()}`);

// Wait for fonts + any async data fetches the blocks do (product-grid hits
// /api/storefront/.../products, etc.).
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);

// Full page screenshot.
const fullPath = path.join(OUT, 'full.png');
await page.screenshot({ path: fullPath, fullPage: true });
console.log(`Full-page screenshot → ${fullPath}`);

// Above-the-fold (desktop).
const foldPath = path.join(OUT, 'fold-desktop.png');
await page.screenshot({ path: foldPath, fullPage: false });
console.log(`Fold screenshot → ${foldPath}`);

// Mobile fold.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
const mobilePath = path.join(OUT, 'fold-mobile.png');
await page.screenshot({ path: mobilePath, fullPage: false });
console.log(`Mobile fold screenshot → ${mobilePath}`);

// Mobile full page.
const mobileFullPath = path.join(OUT, 'full-mobile.png');
await page.screenshot({ path: mobileFullPath, fullPage: true });
console.log(`Mobile full screenshot → ${mobileFullPath}`);

// Back to desktop for DOM summary.
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(500);

// Summarize top-level sections so we know what's actually rendering.
const summary = await page.evaluate(() => {
  const root = document.querySelector('main') ?? document.body;
  const direct = Array.from(root.children);
  return direct.map((el, i) => {
    const rect = el.getBoundingClientRect();
    return {
      i,
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 80),
      h: Math.round(rect.height),
      w: Math.round(rect.width),
      preview: (el.textContent ?? '').replace(/\s+/g, ' ').slice(0, 100),
    };
  });
});

// Computed style of the headline so we know if the brand font landed.
const headingStyle = await page.evaluate(() => {
  const h1 = document.querySelector('h1');
  if (!h1) return null;
  const cs = window.getComputedStyle(h1);
  return {
    text: (h1.textContent ?? '').slice(0, 100),
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    color: cs.color,
  };
});

console.log('\n── Top-level sections ──');
for (const s of summary) {
  console.log(`${String(s.i).padStart(2)} ${s.tag.padEnd(6)} h=${String(s.h).padStart(4)} w=${String(s.w).padStart(4)} ${s.cls}`);
  if (s.preview) console.log(`   "${s.preview}"`);
}

console.log('\n── H1 computed style ──');
console.log(JSON.stringify(headingStyle, null, 2));

await browser.close();
console.log('\nDone.');
