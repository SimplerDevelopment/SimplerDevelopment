/**
 * capture.mjs — Playwright-driven screen-capture tool for sd-create-short.
 *
 * Records short, clean screen captures of product UI to use as embedded demo
 * footage in marketing videos. Reads a JSON "capture plan" authored by Claude,
 * drives Chromium, records a WebM, then converts to H.264 MP4.
 *
 * Usage:
 *   node capture.mjs --plan <plan.json> --out <clip.mp4> [--speed 1.0]
 *
 * Arguments:
 *   --plan <path>    Path to a JSON capture-plan file (see schema below).
 *   --out <path>     Destination MP4 file path (parent dirs created if needed).
 *   --speed <float>  Playback speed multiplier applied via ffmpeg setpts
 *                    (default 1.0). 1.5 makes the clip 1.5× faster.
 *
 * Capture plan JSON schema:
 * {
 *   "url": "http://localhost:3000/...",           // page to open
 *   "viewport": { "width": 1440, "height": 900 }, // browser viewport
 *   "colorScheme": "light",                        // "light" | "dark" (optional)
 *   "storageState": "/path/to/auth.json",          // optional Playwright storage state
 *   "hideSelectors": [".cookie-banner"],            // optional — hidden via CSS
 *   "settleMs": 800,                               // wait after load before acting
 *   "steps": [
 *     { "action": "click",  "selector": "..." },
 *     { "action": "type",   "selector": "...", "text": "...", "delayMs": 60 },
 *     { "action": "hover",  "selector": "..." },
 *     { "action": "scroll", "y": 400, "smooth": true },
 *     { "action": "press",  "key": "Enter" },
 *     { "action": "wait",   "ms": 1200 },
 *     { "action": "goto",   "url": "..." }
 *   ],
 *   "tailMs": 800                                  // linger after last step
 * }
 *
 * Output:
 *   Prints one JSON line on success:
 *   { "clip": <path>, "durationSec": N, "sizeBytes": N, "width": N, "height": N }
 *   Exits non-zero + writes error to stderr on failure.
 *
 * Requirements:
 *   - playwright in local node_modules (chromium binaries installed)
 *   - ffmpeg + ffprobe on PATH
 */

import { chromium } from 'playwright';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import os from 'os';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const { values: args } = parseArgs({
  options: {
    plan:  { type: 'string' },
    out:   { type: 'string' },
    speed: { type: 'string' },
  },
  strict: true,
});

if (!args.plan || !args.out) {
  process.stderr.write(
    'Usage: node capture.mjs --plan <plan.json> --out <clip.mp4> [--speed 1.0]\n'
  );
  process.exit(1);
}

const planPath  = path.resolve(args.plan);
const outPath   = path.resolve(args.out);
const speed     = parseFloat(args.speed ?? '1.0');

if (!existsSync(planPath)) {
  process.stderr.write(`Error: plan file not found: ${planPath}\n`);
  process.exit(1);
}

