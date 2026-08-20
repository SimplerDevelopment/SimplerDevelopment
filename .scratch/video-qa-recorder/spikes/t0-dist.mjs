import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '.scratch/video-qa-recorder/spikes';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
const starts = [];
for (let i = 0; i < 6; i++) {
  const out = await page.evaluate(async (fps) => {
    document.body.innerHTML = '';
    const c = document.createElement('canvas');
    c.width = 900; c.height = 200; document.body.appendChild(c);
    const g = c.getContext('2d');
    let on = true;
    const paint = () => { if (!on) return;
      g.fillStyle = '#000'; g.fillRect(0,0,900,200);
      g.fillStyle = '#0f0'; g.font = 'bold 88px monospace';
      g.fillText(String(Date.now()), 15, 130);
      requestAnimationFrame(paint); };
    paint();
    const stream = c.captureStream(fps);
    await new Promise(r => setTimeout(r, 1200));
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    rec.ondataavailable = e => chunks.push(e.data);
    const tStart = Date.now();
    rec.start();
    await new Promise(r => setTimeout(r, 1200));
    await new Promise(r => { rec.onstop = r; rec.stop(); });
    on = false;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
    return { tStart, b64 };
  }, i < 3 ? 30 : 60);   // 3 runs at 30fps, 3 at 60fps — does frame interval bound the skew?
  fs.writeFileSync(`${dir}/d${i}.webm`, Buffer.from(out.b64, 'base64'));
  starts.push({ run: i, fps: i < 3 ? 30 : 60, tStart: out.tStart });
  console.log(`run ${i} (${i<3?30:60}fps) rec.start() at ${out.tStart}`);
}
fs.writeFileSync(`${dir}/starts.json`, JSON.stringify(starts, null, 2));
await browser.close();
