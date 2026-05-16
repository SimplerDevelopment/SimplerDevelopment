// Records a real edit session and reports exactly what causes flicker.
//
// Setup: open the editor, select the hero block, install a MutationObserver
// inside the iframe that counts every subtree replacement on the hero block,
// then drive three classic edit operations:
//   1. Sidebar text field — type 6 chars into the "Lead paragraph" input
//   2. Inline contenteditable — type 6 chars directly into the rendered hero
//   3. Image picker swap (TODO if quick)
//
// For each, we report: events count, total replaced nodes, total bytes
// replaced, and elapsed time. With that we can pick the right fix.

import { chromium, type Page, type Frame } from 'playwright';
import { encode } from '@auth/core/jwt';

const SITE_ID = 247;
const POST_ID = 705;
const USER_ID = 231;
const HERO_FIELD_NAME = 'lede'; // matches the field schema in pages/home.ts

async function installInstrumentation(frame: Frame) {
  await frame.evaluate(() => {
    interface MutLog { childListAdds: number; childListRemoves: number; charDataMuts: number; attrMuts: number; bytesAdded: number; ts: number[] }
    const w = window as unknown as { __mutLog?: MutLog; __mutObserver?: MutationObserver };
    w.__mutLog = { childListAdds: 0, childListRemoves: 0, charDataMuts: 0, attrMuts: 0, bytesAdded: 0, ts: [] };
    const hero = document.querySelector('[data-block-id="mc-home-hero"]');
    if (!hero) return;
    w.__mutObserver?.disconnect();
    const mo = new MutationObserver((muts) => {
      const log = w.__mutLog!;
      for (const m of muts) {
        if (m.type === 'childList') {
          log.childListAdds += m.addedNodes.length;
          log.childListRemoves += m.removedNodes.length;
          for (const n of Array.from(m.addedNodes)) {
            const html = (n as HTMLElement).outerHTML;
            if (html) log.bytesAdded += html.length;
          }
        } else if (m.type === 'characterData') {
          log.charDataMuts += 1;
        } else if (m.type === 'attributes') {
          log.attrMuts += 1;
        }
      }
      log.ts.push(Date.now());
    });
    mo.observe(hero, { childList: true, subtree: true, characterData: true, attributes: true });
    w.__mutObserver = mo;
  });
}

async function resetLog(frame: Frame) {
  await frame.evaluate(() => {
    const w = window as unknown as { __mutLog: { childListAdds: number; childListRemoves: number; charDataMuts: number; attrMuts: number; bytesAdded: number; ts: number[] } };
    w.__mutLog = { childListAdds: 0, childListRemoves: 0, charDataMuts: 0, attrMuts: 0, bytesAdded: 0, ts: [] };
  });
}

