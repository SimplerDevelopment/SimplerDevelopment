/**
 * Zoom screenshot — scroll to a specific section and capture just that region.
 *
 * Usage:
 *   npx tsx scripts/migrations/cardiff/visual-zoom.ts <selector> <slug>
 *   npx tsx scripts/migrations/cardiff/visual-zoom.ts '[data-block-id="testimonials"]' testimonials
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const URL = 'http://localhost:3000/sites/cardiff-main.simplerdevelopment.com/';
const OUT = 'scripts/migrations/cardiff/.visual-review/zoom';

async function main() {
  const [selector, label] = process.argv.slice(2);
  if (!selector || !label) {
    console.error('Usage: visual-zoom.ts <selector> <label>');
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000); // give html-render effects time to run
  const el = await page.$(selector);
  if (!el) {
    console.error('Element not found:', selector);
    process.exit(1);
  }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await el.screenshot({ path: join(OUT, `${label}.png`) });
  console.log(`📸 ${OUT}/${label}.png`);
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
