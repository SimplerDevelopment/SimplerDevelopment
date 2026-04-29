// Probe the footer brand link's computed flex behavior.
import { chromium } from 'playwright-core';

const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/sites/postcaptain.com', { waitUntil: 'load', timeout: 60000 });
await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

const link = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="footer-1"] footer .grid > div:first-child a');
  if (!el) return { error: 'brand link not found' };
  const cs = window.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    classes: el.className,
    flexWrap: cs.flexWrap,
    display: cs.display,
    gap: cs.gap,
    width: r.width,
    height: r.height,
    x: r.x,
    childCount: el.children.length,
  };
});
console.log('brand link:', link);

const img = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="footer-1"] footer .grid > div:first-child a img');
  if (!el) return { error: 'logo not found' };
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
});
console.log('logo:', img);

const wordmark = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="footer-1"] footer .grid > div:first-child a span');
  if (!el) return { error: 'wordmark not found' };
  const cs = window.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    fontSize: cs.fontSize,
    display: cs.display,
    width: r.width,
    height: r.height,
    x: r.x,
    y: r.y,
    text: el.textContent.slice(0, 40),
  };
});
console.log('wordmark:', wordmark);

const brandCol = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="footer-1"] footer .grid > div:first-child');
  if (!el) return { error: 'brand col not found' };
  const r = el.getBoundingClientRect();
  return { width: r.width, x: r.x };
});
console.log('brand col:', brandCol);

await browser.close();