if (isNaN(speed) || speed <= 0) {
  process.stderr.write(`Error: --speed must be a positive number\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load & validate plan
// ---------------------------------------------------------------------------
let plan;
try {
  const raw = (await import(`${planPath}`, { assert: { type: 'json' } })).default;
  plan = raw;
} catch (_) {
  // Fallback for environments that don't support JSON import assertions
  const { readFileSync } = await import('fs');
  plan = JSON.parse(readFileSync(planPath, 'utf8'));
}

if (!plan.url) {
  process.stderr.write('Error: plan.url is required\n');
  process.exit(1);
}

const viewport    = plan.viewport    ?? { width: 1440, height: 900 };
const settleMs    = plan.settleMs    ?? 800;
const tailMs      = plan.tailMs      ?? 800;
const steps       = plan.steps       ?? [];
const hideSelectors = plan.hideSelectors ?? [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sleep for `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Natural inter-step pause — slight jitter so it looks human. */
function naturalPause() {
  return sleep(280 + Math.random() * 80);
}

/**
 * Move the mouse to an element's center in 2-3 steps for realism,
 * then return the bounding box.
 */
async function moveToElement(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`Element not found or not visible: ${selector}`);

  const targetX = box.x + box.width  / 2;
  const targetY = box.y + box.height / 2;

  // Current mouse position unknown — use a midpoint approach with 2 hops
  const currentX = targetX - 80 + Math.random() * 160;
  const currentY = targetY - 60 + Math.random() * 120;

  await page.mouse.move(currentX, currentY);
  await sleep(60 + Math.random() * 40);
  await page.mouse.move(
    targetX - 5 + Math.random() * 10,
    targetY - 5 + Math.random() * 10,
    { steps: 8 }
  );
  await sleep(40 + Math.random() * 30);
  await page.mouse.move(targetX, targetY, { steps: 3 });

  return { x: targetX, y: targetY };
}

/**
 * Execute a single capture step.
 */
async function runStep(page, step) {
  switch (step.action) {

    case 'click': {
      await moveToElement(page, step.selector);
      await page.locator(step.selector).first().click();
      break;
    }

    case 'hover': {
      await moveToElement(page, step.selector);
      break;
    }

    case 'type': {
      await moveToElement(page, step.selector);
      await page.locator(step.selector).first().click();
      const delay = step.delayMs ?? 60;
      for (const char of step.text ?? '') {
        await page.keyboard.type(char);
        await sleep(delay * 0.7 + Math.random() * delay * 0.6);
      }
      break;
    }

    case 'press': {
      await page.keyboard.press(step.key);
      break;
    }

    case 'scroll': {
      const targetY = step.y ?? 0;
      if (step.smooth) {
        await page.evaluate((y) => {
          window.scrollTo({ top: y, behavior: 'smooth' });
        }, targetY);
        // Wait for smooth scroll to settle (~400-700ms typical)
        await sleep(600 + Math.random() * 150);
      } else {
        await page.evaluate((y) => window.scrollTo(0, y), targetY);
        await sleep(100);
      }
      break;
    }

    case 'wait': {
      await sleep(step.ms ?? 500);
      break;
    }

    case 'goto': {
      await page.goto(step.url, { waitUntil: 'domcontentloaded' });
      await sleep(settleMs);
      break;
    }

    default:
      throw new Error(`Unknown step action: "${step.action}"`);
  }
}

// ---------------------------------------------------------------------------
// Main capture loop
// ---------------------------------------------------------------------------

// Temp dir for WebM output
const tmpDir = path.join(os.tmpdir(), `sd-capture-${Date.now()}`);
mkdirSync(tmpDir, { recursive: true });

// Ensure output directory exists
mkdirSync(path.dirname(outPath), { recursive: true });

let browser;
try {
  browser = await chromium.launch({ headless: true });

  const contextOptions = {
    viewport,
    colorScheme:  plan.colorScheme ?? 'light',
    recordVideo: {
      dir:  tmpDir,
      size: { width: viewport.width, height: viewport.height },
    },
  };

  if (plan.storageState) {
    contextOptions.storageState = plan.storageState;
  }

  const context = await browser.newContext(contextOptions);
  const page    = await context.newPage();

  // Navigate
  await page.goto(plan.url, { waitUntil: 'domcontentloaded' });

  // Hide selectors
  if (hideSelectors.length > 0) {
    await page.addStyleTag({
      content: hideSelectors.map((s) => `${s} { display: none !important; }`).join('\n'),
    });
  }

  // Settle
  await sleep(settleMs);

  // Execute steps
  for (const step of steps) {
    await runStep(page, step);
    await naturalPause();
  }

  // Tail linger
  await sleep(tailMs);

  // Close context to flush WebM
  await context.close();
  await browser.close();
  browser = null;

  // Find the recorded WebM
  const webmFiles = readdirSync(tmpDir).filter((f) => f.endsWith('.webm'));
  if (webmFiles.length === 0) {
    throw new Error(`No WebM file found in temp dir: ${tmpDir}`);
  }
  const webmPath = path.join(tmpDir, webmFiles[0]);

  // ---------------------------------------------------------------------------
  // Convert WebM → MP4 via ffmpeg
  // ---------------------------------------------------------------------------
  const ffmpegArgs = [
    '-y',
    '-i', webmPath,
  ];

  if (speed !== 1.0) {
    ffmpegArgs.push('-vf', `setpts=PTS/${speed}`);
  }

  ffmpegArgs.push(
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '20',
    '-an',
    outPath
  );

  const ffmpegResult = spawnSync('ffmpeg', ffmpegArgs, { encoding: 'utf8' });
  if (ffmpegResult.status !== 0) {
    throw new Error(`ffmpeg failed (exit ${ffmpegResult.status}):\n${ffmpegResult.stderr}`);
  }

  // ---------------------------------------------------------------------------
  // ffprobe the result and emit final JSON
  // ---------------------------------------------------------------------------
  const probeResult = spawnSync(
    'ffprobe',
    [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      outPath,
    ],
    { encoding: 'utf8' }
  );

  if (probeResult.status !== 0) {
    throw new Error(`ffprobe failed: ${probeResult.stderr}`);
  }

  const probe     = JSON.parse(probeResult.stdout);
  const videoStream = probe.streams?.find((s) => s.codec_type === 'video');
  const durationSec = parseFloat(probe.format?.duration ?? '0');
  const sizeBytes   = statSync(outPath).size;
  const width       = videoStream?.width  ?? viewport.width;
  const height      = videoStream?.height ?? viewport.height;

  process.stdout.write(
    JSON.stringify({ clip: outPath, durationSec, sizeBytes, width, height }) + '\n'
  );

} catch (err) {
  process.stderr.write(`Error: ${err.message}\n`);
  if (browser) {
    try { await browser.close(); } catch (_) { /* ignore */ }
  }
  process.exit(1);
}
