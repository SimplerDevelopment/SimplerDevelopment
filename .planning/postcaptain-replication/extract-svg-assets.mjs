// Extract custom SVG assets from postcaptain.com that we need to render
// services panel icons + the hero background-overlay texture.
//
// Strategy
// --------
// 1. Load the live page in Chromium with the same reduced-motion + scroll
//    pipeline screenshot.mjs uses, so that any IntersectionObserver-revealed
//    SVGs are present in the DOM.
// 2. For the SERVICES section: each panel exposes a feature-list of three
//    icons. Live uses outlined hand-drawn SVGs (NOT Material Icons). We probe
//    the DOM for each panel's <svg> inline content AND for any <img src="*.svg">
//    references inside the panel.
// 3. For the HERO section: the gradient hero has a subtle diagonal-streak
//    texture. We probe its background-image for url('*.svg'), and we also
//    capture any inline <svg> children that span the hero's bounding box.
//
// Output
// ------
//   public/sites/postcaptain/svg/<descriptive-name>.svg   (asset files)
//   .planning/postcaptain-replication/svg-manifest.json   (manifest)
//
// Conservative — only extracts assets we plan to actually wire into post 302.
// Run with:
//   bun .planning/postcaptain-replication/extract-svg-assets.mjs
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SVG_DIR = join(REPO_ROOT, 'public', 'sites', 'postcaptain', 'svg');
const MANIFEST_PATH = join(__dirname, 'svg-manifest.json');
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!existsSync(SVG_DIR)) mkdirSync(SVG_DIR, { recursive: true });

// Slug a label into a filesystem-safe filename.
function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Pretty-print an SVG for human inspection. Light touch — not a full formatter.
function tidySvgString(svg) {
  if (!svg) return svg;
  return svg
    .replace(/>\s+</g, '>\n<')
    .replace(/^\s+|\s+$/g, '')
    .concat('\n');
}

