import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch();   // new headless supports canvas.captureStream
const page = await browser.newPage();
await page.goto('about:blank');

const out = await page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 220; document.body.appendChild(c);
  const g = c.getContext('2d');
  let painting = true;
  const paint = () => {
    if (!painting) return;
    g.fillStyle = '#000'; g.fillRect(0, 0, 900, 220);
    g.fillStyle = '#0f0'; g.font = 'bold 90px monospace';
    g.fillText(String(Date.now()), 20, 130);          // full epoch ms, drawn every frame
    requestAnimationFrame(paint);
  };
  paint();

  const stream = c.captureStream(30);
  // let the canvas produce frames for a while BEFORE start(), so pre-start data exists to leak in
  await new Promise(r => setTimeout(r, 1500));

  const chunks = [], timecodes = [];
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  rec.ondataavailable = e => { chunks.push(e.data); timecodes.push(e.timecode); };

  const tStart = Date.now();
  rec.start();
  const tAfterStartCall = Date.now();

  await new Promise(r => setTimeout(r, 2000));
  await new Promise(r => { rec.onstop = r; rec.stop(); });
  painting = false;

  const blob = new Blob(chunks, { type: 'video/webm' });
  const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
  return { tStart, tAfterStartCall, timecodes, bytes: blob.size, b64 };
});

const dir = '.scratch/video-qa-recorder/spikes';
fs.writeFileSync(`${dir}/t0.webm`, Buffer.from(out.b64, 'base64'));
console.log('Date.now() immediately BEFORE rec.start() :', out.tStart);
console.log('Date.now() immediately AFTER  rec.start() :', out.tAfterStartCall);
console.log('BlobEvent.timecode values                 :', JSON.stringify(out.timecodes));
console.log('webm bytes                                :', out.bytes);
await browser.close();
