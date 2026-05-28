import { chromium } from 'playwright';
const phase = process.argv[2] || 'before';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
if (phase === 'before') {
  try {
    const page = await ctx.newPage();
    await page.goto('https://cardiff.co/learn/getting-ready/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/cardiff-orig-iter2.png', fullPage: true });
  } catch (e) { console.error('orig failed', e.message); }
}
const page2 = await ctx.newPage();
await page2.goto('http://localhost:3000/sites/cardiff-main.simplerdevelopment.com/getting-ready', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page2.waitForTimeout(1500);
await page2.screenshot({ path: `/tmp/cardiff-port-iter2-${phase}.png`, fullPage: true });
await browser.close();
console.log('done', phase);
