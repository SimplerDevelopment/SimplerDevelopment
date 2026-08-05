/* Narration transport check for /agile-after-ai.
 *
 * Drives the built artifact against stub clips and asserts the contract:
 * nothing plays unprompted, auto advances, mute persists, nav moves.
 *
 *   python3 docs/marketing/agile-after-ai/build.py   # first
 *   node docs/marketing/agile-after-ai/check.mjs
 *
 * It stubs every clip so it tests the transport whether or not the real
 * narration is wired up yet, and serves the page itself — nothing to set up.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, extname } from 'node:path';

const DIR = 'public/agile-after-ai';
const PORT = 8791;
const OUT = process.argv[2] || '/tmp/narr';
const SLIDES = ['hero', 'question', 'diverge', 'contract', 'ladder', 'forecast', 'effort', 'counter', 'pillars'];

/* A silent 8kHz mono WAV, written by hand so the check needs no ffmpeg, no
   `say`, and no committed fixture. We assert on playback events, not sound.
   Long enough that a clip cannot end in the middle of the pause assertion. */
function silentWav(seconds = 6, rate = 8000) {
  const samples = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40);
  return buf;
}

const stubs = [join(DIR, '_stub.wav'), join(DIR, '_test.html')];
await writeFile(stubs[0], silentWav());
const built = await readFile(join(DIR, 'index.html'), 'utf8');
const stubbed = built.replace(
  new RegExp(`"(${SLIDES.join('|')})":\\s*null`, 'g'), '"$1": "_stub.wav"',
);
assert.equal(
  (stubbed.match(/_stub\.wav/g) || []).length + (built.match(/"https?:[^"]*"/g) || []).length >= SLIDES.length,
  true, 'every slide needs a manifest entry to stub',
);
await writeFile(stubs[1], stubbed);

const MIME = { '.html': 'text/html', '.wav': 'audio/wav', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const file = join(DIR, decodeURIComponent(req.url.split('?')[0]).replace(/^\/agile-after-ai/, ''));
  res.setHeader('content-type', MIME[extname(file)] || 'application/octet-stream');
  createReadStream(file).on('error', () => { res.statusCode = 404; res.end(); }).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const URL = `http://localhost:${PORT}/agile-after-ai/_test.html`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('.narrator');

const state = () => page.evaluate(() => {
  const a = document.querySelector('audio');
  const bar = document.querySelector('.narrator');
  const btn = (r) => bar.querySelector(`button[data-role="${r}"]`);
  return {
    readout: bar.querySelector('.narrator__now').textContent,
    playing: !!a && !a.paused && !a.ended,
    muted: !!a && a.muted,
    src: a ? a.currentSrc.split('/').pop() : null,
    pressed: { play: btn('play')?.getAttribute('aria-pressed'), mute: btn('mute')?.getAttribute('aria-pressed'), auto: btn('auto')?.getAttribute('aria-pressed') },
    disabled: { prev: btn('prev').disabled, next: btn('next').disabled },
    scrollY: Math.round(scrollY),
  };
});

/* 1. nothing plays on load, and nothing plays from scrolling alone */
let s = await state();
assert.equal(s.playing, false, 'must not autoplay on load');
assert.equal(s.readout, '01 / 09Opening');
assert.equal(s.disabled.prev, true, 'prev disabled on first slide');
await page.mouse.wheel(0, 4000);
await page.waitForTimeout(900);
s = await state();
assert.equal(s.playing, false, 'scrolling alone must not start sound');
console.log('✓ silent until asked  (after scroll: %s)', s.readout.trim());

/* 2. a per-section listen button plays that section and jumps to it */
await page.locator('.act[data-scene="ladder"] .listen').click();
await page.waitForTimeout(700);
s = await state();
assert.equal(s.playing, true, 'listen button must start playback');
assert.match(s.readout, /^05 \/ 09/, 'listen button jumps to its own section');
assert.equal(s.pressed.play, 'true');
console.log('✓ per-section listen  (%s)', s.readout.trim());

/* 3. transport play toggles to pause */
await page.locator('.narrator button[data-role="play"]').click();
await page.waitForTimeout(250);
assert.equal((await state()).playing, false, 'play button must pause when playing');
console.log('✓ play/pause toggle');

/* 4. next/prev move sections; a paused reader stays paused */
await page.locator('.narrator button[data-role="next"]').click();
await page.waitForTimeout(1200);
s = await state();
assert.match(s.readout, /^06 \/ 09/, 'next advances one section');
assert.equal(s.playing, false, 'nav while paused must not start sound');
await page.locator('.narrator button[data-role="prev"]').click();
await page.waitForTimeout(1200);
assert.match((await state()).readout, /^05 \/ 09/, 'prev goes back one section');
console.log('✓ next / prev');

/* 5. mute is a real mute and survives a reload */
await page.locator('.narrator button[data-role="mute"]').click();
s = await state();
assert.equal(s.pressed.mute, 'true');
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.narrator');
assert.equal((await state()).pressed.mute, 'true', 'mute must persist across reload');
assert.equal((await state()).playing, false, 'reload must not autoplay');
await page.locator('.narrator button[data-role="mute"]').click();   // back to audible
console.log('✓ mute persists, reload stays silent');

/* 6. auto plays the current slide and rolls into the next one when a clip ends */
await page.locator('.narrator button[data-role="auto"]').click();
await page.waitForTimeout(600);
s = await state();
assert.equal(s.pressed.auto, 'true');
assert.equal(s.playing, true, 'turning auto on starts the run');
const startedAt = s.readout.slice(0, 2);
await page.waitForFunction(
  (from) => document.querySelector('.narrator__idx').textContent.slice(0, 2) !== from,
  startedAt, { timeout: 20000 },
);
s = await state();
assert.equal(s.playing, true, 'auto keeps playing through the advance');
console.log('✓ auto-advance  (%s → %s)', startedAt, s.readout.trim());

/* 7. turning auto off stops the run */
await page.locator('.narrator button[data-role="auto"]').click();
await page.waitForTimeout(300);
assert.equal((await state()).playing, false, 'auto off must stop playback');
console.log('✓ auto off stops');

await page.screenshot({ path: `${OUT}-desktop.png` });
await page.setViewportSize({ width: 390, height: 780 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}-mobile.png` });

/* 8. reduced motion still gets a working transport */
const rm = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 820 } });
const p2 = await rm.newPage();
await p2.goto(URL, { waitUntil: 'load' });
await p2.waitForSelector('.narrator');
assert.equal(await p2.locator('.listen').count(), 9, 'listen buttons must survive reduced motion');
await p2.screenshot({ path: `${OUT}-reduced.png` });
console.log('✓ reduced-motion path intact');

assert.equal(errors.length, 0, 'console errors:\n' + errors.join('\n'));
await browser.close();
server.close();
await Promise.all(stubs.map((f) => unlink(f)));
console.log('\nALL CHECKS PASSED   (screenshots: %s-{desktop,mobile,reduced}.png)', OUT);
