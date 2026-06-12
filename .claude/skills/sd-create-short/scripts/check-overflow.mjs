/**
 * check-overflow.mjs — Overflow checker for sd-create-short compositions.
 *
 * Usage:
 *   node check-overflow.mjs --html <composition.html> [--step 0.5]
 *
 * Arguments:
 *   --html <path>   Path to a contract-compliant composition HTML file.
 *   --step N        Sampling interval in seconds (default: 0.5).
 *
 * Walks every element at each sampled time step and reports any whose
 * bounding rect extends beyond [0, 0, width, height] by more than 2px.
 *
 * Exclusions (elements that are NEVER flagged):
 *   - Elements carrying data-overflow-ok attribute (or inside such an ancestor).
 *   - Elements with computed opacity < 0.05.
 *   - Elements with visibility: hidden or display: none.
 *   - Elements with zero-area bounding rect (width=0 or height=0).
 *
 * Exit codes:
 *   0  — no violations; prints JSON: { "violations": [] }
 *   1  — one or more violations; prints JSON: { "violations": [...] }
 */

import { chromium } from 'playwright';
import { existsSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { parseArgs } from 'util';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const { values: args } = parseArgs({
  options: {
    html: { type: 'string' },
    step: { type: 'string' },
  },
  strict: true,
});

if (!args.html) {
  process.stderr.write('Usage: node check-overflow.mjs --html <composition.html> [--step 0.5]\n');
  process.exit(1);
}

const htmlPath = path.resolve(args.html);
const step = args.step ? parseFloat(args.step) : 0.5;

if (!existsSync(htmlPath)) {
  process.stderr.write(`Error: HTML file not found: ${htmlPath}\n`);
  process.exit(1);
}

if (!Number.isFinite(step) || step <= 0) {
  process.stderr.write(`Error: invalid --step value: ${args.step}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Launch and load
// ---------------------------------------------------------------------------
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const fileUrl = pathToFileURL(htmlPath).toString();

await page.goto(fileUrl, { waitUntil: 'load' });

// Wait for window.__short.ready
await page.waitForFunction(() => window.__short && window.__short.ready instanceof Promise, { timeout: 30000 });
await page.evaluate(() => window.__short.ready);

const meta = await page.evaluate(() => ({
  width: window.__short.width,
  height: window.__short.height,
  duration: window.__short.duration,
}));

await page.setViewportSize({ width: meta.width, height: meta.height });
await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// ---------------------------------------------------------------------------
// Sample loop
// ---------------------------------------------------------------------------
const OVERFLOW_MARGIN = 2; // pixels of grace

/** Build a simple CSS selector for an element (best-effort, not guaranteed unique). */
function buildSelector(el) {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const classes = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/).join('.')
    : '';
  return `${tag}${classes}`;
}

const violations = [];
const sampleCount = Math.ceil(meta.duration / step) + 1;

for (let s = 0; s < sampleCount; s++) {
  const t = Math.min(s * step, meta.duration);

  await page.evaluate((seekTime) => Promise.resolve(window.__short.seek(seekTime)), t);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));

  const frameViolations = await page.evaluate(
    ({ vw, vh, margin }) => {
      const results = [];

      /**
       * Check if el (or any ancestor) has data-overflow-ok.
       */
      function hasOverflowOk(el) {
        let node = el;
        while (node && node !== document.body) {
          if (node.hasAttribute && node.hasAttribute('data-overflow-ok')) return true;
          node = node.parentElement;
        }
        return false;
      }

      function buildSelector(el) {
        if (el.id) return '#' + el.id;
        const tag = el.tagName.toLowerCase();
        const classes = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).join('.')
          : '';
        return tag + classes;
      }

      const all = document.querySelectorAll('*');
      for (const el of all) {
        // Skip overflow-ok elements and their descendants
        if (hasOverflowOk(el)) continue;

        const style = window.getComputedStyle(el);

        // Skip hidden/invisible elements
        if (style.display === 'none') continue;
        if (style.visibility === 'hidden') continue;
        const opacity = parseFloat(style.opacity);
        if (!isNaN(opacity) && opacity < 0.05) continue;

        const rect = el.getBoundingClientRect();

        // Skip zero-area elements
        if (rect.width === 0 || rect.height === 0) continue;

        // Check if rect extends beyond stage boundaries by more than margin
        const overflowLeft   = -(rect.left)             > margin;
        const overflowRight  =   rect.right  - vw       > margin;
        const overflowTop    = -(rect.top)              > margin;
        const overflowBottom =   rect.bottom - vh       > margin;

        if (overflowLeft || overflowRight || overflowTop || overflowBottom) {
          results.push({
            selector: buildSelector(el),
            rect: {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      }
      return results;
    },
    { vw: meta.width, vh: meta.height, margin: OVERFLOW_MARGIN },
  );

  for (const v of frameViolations) {
    violations.push({ t, selector: v.selector, rect: v.rect });
  }
}

await browser.close();

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const output = { violations };
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
process.exit(violations.length > 0 ? 1 : 0);
