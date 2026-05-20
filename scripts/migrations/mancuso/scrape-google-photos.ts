import { chromium } from 'playwright';

// Open Google's business-profile photo gallery for L. Mancuso & Son and
// harvest every lh*.googleusercontent.com URL it serves. Google's photo
// URLs are public CDN assets and embed cleanly via <img>.
const URL = 'https://www.google.com/search?q=L+Mancuso+%26+Son+Philadelphia';

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
    if (/lh\d\.googleusercontent\.com\/.+=w\d+-h\d+/.test(u)) seen.add(u);
    if (/lh\d\.googleusercontent\.com\/p\//.test(u)) seen.add(u);
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Accept any consent screen that may appear
  try {
    const consent = page.locator('button:has-text("Accept all"), button:has-text("I agree")').first();
    if (await consent.isVisible({ timeout: 1000 })) await consent.click();
  } catch {}

  // Try to find and click the "Photos" tile in the business panel
  try {
    const photosTile = page.locator('a:has-text("Photos"), div[aria-label*="Photo"]').first();
    if (await photosTile.isVisible({ timeout: 2000 })) {
      await photosTile.click();
      await page.waitForTimeout(2500);
    }
  } catch {}

  // Scroll the gallery a few times so lazy-loaded images come in
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(500);
  }

  // Also pull direct img src attributes
  const inlineImgs: string[] = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('img').forEach((img) => {
      const src = img.currentSrc || img.src;
      if (/lh\d\.googleusercontent\.com/.test(src)) out.push(src);
    });
    return out;
  });
  for (const u of inlineImgs) seen.add(u);

  await page.screenshot({ path: '/tmp/google-mancuso.png', fullPage: false });
  console.log('Saved snapshot to /tmp/google-mancuso.png');

  // Deduplicate by base URL (strip the =wXX-hXX suffix that Google appends)
  const dedup = new Set<string>();
  for (const u of seen) {
    const cleaned = u.replace(/=[^/]*$/, '');
    dedup.add(cleaned);
  }
  const list = Array.from(dedup);
  console.log('\nUnique base photo URLs found:', list.length);
  for (const u of list.slice(0, 30)) console.log('  ' + u);

  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
