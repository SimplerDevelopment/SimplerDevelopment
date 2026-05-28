/**
 * Cardiff migration — Visual review pipeline
 *
 * Drives Playwright Chromium to:
 *   1. Screenshot cardiff.co (baseline) at 1440x900 desktop viewport
 *   2. Screenshot the migrated site at the same viewport
 *   3. Save full-page + per-section + computed-style summaries
 *
 * Output: scripts/migrations/cardiff/.visual-review/{baseline,migrated}/<slug>.png
 *         scripts/migrations/cardiff/.visual-review/styles-<page>.json (computed colors per section)
 *
 * Run:  npx tsx scripts/migrations/cardiff/visual-review.ts
 *       npx tsx scripts/migrations/cardiff/visual-review.ts --only-migrated
 *       npx tsx scripts/migrations/cardiff/visual-review.ts --slug=home
 */

import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT = 'scripts/migrations/cardiff/.visual-review';
const VIEWPORT = { width: 1440, height: 900 };

const PAGES = [
  { slug: 'home', source: 'https://cardiff.co/', migrated: '/' },
  { slug: 'about', source: 'https://cardiff.co/about/', migrated: '/about' },
  { slug: 'working-capital', source: 'https://cardiff.co/business-loans/products/working-capital/', migrated: '/working-capital' },
  { slug: 'industries-restaurants', source: 'https://cardiff.co/industries/restaurants/', migrated: '/industries-restaurants' },
  { slug: 'blog-sample', source: 'https://cardiff.co/learn/financial-planning-for-sustainable-seasonal-businesses/', migrated: '/financial-planning-for-sustainable-seasonal-businesses' },
];

const MIGRATED_BASE = 'http://localhost:3000/sites/cardiff-main.simplerdevelopment.com';

async function capture(page: Page, url: string, outPath: string, label: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e: any) {
    console.warn(`  ⚠️  ${label} navigate: ${e.message.slice(0, 100)}`);
    return;
  }
  // Give web fonts + images a beat
  await page.waitForTimeout(2000);
  // Try to dismiss cookie banners or chat popups via Escape
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: outPath, fullPage: true, type: 'png' });
  console.log(`  📸 ${label} → ${outPath}`);
}

async function collectSectionColors(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    const results: any[] = [];
    const seen = new Set<number>();
    const all = document.body.querySelectorAll('section, div, header, footer');
    all.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height < 80 || r.width < 600) return;
      const t = Math.round(r.top + window.scrollY);
      const bucket = Math.round(t / 50) * 50;
      if (seen.has(bucket)) return;
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const bgImg = cs.backgroundImage;
      if (bg === 'rgba(0, 0, 0, 0)' && bgImg === 'none') return;
      seen.add(bucket);
      results.push({
        tag: el.tagName.toLowerCase(),
        id: (el as HTMLElement).id || null,
        class: (el.className || '').toString().slice(0, 120),
        top: t,
        height: Math.round(r.height),
        bg,
        bgImage: bgImg !== 'none' ? bgImg.slice(0, 200) : null,
        color: cs.color,
        fontFamily: cs.fontFamily,
      });
    });
    return results.sort((a, b) => a.top - b.top).slice(0, 40);
  });
}

async function main() {
  const onlyMigrated = process.argv.includes('--only-migrated');
  const slugFilter = process.argv.find(a => a.startsWith('--slug='))?.slice(7);
  mkdirSync(join(OUT, 'baseline'), { recursive: true });
  mkdirSync(join(OUT, 'migrated'), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);

  for (const p of PAGES) {
    if (slugFilter && p.slug !== slugFilter) continue;
    console.log(`\n━ ${p.slug}`);
    if (!onlyMigrated) {
      await capture(page, p.source, join(OUT, 'baseline', `${p.slug}.png`), 'baseline');
      const baseColors = await collectSectionColors(page);
      writeFileSync(join(OUT, `baseline-${p.slug}-colors.json`), JSON.stringify(baseColors, null, 2));
    }
    await capture(page, MIGRATED_BASE + p.migrated, join(OUT, 'migrated', `${p.slug}.png`), 'migrated');
    const migColors = await collectSectionColors(page);
    writeFileSync(join(OUT, `migrated-${p.slug}-colors.json`), JSON.stringify(migColors, null, 2));
  }

  await ctx.close();
  await browser.close();
  console.log(`\n✅ done — open ${OUT}/`);
}

main().catch(e => { console.error(e); process.exit(1); });
