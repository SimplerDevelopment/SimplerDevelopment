// Verifies inline click-to-edit on the iframe-rendered html-render blocks.
// The expected flow per HtmlRenderBlockRender.tsx is:
//   1. Block becomes selected (one click on it).
//   2. Every [data-field] descendant gets contenteditable="true" + .sd-field-editable.
//   3. User clicks into a field → caret appears → typing fires BLOCK_CONTENT_UPDATED.
//
// We drive this directly and report which step (if any) is failing.

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const SITE_ID = 247;
const POST_ID = 705;
const USER_ID = 231;

async function run() {
  const browser = await chromium.launch();
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

  await page.goto(`http://localhost:3000/portal/websites/${SITE_ID}/posts/${POST_ID}/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  const ifr = await page.$('iframe');
  const frame = ifr ? await ifr.contentFrame() : null;
  if (!frame) { console.log('NO IFRAME'); await browser.close(); return; }

  // [0] Are we in editor mode at all? Does sd-field-editable-css exist? Does
  //     the EditableBlockRenderer's wrapper apparatus exist?
  const editorState = await frame.evaluate(() => {
    return {
      url: location.href,
      hasEditCss: !!document.getElementById('sd-field-editable-css'),
      selectableBlocks: document.querySelectorAll('[data-block-wrapper], [data-selectable-block]').length,
      anyDataField: document.querySelectorAll('[data-field]').length,
      anyDataFieldEditable: document.querySelectorAll('[data-field][contenteditable="true"]').length,
      anyFieldImage: document.querySelectorAll('[data-field-image]').length,
      hasPostMessageListener: typeof (window as { __mcInit?: boolean }).__mcInit !== 'undefined',
    };
  });
  console.log('[0] editor state:', editorState);

  // [1] BEFORE selecting the block — are data-fields contenteditable?
  const beforeSelect = await frame.evaluate(() => {
    const f = document.querySelector('[data-field="headingHtml"]') as HTMLElement | null;
    return {
      found: !!f,
      contenteditable: f?.getAttribute('contenteditable') || null,
      classes: f?.className || null,
    };
  });
  console.log('[1] BEFORE selecting hero block:', beforeSelect);

  // [2] Click the hero block in the iframe to select it
  console.log('\n[2] clicking the hero block in the iframe…');
  const heroBox = await frame.evaluate(() => {
    const h = document.querySelector('[data-block-id="mc-home-hero"]') as HTMLElement | null;
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { x: r.left + 100, y: r.top + 100 };
  });
  if (heroBox) {
    // The iframe is scaled — use the frame click instead of page mouse
    await frame.locator('[data-block-id="mc-home-hero"]').first().click({ position: { x: 100, y: 50 } });
    await page.waitForTimeout(800);
  }

  // [3] AFTER selecting — recheck
  const afterSelect = await frame.evaluate(() => {
    const f = document.querySelector('[data-field="headingHtml"]') as HTMLElement | null;
    return {
      found: !!f,
      contenteditable: f?.getAttribute('contenteditable') || null,
      classes: f?.className || null,
    };
  });
  console.log('[3] AFTER selecting hero block:', afterSelect);

  // [4] Try clicking directly INTO the heading
  console.log('\n[4] clicking directly into [data-field="headingHtml"]…');
  try {
    await frame.locator('[data-field="headingHtml"]').first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    const after2 = await frame.evaluate(() => {
      const f = document.querySelector('[data-field="headingHtml"]') as HTMLElement | null;
      return {
        contenteditable: f?.getAttribute('contenteditable') || null,
        classes: f?.className || null,
        focused: document.activeElement === f,
        activeElementTag: document.activeElement?.tagName,
        activeElementField: (document.activeElement as HTMLElement)?.dataset?.field,
      };
    });
    console.log('    after click:', after2);
  } catch (e) {
    console.log('    click failed:', (e as Error).message);
  }

  // [5] List all elements covering the heading element via elementFromPoint
  const stack = await frame.evaluate(() => {
    const f = document.querySelector('[data-field="headingHtml"]') as HTMLElement | null;
    if (!f) return null;
    const r = f.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const els = (document as Document & { elementsFromPoint?: (x: number, y: number) => Element[] }).elementsFromPoint?.(x, y) || [];
    return els.slice(0, 8).map((el) => ({
      tag: el.tagName,
      cls: el.className && typeof el.className === 'string' ? el.className.slice(0, 60) : '',
      pe: getComputedStyle(el as HTMLElement).pointerEvents,
    }));
  });
  console.log('\n[5] elementsFromPoint at heading center (topmost first):');
  for (const e of stack || []) console.log(`    ${e.tag.padEnd(8)} pe=${e.pe.padEnd(7)} ${e.cls}`);

  // [6] Take a screenshot
  await page.screenshot({ path: '/tmp/click-edit.png', fullPage: false });
  console.log('\nshot → /tmp/click-edit.png');
  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