async function readLog(frame: Frame) {
  return frame.evaluate(() => {
    const w = window as unknown as { __mutLog: { childListAdds: number; childListRemoves: number; charDataMuts: number; attrMuts: number; bytesAdded: number; ts: number[] } };
    const l = w.__mutLog;
    return { ...l, bursts: l.ts.length, firstAt: l.ts[0], lastAt: l.ts[l.ts.length - 1] };
  });
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await ctx.newPage();

  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET missing');
  const token = await encode({
    token: { sub: String(USER_ID), id: String(USER_ID), email: 'sd@example.com', name: 'SD Admin' },
    secret,
    salt: 'authjs.session-token',
  });
  await ctx.addCookies([
    { name: 'authjs.session-token', value: token, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' },
  ]);

  await page.goto(`http://localhost:3000/portal/websites/${SITE_ID}/posts/${POST_ID}/edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const ifr = await page.$('iframe');
  const frame = ifr ? await ifr.contentFrame() : null;
  if (!frame) { console.log('no iframe'); await browser.close(); return; }

  console.log('iframe ready, installing instrumentation…');
  await installInstrumentation(frame);

  // ── SCENARIO 1: select the hero block, then sidebar field edit ───────────
  console.log('\n[1] selecting hero block via layers panel');
  await page.locator('text=Hero — headline').first().click();
  await page.waitForTimeout(1500);

  // Dump every input/textarea visible in the right panel so we can pick one
  await page.screenshot({ path: '/tmp/editor-with-hero-selected.png', fullPage: false });
  const sidebarInputs = await page.evaluate(() => {
    const rightSide = document.body.getBoundingClientRect();
    const els = Array.from(document.querySelectorAll('input, textarea')) as HTMLElement[];
    return els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > rightSide.width - 500 && r.width > 50 && r.height > 10;
      })
      .map((el) => ({
        tag: el.tagName,
        name: (el as HTMLInputElement).name || '',
        id: el.id || '',
        placeholder: (el as HTMLInputElement).placeholder || '',
        value: ((el as HTMLInputElement).value || '').slice(0, 60),
        ariaLabel: el.getAttribute('aria-label') || '',
      }))
      .slice(0, 20);
  });
  console.log('  right-panel inputs found:', sidebarInputs.length);
  for (const i of sidebarInputs) console.log('    ', JSON.stringify(i));

  // Try by placeholder/value containing our default lede text
  const ledeInput = page.locator('textarea').filter({ hasText: /neighborhood cheese factory/i }).first();
  const hasLede = await ledeInput.count();
  console.log('  lede input count:', hasLede);
  if (hasLede > 0) {
    await resetLog(frame);
    const t0 = Date.now();
    await ledeInput.focus();
    for (const ch of ' EDIT!') {
      await ledeInput.press(ch === ' ' ? 'Space' : ch);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(600);
    const log = await readLog(frame);
    console.log('  sidebar typing (6 chars):', JSON.stringify(log, null, 2), `  ${Date.now() - t0}ms`);
  } else {
    console.log('  (skipped — could not find lede input in sidebar)');
  }

  // ── SCENARIO 2: inline contenteditable typing in the iframe ──────────────
  console.log('\n[2] inline contenteditable typing on hero headline');
  await resetLog(frame);
  // Click into the [data-field="headingHtml"] element inside the iframe
  const t1 = Date.now();
  await frame.evaluate(() => {
    const el = document.querySelector('[data-field="headingHtml"]') as HTMLElement | null;
    if (!el) return;
    el.focus();
    // Place caret at end
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  });
  await frame.locator('[data-field="headingHtml"]').first().pressSequentially(' YAY!', { delay: 80 });
  await page.waitForTimeout(800);
  const log2 = await readLog(frame);
  console.log('  inline typing (5 chars):', JSON.stringify(log2, null, 2), `  ${Date.now() - t1}ms`);

  // ── SCENARIO 3: selecting another block then back to hero ────────────────
  console.log('\n[3] cycling block selection across all 8 sections');
  await resetLog(frame);
  const layers = ['Hero', 'Marquee', 'Storefront', 'Story teaser', 'Inside the shop', 'Signature cheeses', 'Sandwich highlight', 'Visit CTA'];
  for (const name of layers) {
    await page.locator(`text=${name}`).first().click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(500);
  const log3 = await readLog(frame);
  console.log('  selection cycling:', JSON.stringify(log3, null, 2));

  // ── SCENARIO 4: simulate a values-change directly (mimics image picker) ─
  console.log('\n[4] simulating an image-picker change via BLOCK_CONTENT_UPDATED postMessage');
  await resetLog(frame);
  await page.evaluate(() => {
    // The parent's useEditorMode handler responds to BLOCK_CONTENT_UPDATED
    // by writing into block.values; this then triggers BLOCKS_UPDATE back
    // to the iframe. We forge that exact event to measure the iframe response.
    window.postMessage({ type: 'BLOCK_CONTENT_UPDATED', blockId: 'mc-home-hero', field: 'heroImage', value: '/mancuso/002.jpg' }, '*');
  });
  await page.waitForTimeout(800);
  const log4 = await readLog(frame);
  console.log('  image swap simulation:', JSON.stringify(log4, null, 2));

  // ── SCENARIO 5: idle 5s ──────────────────────────────────────────────────
  console.log('\n[5] idle 5s');
  await resetLog(frame);
  await page.waitForTimeout(5000);
  const log5 = await readLog(frame);
  console.log('  idle:', JSON.stringify(log5, null, 2));

  await browser.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
