// Detect each section's y-range on the live and local postcaptain home by
// locating anchor text/elements with Playwright. Writes a JSON map at
// screenshots/section-anchors.json that sbs.mjs (and sbs-mobile.mjs) consume
// instead of hard-coded heuristic ranges.
//
// Why: each section's height differs between live and local (and between
// desktop and mobile) — without measuring, the SBS pairs misalign and
// pixelmatch reports nonsense for short sections.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/.planning/postcaptain-replication/screenshots';
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Each section has an anchor selector (or a list of fallback selectors). The
// anchor's bounding rect's `top` defines the section's start; the next section's
// top defines the previous section's end. Selectors must work on BOTH live and
// local; we use case-insensitive text-matching where possible.
const SECTIONS = [
  { id: 'hero', anchorText: ['DISCOVER A', 'Discover a'] },
  { id: 'services', anchorText: ['Mapping Smarter Moves'] },
  { id: 'portals', anchorText: ["See What's Possible in Slate", 'See What’s Possible in Slate'] },
  { id: 'audits', anchorText: ['Get More from Your Slate Instance'] },
  { id: 'solutions', anchorText: ['Charting a Clear Course'] },
  { id: 'stats', anchorText: ['TURNING SLATE INTO A', 'Turning Slate Into a', 'STRATEGIC GROWTH ENGINE', 'Strategic Growth Engine'] },
  { id: 'team', anchorText: ["Follow Our Team's Lead", 'Follow Our Team’s Lead'] },
  { id: 'cta-footer', anchorText: ['Your Slate Journey Starts Here'] },
];

const targets = [
  { id: 'live-desktop', url: 'https://postcaptain.com/', viewport: { width: 1440, height: 900 } },
  { id: 'local-desktop', url: 'http://localhost:3000/sites/postcaptain.com', viewport: { width: 1440, height: 900 } },
  { id: 'live-mobile', url: 'https://postcaptain.com/', viewport: { width: 390, height: 844 }, isMobile: true },
  { id: 'local-mobile', url: 'http://localhost:3000/sites/postcaptain.com', viewport: { width: 390, height: 844 }, isMobile: true },
];

async function findAnchorY(page, anchorTexts) {
  // Try each text in order; return absolute document Y of the element's top.
  for (const text of anchorTexts) {
    const y = await page.evaluate((needle) => {
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        if (n.nodeValue && n.nodeValue.includes(needle)) {
          let el = n.parentElement;
          // Walk up to find a block-level container with a sensible bounding
          // rect (skip pure inline spans inside larger headlines).
          while (el && el.tagName === 'SPAN') el = el.parentElement;
          if (!el) continue;
          const r = el.getBoundingClientRect();
          return r.top + window.scrollY;
        }
      }
      return null;
    }, text);
    if (y != null && Number.isFinite(y)) return y;
  }
  return null;
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const out = {};
  for (const t of targets) {
    console.log('detecting', t.id);
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

    // Mirror screenshot.mjs CSS suppressions so the announcement bar / dev
    // overlays don't shift the y-coordinates relative to what gets captured.
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
        #pc-announce { display: none !important; }
        body.pc-has-announce { padding-top: 0 !important; }
        body.pc-has-announce nav.fixed { top: 0 !important; }
        nextjs-portal,
        next-route-announcer,
        [data-nextjs-toast],
        [data-nextjs-build-indicator] {
          display: none !important;
        }
      `,
    });
    await page.evaluate(() => {
      const el = document.getElementById('pc-announce');
      if (el) el.remove();
      document.body.classList.remove('pc-has-announce');
      document.body.style.paddingTop = '';
      document.querySelectorAll('nextjs-portal, next-route-announcer, [data-nextjs-toast], [data-nextjs-build-indicator]').forEach((el) => el.remove());
    });

    // Force-reveal scroll loop to materialize lazy sections.
    await page.evaluate(async () => {
      const total = () => document.documentElement.scrollHeight;
      let y = 0;
      while (y < total()) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
        y += 350;
      }
      window.scrollTo(0, total());
      await new Promise((r) => setTimeout(r, 300));
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 300));
    });

    try {
      await page.waitForLoadState('networkidle', { timeout: 4000 });
    } catch {}

    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });

    const totalH = await page.evaluate(() => document.documentElement.scrollHeight);

    const anchors = {};
    for (const s of SECTIONS) {
      anchors[s.id] = await findAnchorY(page, s.anchorText);
    }
    out[t.id] = { totalHeight: totalH, anchors };
    await ctx.close();
  }
  await browser.close();
  writeFileSync(join(OUT_DIR, 'section-anchors.json'), JSON.stringify(out, null, 2));
  console.log('wrote', join(OUT_DIR, 'section-anchors.json'));
  console.log(JSON.stringify(out, null, 2));
})();
