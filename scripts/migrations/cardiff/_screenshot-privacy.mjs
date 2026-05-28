import { chromium } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

const p1 = await ctx.newPage();
await p1.goto('https://cardiff.co/privacy-policy/', { waitUntil: 'networkidle', timeout: 45000 });
await p1.waitForTimeout(800);
await p1.screenshot({ path: '/tmp/cardiff-privacy-orig.png', fullPage: false });

const p2 = await ctx.newPage();
await p2.goto('http://localhost:3000/sites/cardiff-main.simplerdevelopment.com/privacy-policy', { waitUntil: 'networkidle', timeout: 45000 });
await p2.waitForTimeout(1500);
await p2.screenshot({ path: '/tmp/cardiff-privacy-port.png', fullPage: false });

await browser.close();
console.log('done');
