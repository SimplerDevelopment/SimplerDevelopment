import { chromium } from 'playwright';

const PAGES = [
  { slug: '/', file: '/tmp/mancuso-home.png' },
  { slug: '/cheese', file: '/tmp/mancuso-cheese.png' },
  { slug: '/sandwiches', file: '/tmp/mancuso-sandwiches.png' },
  { slug: '/story', file: '/tmp/mancuso-story.png' },
  { slug: '/visit', file: '/tmp/mancuso-visit.png' },
];
const BASE = 'http://localhost:3000/sites/mancuso.simplerdevelopment.com';

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));

  // 1) Unlock
  const unlockResp = await fetch('http://localhost:3000/api/preview-unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'CHEESE26' }),
  });
  const unlockJson: { success: boolean; data?: { url: string } } = await unlockResp.json();
  await page.goto(unlockJson.data!.url, { waitUntil: 'load' });

  // 2) Visit each page; scroll through it so the IntersectionObserver fires
  for (const p of PAGES) {
    const url = `${BASE}${p.slug === '/' ? '' : p.slug}`;
    await page.goto(url, { waitUntil: 'load' });

    // Reveal all .mc-reveal elements ahead of the screenshot
    await page.evaluate(async () => {
      const els = Array.from(document.querySelectorAll('.mc-reveal'));
      els.forEach((el) => el.classList.add('is-in'));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });

    // Wait for every <img> to finish loading or fail
    await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise((r) => {
            img.addEventListener('load', () => r(null), { once: true });
            img.addEventListener('error', () => r(null), { once: true });
            // safety timeout per-image
            setTimeout(() => r(null), 8000);
          });
        }),
      );
    });

    // Surface any images that did NOT actually load
    const broken = await page.evaluate(() => {
      const out: { src: string; w: number; h: number }[] = [];
      document.querySelectorAll('img').forEach((img) => {
        if (img.src && img.naturalWidth === 0) {
          out.push({ src: img.src, w: img.naturalWidth, h: img.naturalHeight });
        }
      });
      return out;
    });
    if (broken.length) {
      console.log('  ⚠ broken images:');
      broken.forEach((b) => console.log(`    - ${b.src}`));
    }

    // Stats for this page
    const stats = await page.evaluate(() => {
      const main = document.querySelector('.mc-page') || document.body;
      return {
        title: document.title,
        revealEls: document.querySelectorAll('.mc-reveal').length,
        revealedEls: document.querySelectorAll('.mc-reveal.is-in').length,
        h1: document.querySelector('h1')?.textContent?.trim().slice(0, 80) || null,
        h2s: Array.from(document.querySelectorAll('h2')).map((h) => h.textContent?.trim().slice(0, 60)).slice(0, 6),
        pageHeight: (main as HTMLElement).getBoundingClientRect().height,
      };
    });

    await page.screenshot({ path: p.file, fullPage: true });
    console.log(`✓ ${p.slug.padEnd(12)} → ${p.file}  ${stats.pageHeight}px  reveals ${stats.revealedEls}/${stats.revealEls}`);
    console.log(`     title: ${stats.title}`);
    console.log(`     h1:    ${stats.h1}`);
    console.log(`     h2s:   ${stats.h2s.join(' · ')}`);
    console.log();
  }

  console.log('--- console errors ---');
  for (const e of errors) console.log(e);
  if (errors.length === 0) console.log('(none)');

  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
