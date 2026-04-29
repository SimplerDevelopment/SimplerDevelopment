import { chromium } from 'playwright-core';

const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/sites/postcaptain.com', { waitUntil: 'load', timeout: 60000 });
await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

const arrow = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="cs-metrics"] .grid a .inline-flex svg');
  if (!el) return { error: 'no arrow svg' };
  const cs = window.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    display: cs.display,
    visibility: cs.visibility,
    opacity: cs.opacity,
    color: cs.color,
    fill: cs.fill,
    width: cs.width,
    height: cs.height,
    rectWidth: r.width,
    rectHeight: r.height,
  };
});
console.log('case study arrow:', arrow);

const inlineFlex = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="cs-metrics"] .grid a .inline-flex');
  if (!el) return { error: 'no inline-flex' };
  const cs = window.getComputedStyle(el);
  return { display: cs.display, color: cs.color, fontSize: cs.fontSize };
});
console.log('inline-flex:', inlineFlex);

const parents = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="cs-metrics"] .grid a .inline-flex');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    text: el.textContent,
    width: r.width,
    height: r.height,
    childCount: el.childNodes.length,
    children: Array.from(el.childNodes).map(n => ({
      type: n.nodeType,
      text: n.textContent?.slice(0, 30),
      tagName: n.tagName,
      rect: n.nodeType === 1 ? n.getBoundingClientRect() : null,
    })),
  };
});
console.log('inline-flex parent + children:', JSON.stringify(parents, null, 2));

const allRules = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="cs-metrics"] .grid a .inline-flex svg');
  if (!el) return [];
  const matches = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        if (rule.selectorText && rule.style) {
          try {
            if (el.matches(rule.selectorText)) {
              const props = {};
              for (const prop of rule.style) {
                props[prop] = rule.style.getPropertyValue(prop) + (rule.style.getPropertyPriority(prop) ? ' !important' : '');
              }
              if (Object.keys(props).some(p => ['width','height','display','color'].includes(p))) {
                matches.push({ selector: rule.selectorText, props });
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
  return matches;
});
console.log('matched rules:', JSON.stringify(allRules, null, 2));

await browser.close();
