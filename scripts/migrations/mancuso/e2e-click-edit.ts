// End-to-end click-to-edit test for html-render data-fields in the visual editor.
//
// Drives a real (headed) Chrome with full event instrumentation. For each of
// several data-field shapes (heading, paragraph, button label, captioned
// figure) we:
//   1. Verify contenteditable + pointer-events are set up
//   2. Perform a real mouse click at the field
//   3. Log the full event chain
//   4. Type text
//   5. Verify the text persisted
//   6. Screenshot
// Final report is a per-field pass/fail.

import { chromium, type Frame } from 'playwright';
import { encode } from '@auth/core/jwt';

const SITE_ID = 247;
const POST_ID = 705;
const USER_ID = 231;

interface Probe { field: string; selector: string; type: 'text' | 'rich' }
const PROBES: Probe[] = [
  { field: 'hero-since',         selector: '[data-field="sinceLabel"]',     type: 'text' },
  { field: 'hero-heading',       selector: 'h1[data-field="headingHtml"]',  type: 'rich' },
  { field: 'hero-lede',          selector: '[data-field="lede"]',           type: 'text' },
  { field: 'storefront-heading', selector: '[data-block-id="mc-home-storefront"] [data-field="heading"]', type: 'text' },
  { field: 'cheese-name-0',      selector: '[data-block-id="mc-home-signature-cheeses"] [data-repeat-item="cheeses:0"] [data-field="name"]', type: 'text' },
  { field: 'sandwich-heading',   selector: '[data-block-id="mc-home-sandwich-highlight"] [data-field="heading"]', type: 'text' },
];

interface Result { field: string; contenteditable: boolean; pointerEvents: string; clickFocused: boolean; typed: boolean; before: string; after: string; events: string[] }

async function installEventLogger(frame: Frame) {
  await frame.evaluate(() => {
    const w = window as unknown as { __ev?: string[] };
    w.__ev = [];
    const log = (e: Event) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName || '?';
      const field = t?.closest('[data-field]')?.getAttribute('data-field') || '';
      const ce = t?.isContentEditable ? 'CE' : '';
      w.__ev!.push(`${e.type}@${tag}${field ? `[${field}]` : ''}${ce ? `(${ce})` : ''}${(e as Event & { defaultPrevented?: boolean }).defaultPrevented ? ' DP' : ''}`);
    };
    for (const ev of ['mousedown', 'mouseup', 'click', 'focus', 'focusin', 'blur']) {
      document.addEventListener(ev, log, true);
    }
  });
}

async function probeField(page: import('playwright').Page, frame: Frame, p: Probe): Promise<Result> {
  // Reset event log
  await frame.evaluate(() => { (window as unknown as { __ev: string[] }).__ev = []; });

  const before = await frame.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false, contenteditable: false, pointerEvents: '', text: '' };
    return {
      found: true,
      contenteditable: (el as HTMLElement).isContentEditable,
      pointerEvents: getComputedStyle(el as HTMLElement).pointerEvents,
      text: (el.textContent || '').trim().slice(0, 60),
    };
  }, p.selector);

  if (!before.found) {
    return { field: p.field, contenteditable: false, pointerEvents: 'n/a', clickFocused: false, typed: false, before: '(not found)', after: '', events: [] };
  }

  // Real click via Playwright
  try {
    await frame.locator(p.selector).first().click({ position: { x: 8, y: 8 }, timeout: 4000 });
  } catch { /* ignore — we measure focus regardless */ }
  await page.waitForTimeout(500);

  const afterClick = await frame.evaluate((sel) => {
    const el = document.querySelector(sel);
    const active = document.activeElement;
    return {
      focused: active === el || (active && el?.contains(active)) || false,
      activeTag: active?.tagName || '',
      activeField: (active as HTMLElement | null)?.closest('[data-field]')?.getAttribute('data-field') || '',
    };
  }, p.selector);

  // Try typing
  await page.keyboard.type(' ✏');
  await page.waitForTimeout(500);

  const afterType = await frame.evaluate((sel) => {
    const el = document.querySelector(sel);
    return (el?.textContent || '').trim().slice(0, 60);
  }, p.selector);

  const events = await frame.evaluate(() => (window as unknown as { __ev: string[] }).__ev || []);

  return {
    field: p.field,
    contenteditable: before.contenteditable,
    pointerEvents: before.pointerEvents,
    clickFocused: Boolean(afterClick.focused),
    typed: afterType !== before.text,
    before: before.text,
    after: afterType,
    events: events.slice(0, 8),
  };
}

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET missing');
  const token = await encode({
    token: { sub: String(USER_ID), id: String(USER_ID), email: 'sd@example.com', name: 'SD Admin' },
    secret,
    salt: 'authjs.session-token',
  });
  await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);

  // Open editor — let it fully compile + hydrate
  await page.goto(`http://localhost:3000/portal/websites/${SITE_ID}/posts/${POST_ID}/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15000);

  const ifr = await page.$('iframe');
  if (!ifr) { console.log('NO IFRAME'); await browser.close(); return; }
  const frame = await ifr.contentFrame();
  if (!frame) { console.log('NO FRAME'); await browser.close(); return; }

  await installEventLogger(frame);

  const results: Result[] = [];
  for (const p of PROBES) {
    console.log(`\n→ ${p.field}`);
    const r = await probeField(page, frame, p);
    results.push(r);
    console.log(`  ce=${r.contenteditable} pe=${r.pointerEvents} clickFocus=${r.clickFocused} typed=${r.typed}`);
    console.log(`  before: "${r.before}"`);
    console.log(`  after:  "${r.after}"`);
    if (r.events.length) console.log(`  events: ${r.events.slice(0, 5).join(' | ')}`);
  }

  await page.screenshot({ path: '/tmp/e2e-editor.png', fullPage: false });
  console.log('\nshot → /tmp/e2e-editor.png');

  console.log('\n========================  RESULTS  ========================\n');
  let pass = 0;
  for (const r of results) {
    const ok = r.contenteditable && r.pointerEvents === 'auto' && r.typed;
    if (ok) pass++;
    const mark = ok ? '✓' : '✗';
    console.log(`${mark} ${r.field.padEnd(22)} ce=${r.contenteditable ? '✓' : '✗'} pe=${r.pointerEvents.padEnd(5)} focus=${r.clickFocused ? '✓' : '✗'} typed=${r.typed ? '✓' : '✗'}`);
  }
  console.log(`\n${pass}/${results.length} passed`);

  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