// Section probes. Each yields zero-or-more candidate assets. Each candidate
// has: { kind: 'inline'|'remote', section, label, svg?, url? }.
const SECTION_PROBES = [
  {
    section: 'services',
    // The services section heading is "Mapping Smarter Moves" or contains
    // service-panel labels like Implementation/Projects/Support. We collect
    // SVG icons inside the service panels' feature lists.
    async probe(page) {
      const candidates = await page.evaluate(() => {
        // Find the services section by scanning headings.
        const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,p'));
        const heading = headings.find((h) =>
          /Mapping Smarter Moves/i.test(h.textContent || '')
        );
        if (!heading) return [];
        // Walk up to find the section container.
        let section = heading;
        for (let i = 0; i < 12 && section.parentElement; i++) {
          section = section.parentElement;
          if (
            /section/i.test(section.tagName) ||
            section.getAttribute('data-section') ||
            (section.id && /service/i.test(section.id))
          ) {
            break;
          }
        }
        if (!section) return [];

        const out = [];

        // 1. Inline <svg> children that look like icons (small bbox, has
        //    paths/lines/polylines, NOT inside a <button> or used as a logo).
        const inlineSvgs = section.querySelectorAll('svg');
        let idx = 0;
        for (const svg of inlineSvgs) {
          const rect = svg.getBoundingClientRect();
          // Skip large SVGs (likely backgrounds/decorations) and tiny ones (carets).
          if (rect.width < 12 || rect.width > 80) continue;
          if (rect.height < 12 || rect.height > 80) continue;
          // Skip SVGs whose markup is just a <use href> from a sprite — we want
          // the standalone primitives.
          const hasGeometry = svg.querySelector('path, line, polyline, polygon, circle, rect');
          if (!hasGeometry) continue;
          // Try to find a sibling label for descriptive naming.
          let label = '';
          let parent = svg.parentElement;
          for (let i = 0; i < 4 && parent; i++) {
            const txt = (parent.textContent || '').trim().slice(0, 60);
            if (txt && txt.length > 2) {
              label = txt;
              break;
            }
            parent = parent.parentElement;
          }
          out.push({
            kind: 'inline',
            section: 'services',
            label: label || `services-icon-${idx}`,
            svg: svg.outerHTML,
            index: idx,
          });
          idx++;
        }

        // 2. <img src="*.svg"> references.
        const imgs = section.querySelectorAll('img[src*=".svg"]');
        let imgIdx = 0;
        for (const img of imgs) {
          const src = img.getAttribute('src') || '';
          let alt = (img.getAttribute('alt') || '').trim();
          if (!alt) {
            // Try ancestor text as fallback label.
            let parent = img.parentElement;
            for (let i = 0; i < 3 && parent; i++) {
              const txt = (parent.textContent || '').trim().slice(0, 40);
              if (txt) {
                alt = txt;
                break;
              }
              parent = parent.parentElement;
            }
          }
          out.push({
            kind: 'remote',
            section: 'services',
            label: alt || `services-img-${imgIdx}`,
            url: src,
            index: imgIdx,
          });
          imgIdx++;
        }

        return out;
      });
      return candidates;
    },
  },
  {
    section: 'hero',
    async probe(page) {
      const candidates = await page.evaluate(() => {
        // Hero is at the top of the page. Find the first <section> or large
        // container that contains the H1.
        const h1 = document.querySelector('h1');
        if (!h1) return [];
        let hero = h1;
        for (let i = 0; i < 8 && hero.parentElement; i++) {
          hero = hero.parentElement;
          const r = hero.getBoundingClientRect();
          if (r.height > 400) break;
        }
        if (!hero) return [];

        const out = [];

        // 1. background-image url(*.svg) on the hero or its ancestors.
        let scope = hero;
        const seenUrls = new Set();
        for (let i = 0; i < 4 && scope; i++) {
          const cs = window.getComputedStyle(scope);
          const bg = cs.backgroundImage || '';
          // Match url("...svg") and url(...svg)
          const re = /url\(["']?([^"')]+\.svg[^"')]*)["']?\)/g;
          let m;
          while ((m = re.exec(bg))) {
            const u = m[1];
            if (seenUrls.has(u)) continue;
            seenUrls.add(u);
            out.push({
              kind: 'remote',
              section: 'hero',
              label: 'hero-background',
              url: u,
              index: out.length,
            });
          }
          scope = scope.parentElement;
        }

        // 2. Large inline <svg> elements that span the hero's bounding box —
        //    likely decorative streaks/textures.
        const heroRect = hero.getBoundingClientRect();
        const inlineSvgs = hero.querySelectorAll('svg');
        let idx = 0;
        for (const svg of inlineSvgs) {
          const rect = svg.getBoundingClientRect();
          // Decorative if: spans most of the hero width OR has an absolute /
          // pointer-events:none parent (typical of background overlays).
          const cs = window.getComputedStyle(svg);
          const parentCs = svg.parentElement ? window.getComputedStyle(svg.parentElement) : null;
          const looksDecorative =
            rect.width > heroRect.width * 0.5 ||
            cs.position === 'absolute' ||
            (parentCs && parentCs.position === 'absolute');
          if (!looksDecorative) continue;
          // Skip the logo SVG (has aria-label or is inside a link to "/").
          let parent = svg.parentElement;
          let isLogo = false;
          for (let i = 0; i < 4 && parent; i++) {
            if (parent.tagName === 'A' && /^\/?$/.test(parent.getAttribute('href') || '')) {
              isLogo = true;
              break;
            }
            const aria = svg.getAttribute('aria-label') || '';
            if (/logo|brand/i.test(aria)) {
              isLogo = true;
              break;
            }
            parent = parent.parentElement;
          }
          if (isLogo) continue;
          out.push({
            kind: 'inline',
            section: 'hero',
            label: `hero-overlay-${idx}`,
            svg: svg.outerHTML,
            index: idx,
          });
          idx++;
        }

        return out;
      });
      return candidates;
    },
  },
];

