import { chromium } from 'playwright';

const URL = 'https://www.yelp.com/biz_photos/mancuso-lucio-j-and-son-philadelphia';

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
    locale: 'en-US',
  });
  const page = await ctx.newPage();

  const seen = new Set<string>();
  page.on('response', (resp) => {
    const u = resp.url();
    if (/s3-media\d?\.fl\.yelpcdn\.com\/bphoto\//.test(u)) seen.add(u);
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(700);
  }

  const inlineImgs = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('img').forEach((img) => {
      const src = img.currentSrc || img.src;
      if (/s3-media\d?\.fl\.yelpcdn\.com\/bphoto\//.test(src)) out.push(src);
    });
    return out;
  });
  for (const u of inlineImgs) seen.add(u);

  await page.screenshot({ path: '/tmp/yelp-mancuso.png', fullPage: false });

  // Group by base photo id (Yelp serves the same photo at /o.jpg, /l.jpg, etc.)
  const baseMap = new Map<string, string>();
  for (const u of seen) {
    const m = u.match(/bphoto\/([^/]+)\//);
    if (!m) continue;
    const base = m[1];
    // Prefer the large variant if multiple sizes seen for the same base
    const isLarge = /\/o\.jpg$/.test(u) || /\/l\.jpg$/.test(u);
    if (!baseMap.has(base) || isLarge) baseMap.set(base, u);
  }
  console.log('unique photos:', baseMap.size);
  // Normalize to /o.jpg (original, largest available)
  for (const [base, u] of baseMap) {
    const normalized = u.replace(/\/[a-z]+\.jpg$/, '/o.jpg');
    console.log(normalized);
  }

  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
