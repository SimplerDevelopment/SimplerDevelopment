// Probe computed styles for the cs-metrics value/label/heading-col on local.
import { chromium } from 'playwright-core';

const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/sites/postcaptain.com', { waitUntil: 'load', timeout: 60000 });
await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

// First metric value div
const probe = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="cs-metrics"] .grid > a > div > div:first-child > div:first-child');
  if (!el) return { error: 'value div not found' };
  const cs = window.getComputedStyle(el);
  return {
    text: el.textContent.slice(0, 60),
    inlineStyle: el.getAttribute('style'),
    fontSize: cs.fontSize,
    whiteSpace: cs.whiteSpace,
    lineHeight: cs.lineHeight,
    width: el.getBoundingClientRect().width,
    height: el.getBoundingClientRect().height,
  };
});
console.log('value:', probe);

const headingCol = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="cs-metrics"] .grid > a > div > div:first-child');
  if (!el) return { error: 'heading-col not found' };
  const cs = window.getComputedStyle(el);
  return {
    inlineStyle: el.getAttribute('style'),
    paddingRight: cs.paddingRight,
    width: el.getBoundingClientRect().width,
  };
});
console.log('heading-col:', headingCol);

const label = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="cs-metrics"] .grid > a > div > div:first-child > div:nth-child(2)');
  if (!el) return { error: 'label not found' };
  const cs = window.getComputedStyle(el);
  return {
    text: el.textContent.slice(0, 80),
    fontSize: cs.fontSize,
    maxWidth: cs.maxWidth,
    width: el.getBoundingClientRect().width,
    whiteSpace: cs.whiteSpace,
  };
});
console.log('label:', label);

const suffix = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="cs-metrics"] .pc-metric-suffix');
  if (!el) return { error: 'suffix not found' };
  const cs = window.getComputedStyle(el);
  return {
    text: el.textContent,
    display: cs.display,
    fontSize: cs.fontSize,
    whiteSpace: cs.whiteSpace,
    width: el.getBoundingClientRect().width,
    height: el.getBoundingClientRect().height,
    x: el.getBoundingClientRect().x,
    y: el.getBoundingClientRect().y,
  };
});
console.log('suffix:', suffix);

// Also probe the parent's natural width and child positioning
const parentInfo = await page.evaluate(() => {
  const parent = document.querySelector('[data-block-id="cs-metrics"] .grid > a > div > div:first-child > div:first-child');
  if (!parent) return null;
  const r = parent.getBoundingClientRect();
  const children = Array.from(parent.childNodes).map((n) => ({
    type: n.nodeType,
    text: n.textContent?.slice(0, 30),
    rect: n.nodeType === 1 ? (n).getBoundingClientRect() : null,
  }));
  return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, children };
});
console.log('parent + children:', JSON.stringify(parentInfo, null, 2));

// All matched rules (any property) for the first suffix
const allSuffixRules = await page.evaluate(() => {
  const el = document.querySelector('.pc-metric-suffix');
  if (!el) return [];
  const matches = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        if (rule.selectorText && rule.style) {
          try {
            if (el.matches(rule.selectorText)) {
              const props = {};
              for (const prop of rule.style) props[prop] = rule.style.getPropertyValue(prop) + (rule.style.getPropertyPriority(prop) ? ' !important' : '');
              matches.push({ selector: rule.selectorText, props });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
  return matches;
});
console.log('all matched rules for suffix:', JSON.stringify(allSuffixRules, null, 2));

// Inspect ALL elements with class pc-metric-suffix and their tag/parent
const suffixDetails = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.pc-metric-suffix')).slice(0, 2).map((el) => {
    const cs = window.getComputedStyle(el);
    return {
      tag: el.tagName,
      text: el.textContent,
      classes: el.className,
      display: cs.display,
      fontSize: cs.fontSize,
      parentTag: el.parentElement?.tagName,
      parentText: el.parentElement?.textContent?.slice(0, 50),
      parentClasses: el.parentElement?.className?.slice(0, 80),
    };
  });
});
console.log('suffix details:', JSON.stringify(suffixDetails, null, 2));

// Use CSSStyleDeclaration trace to see which rule set display
const matchedRules = await page.evaluate(() => {
  const el = document.querySelector('[data-block-id="cs-metrics"] .pc-metric-suffix');
  if (!el) return null;
  // Walk all stylesheets to find rules matching this element with display
  const matches = [];
  for (const sheet of document.styleSheets) {
    try {
      const rules = sheet.cssRules || [];
      for (const rule of rules) {
        if (rule.style && rule.style.display) {
          try {
            if (el.matches(rule.selectorText)) {
              matches.push({
                selector: rule.selectorText,
                display: rule.style.getPropertyValue('display'),
                priority: rule.style.getPropertyPriority('display'),
              });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
  return matches;
});
console.log('matched display rules:', JSON.stringify(matchedRules, null, 2));

await browser.close();
