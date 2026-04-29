// Capture matched screenshots of live + local postcaptain home at desktop+mobile.
// Forces reduced motion + scrolls slowly to trigger IntersectionObserver reveal animations.
//
// Pipeline guarantees (post-fix):
//   - Both sides capture at deviceScaleFactor: 1 (no Retina doubling).
//   - Mobile captures are clipped to the viewport width so horizontal overflow
//     on either site can't make the local capture artificially wider than live.
//   - We wait on document.fonts.ready before the final screenshot so that
//     Material Icons render as glyphs rather than as their text-name fallback.
//   - We also wait briefly on networkidle so any late-arriving icon/font CDN
//     requests resolve.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/.planning/postcaptain-replication/screenshots';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const targets = [
  { id: 'live-desktop', url: 'https://postcaptain.com/', viewport: { width: 1440, height: 900 } },
  { id: 'local-desktop', url: 'http://localhost:3000/sites/postcaptain.com', viewport: { width: 1440, height: 900 } },
  { id: 'live-mobile', url: 'https://postcaptain.com/', viewport: { width: 390, height: 844 }, isMobile: true },
  { id: 'local-mobile', url: 'http://localhost:3000/sites/postcaptain.com', viewport: { width: 390, height: 844 }, isMobile: true },
];

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  for (const t of targets) {
    console.log('capturing', t.id, t.url);
    const ctx = await browser.newContext({
      viewport: t.viewport,
      deviceScaleFactor: 1,
      isMobile: t.isMobile ?? false,
      hasTouch: t.isMobile ?? false,
      reducedMotion: 'reduce',
      userAgent: t.isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    try {
      await page.goto(t.url, { waitUntil: 'load', timeout: 60000 });
    } catch (e) {
      console.warn('  goto failure', e?.message);
    }

    // Force-reveal: kill anim transforms/opacity:0 + scroll-trigger every section.
    // Also suppress the local-only #pc-announce banner (and any nav top-offset
    // it adds via body.pc-has-announce) so the captures align with the live
    // site, which has no announcement bar.
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
        [data-aos], .aos-init, .elementor-invisible,
        .has-fade-in, .fade-in, .reveal, .animate-on-scroll,
        [class*="aos-"], [class*="fade-"], [class*="reveal-"] {
          opacity: 1 !important;
          transform: none !important;
          visibility: visible !important;
        }
        /* Local-only announcement bar — hide so screenshots align with live. */
        #pc-announce { display: none !important; }
        body.pc-has-announce { padding-top: 0 !important; }
        body.pc-has-announce nav.fixed { top: 0 !important; }
      `,
    });

    // Some banners are injected as JS DOM nodes after CSS resolves; remove the
    // class+padding that pushes the rest of the page down, in case the script
    // ran before our addStyleTag.
    await page.evaluate(() => {
      const el = document.getElementById('pc-announce');
      if (el) el.remove();
      document.body.classList.remove('pc-has-announce');
      document.body.style.paddingTop = '';
    });

    // Slow scroll to trigger IntersectionObserver reveals
    await page.evaluate(async () => {
      const total = () => document.documentElement.scrollHeight;
      let y = 0;
      while (y < total()) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
        y += 350;
      }
      window.scrollTo(0, total());
      await new Promise((r) => setTimeout(r, 600));
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 400));
    });

    // Wait for the icon-font CDN + any other late requests to settle so that
    // Material Icons resolve to glyphs (otherwise they capture as their text
    // name like "rocket_launch", which destroys pixelmatch scoring).
    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      // Some pages never reach perfect idle; tolerate it.
    }

    // Hard wait on document.fonts.ready — the canonical browser API for "every
    // declared font face is loaded and ready to render."
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      // One more rAF to flush any glyph re-layout.
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });

    await page.waitForTimeout(800);

    // Capture the full scrollable page, then post-crop to the intended viewport
    // width via sharp. We can't use `clip` here because clip only operates
    // within currently-rendered area — to get full-page we must use
    // `fullPage: true`. Playwright's full-page capture extends the canvas
    // horizontally if any element overflows the viewport (which the local
    // mobile site was doing → 555px-wide screenshot vs live's 390px). The
    // post-crop forces width parity between live and local.
    const outPath = join(OUT, `${t.id}.png`);
    const buf = await page.screenshot({ fullPage: true });
    const meta = await sharp(buf).metadata();
    const targetW = t.viewport.width;
    if ((meta.width ?? 0) > targetW) {
      console.log(`  cropping ${t.id} from ${meta.width}px wide to ${targetW}px`);
      await sharp(buf).extract({ left: 0, top: 0, width: targetW, height: meta.height ?? 0 }).toFile(outPath);
    } else {
      await sharp(buf).toFile(outPath);
    }
    await ctx.close();
  }
  await browser.close();
  console.log('done.');
})();
