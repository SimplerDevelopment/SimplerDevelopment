/**
 * render.mjs — Frame-accurate headless renderer for sd-create-short compositions.
 *
 * Usage:
 *   node render.mjs --html <composition.html> --out <dir> [--audio <wav-or-mp3>] [--fps-override N]
 *
 * Arguments:
 *   --html <path>        Path to a contract-compliant composition HTML file.
 *   --out <dir>          Output directory. Will be created if it does not exist.
 *                        Frames are written to <dir>/frames/frame_NNNNN.png.
 *                        Final video is written to <dir>/short.mp4.
 *   --audio <path>       Optional WAV or MP3 audio file to mux into the output.
 *   --fps-override N     Override the fps declared in the composition's meta block.
 *
 * Exit codes:
 *   0  — success; prints one JSON line: { "mp4", "sizeBytes", "durationSec", "frames" }
 *   1  — failure; message written to stderr
 *
 * Requirements:
 *   - Playwright chromium binaries installed (via repo's e2e playwright install).
 *   - ffmpeg on PATH (typically /usr/local/bin/ffmpeg on macOS).
 *   - The composition's gsap.min.js must live alongside the HTML file.
 */

import { chromium } from 'playwright';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { parseArgs } from 'util';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const { values: args } = parseArgs({
  options: {
    html: { type: 'string' },
    out: { type: 'string' },
    audio: { type: 'string' },
    'fps-override': { type: 'string' },
  },
  strict: true,
});

if (!args.html || !args.out) {
  process.stderr.write('Usage: node render.mjs --html <composition.html> --out <dir> [--audio <wav-or-mp3>] [--fps-override N]\n');
  process.exit(1);
}

const htmlPath = path.resolve(args.html);
const outDir = path.resolve(args.out);
const audioPath = args.audio ? path.resolve(args.audio) : null;

if (!existsSync(htmlPath)) {
  process.stderr.write(`Error: HTML file not found: ${htmlPath}\n`);
  process.exit(1);
}

if (audioPath && !existsSync(audioPath)) {
  process.stderr.write(`Error: Audio file not found: ${audioPath}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Setup output directories
// ---------------------------------------------------------------------------
const framesDir = path.join(outDir, 'frames');
mkdirSync(framesDir, { recursive: true });

// ---------------------------------------------------------------------------
// Launch browser and load composition
// ---------------------------------------------------------------------------
let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (err) {
  process.stderr.write(`Error launching Playwright chromium: ${err.message}\n`);
  process.exit(1);
}

const page = await browser.newPage();

// Disable animations/transitions from CSS so only GSAP timeline drives frames
await page.addInitScript(() => {
  // Ensure requestAnimationFrame resolves quickly in headless context
});

const fileUrl = pathToFileURL(htmlPath).toString();

try {
  await page.goto(fileUrl, { waitUntil: 'load' });
} catch (err) {
  await browser.close();
  process.stderr.write(`Error navigating to composition: ${err.message}\n`);
  process.exit(1);
}

// Wait for window.__short.ready
try {
  await page.waitForFunction(() => window.__short && window.__short.ready instanceof Promise, { timeout: 30000 });
  await page.evaluate(() => window.__short.ready);
} catch (err) {
  await browser.close();
  process.stderr.write(`Error: composition did not expose window.__short.ready in time: ${err.message}\n`);
  process.exit(1);
}

// Read composition metadata
const meta = await page.evaluate(() => ({
  width: window.__short.width,
  height: window.__short.height,
  fps: window.__short.fps,
  duration: window.__short.duration,
}));

const fps = args['fps-override'] ? parseInt(args['fps-override'], 10) : meta.fps;
const { width, height, duration } = meta;

if (!Number.isFinite(fps) || fps <= 0) {
  await browser.close();
  process.stderr.write(`Error: invalid fps value: ${fps}\n`);
  process.exit(1);
}

// Set viewport to exactly composition dimensions
await page.setViewportSize({ width, height });

// Allow a small settle after viewport resize
await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// ---------------------------------------------------------------------------
// Frame capture loop
// ---------------------------------------------------------------------------
const totalFrames = Math.ceil(duration * fps);
process.stderr.write(`Rendering ${totalFrames} frames at ${fps}fps (${width}x${height}, ${duration}s)...\n`);

for (let i = 0; i < totalFrames; i++) {
  const t = i / fps;

  // Seek the master timeline to time t (seek may return a Promise for demo scenes with video)
  await page.evaluate((seekTime) => Promise.resolve(window.__short.seek(seekTime)), t);

  // Wait one rAF tick so GSAP can apply the new state to the DOM
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));

  const framePath = path.join(framesDir, `frame_${String(i).padStart(5, '0')}.png`);
  await page.screenshot({ path: framePath, clip: { x: 0, y: 0, width, height } });

  if (i % 30 === 0) {
    process.stderr.write(`  frame ${i}/${totalFrames}\n`);
  }
}

await browser.close();
process.stderr.write('Frame capture complete. Assembling video...\n');

// ---------------------------------------------------------------------------
// Assemble with ffmpeg
// ---------------------------------------------------------------------------
const mp4Path = path.join(outDir, 'short.mp4');
const ffmpegArgs = [
  '-y',
  '-framerate', String(fps),
  '-i', path.join(framesDir, 'frame_%05d.png'),
];

if (audioPath) {
  ffmpegArgs.push('-i', audioPath);
}

ffmpegArgs.push(
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-crf', '20',
);

if (audioPath) {
  ffmpegArgs.push('-c:a', 'aac', '-shortest');
}

ffmpegArgs.push(mp4Path);

const ffmpegResult = spawnSync('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

if (ffmpegResult.status !== 0) {
  const errOutput = ffmpegResult.stderr?.toString() ?? '';
  process.stderr.write(`ffmpeg failed (exit ${ffmpegResult.status}):\n${errOutput}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Final output
// ---------------------------------------------------------------------------
const sizeBytes = statSync(mp4Path).size;
const result = {
  mp4: mp4Path,
  sizeBytes,
  durationSec: duration,
  frames: totalFrames,
};

process.stdout.write(JSON.stringify(result) + '\n');