async function downloadSvgUrl(page, candidateUrl) {
  // Resolve relative URLs against the live origin.
  const absolute = new URL(candidateUrl, 'https://postcaptain.com').toString();
  const resp = await page.context().request.get(absolute, { timeout: 30000 });
  if (!resp.ok()) {
    return { ok: false, error: `${resp.status()} for ${absolute}` };
  }
  const ct = resp.headers()['content-type'] || '';
  const body = await resp.text();
  // Defensive: only accept if content looks like SVG.
  if (!/<svg/i.test(body) && !/svg/i.test(ct)) {
    return { ok: false, error: `not-svg-content-type=${ct}` };
  }
  return { ok: true, body, absolute };
}

(async () => {
  console.log('[extract-svg] launching browser');
  const browser = await chromium.launch({ executablePath, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  console.log('[extract-svg] loading https://postcaptain.com/');
  try {
    await page.goto('https://postcaptain.com/', { waitUntil: 'load', timeout: 60000 });
  } catch (e) {
    console.warn('[extract-svg] goto warning:', e?.message);
  }

  // Same reveal pipeline as screenshot.mjs.
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
    `,
  });
  await page.evaluate(async () => {
    const total = () => document.documentElement.scrollHeight;
    let y = 0;
    while (y < total()) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
      y += 350;
    }
    window.scrollTo(0, total());
    await new Promise((r) => setTimeout(r, 400));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  });
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch {}
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(500);

  const manifest = {
    extractedAt: new Date().toISOString(),
    source: 'https://postcaptain.com/',
    assets: [],
  };

  for (const probe of SECTION_PROBES) {
    console.log(`[extract-svg] probing section=${probe.section}`);
    const candidates = await probe.probe(page);
    console.log(`  -> ${candidates.length} candidates`);
    for (const c of candidates) {
      // Build filename: <section>-<label>-<index>.svg
      const labelSlug = slug(c.label).slice(0, 32) || 'asset';
      const fname = `${c.section}-${labelSlug}-${c.index}.svg`;
      const fpath = join(SVG_DIR, fname);

      if (c.kind === 'inline') {
        const tidy = tidySvgString(c.svg);
        writeFileSync(fpath, tidy, 'utf8');
        manifest.assets.push({
          section: c.section,
          label: c.label,
          source: 'inline-dom',
          savedAs: `public/sites/postcaptain/svg/${fname}`,
          publicPath: `/sites/postcaptain/svg/${fname}`,
          bytes: tidy.length,
        });
        console.log(`    saved inline -> ${fname} (${tidy.length}b)`);
      } else if (c.kind === 'remote') {
        try {
          const r = await downloadSvgUrl(page, c.url);
          if (!r.ok) {
            console.warn(`    skip remote (${c.url}): ${r.error}`);
            manifest.assets.push({
              section: c.section,
              label: c.label,
              source: c.url,
              skipped: true,
              reason: r.error,
            });
            continue;
          }
          writeFileSync(fpath, r.body, 'utf8');
          manifest.assets.push({
            section: c.section,
            label: c.label,
            source: r.absolute,
            savedAs: `public/sites/postcaptain/svg/${fname}`,
            publicPath: `/sites/postcaptain/svg/${fname}`,
            bytes: r.body.length,
          });
          console.log(`    saved remote -> ${fname} (${r.body.length}b)`);
        } catch (e) {
          console.warn(`    error remote (${c.url}): ${e?.message}`);
          manifest.assets.push({
            section: c.section,
            label: c.label,
            source: c.url,
            skipped: true,
            reason: e?.message,
          });
        }
      }
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`[extract-svg] manifest written: ${MANIFEST_PATH}`);
  console.log(`[extract-svg] total assets: ${manifest.assets.filter((a) => !a.skipped).length}`);
  console.log(`[extract-svg] skipped: ${manifest.assets.filter((a) => a.skipped).length}`);

  await ctx.close();
  await browser.close();
})();
