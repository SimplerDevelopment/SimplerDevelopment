// One-off probe: dump every SVG/asset reference in the hero region of
// postcaptain.com so we can see what background texture (if any) exists.
import { chromium } from 'playwright-core';

const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('https://postcaptain.com/', { waitUntil: 'load', timeout: 60000 });

const data = await page.evaluate(() => {
  const h1 = document.querySelector('h1');
  if (!h1) return { error: 'no-h1' };
  let hero = h1;
  for (let i = 0; i < 8 && hero.parentElement; i++) {
    hero = hero.parentElement;
    const r = hero.getBoundingClientRect();
    if (r.height > 600) break;
  }
  const heroRect = hero.getBoundingClientRect();
  const out = {
    heroTag: hero.tagName,
    heroId: hero.id,
    heroClass: hero.className?.toString?.()?.slice?.(0, 200),
    heroSize: { w: heroRect.width, h: heroRect.height },
    backgroundImages: [],
    inlineSvgs: [],
    imgs: [],
  };

  // Walk hero ancestors for background-image.
  let scope = hero;
  for (let i = 0; i < 6 && scope; i++) {
    const cs = window.getComputedStyle(scope);
    const bg = cs.backgroundImage;
    if (bg && bg !== 'none') {
      out.backgroundImages.push({
        tag: scope.tagName,
        id: scope.id || null,
        cls: scope.className?.toString?.()?.slice?.(0, 80),
        backgroundImage: bg.slice(0, 400),
      });
    }
    // Pseudo-elements
    for (const pseudo of ['::before', '::after']) {
      const pcs = window.getComputedStyle(scope, pseudo);
      const pbg = pcs.backgroundImage;
      const content = pcs.content;
      if (pbg && pbg !== 'none' && content !== 'none') {
        out.backgroundImages.push({
          tag: `${scope.tagName}${pseudo}`,
          id: scope.id || null,
          cls: scope.className?.toString?.()?.slice?.(0, 80),
          backgroundImage: pbg.slice(0, 400),
        });
      }
    }
    scope = scope.parentElement;
  }

  // Walk hero descendants for background-image.
  const all = hero.querySelectorAll('*');
  let count = 0;
  for (const el of all) {
    if (count > 200) break;
    const cs = window.getComputedStyle(el);
    const bg = cs.backgroundImage;
    if (bg && bg !== 'none' && /url\(/.test(bg)) {
      out.backgroundImages.push({
        tag: el.tagName,
        id: el.id || null,
        cls: el.className?.toString?.()?.slice?.(0, 80),
        backgroundImage: bg.slice(0, 400),
      });
      count++;
    }
    for (const pseudo of ['::before', '::after']) {
      const pcs = window.getComputedStyle(el, pseudo);
      const pbg = pcs.backgroundImage;
      const content = pcs.content;
      if (pbg && pbg !== 'none' && /url\(/.test(pbg) && content !== 'none') {
        out.backgroundImages.push({
          tag: `${el.tagName}${pseudo}`,
          id: el.id || null,
          cls: el.className?.toString?.()?.slice?.(0, 80),
          backgroundImage: pbg.slice(0, 400),
        });
      }
    }
  }

  // Inline SVGs in hero.
  const svgs = hero.querySelectorAll('svg');
  for (const svg of svgs) {
    const r = svg.getBoundingClientRect();
    out.inlineSvgs.push({
      w: r.width,
      h: r.height,
      ariaLabel: svg.getAttribute('aria-label'),
      preview: svg.outerHTML.slice(0, 250),
    });
  }

  // Imgs in hero.
  const imgs = hero.querySelectorAll('img');
  for (const img of imgs) {
    out.imgs.push({
      src: img.getAttribute('src'),
      alt: img.getAttribute('alt'),
    });
  }

  return out;
});

console.log(JSON.stringify(data, null, 2));
await browser.close();
