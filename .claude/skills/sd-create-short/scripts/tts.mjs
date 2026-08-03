/**
 * tts.mjs — TTS narration generator for sd-create-short compositions.
 *
 * Usage:
 *   node tts.mjs --text <script.txt> --out <dir> [--voice af_heart] [--speed 1.0] [--warm] [--no-align]
 *
 * Arguments:
 *   --text <path>    Path to a plain-text file containing the narration script.
 *   --out <dir>      Output directory. Will be created if it does not exist.
 *   --voice <name>   Kokoro voice ID (default: af_heart).
 *                    Other options: af_sky, am_adam, bf_emma, bm_george, etc.
 *   --no-align       Skip word-level forced alignment (skip whisper step).
 *
 * Outputs:
 *   <dir>/narration.wav          — synthesized audio
 *   <dir>/words.json             — word timestamps (unless --no-align)
 *                                  shape: [{ "word": str, "start": num, "end": num }]
 *
 * Prints one final JSON line:
 *   { "wav": <path>, "words": <path|null>, "durationSec": <number> }
 *
 * Notes:
 *   - On first use, kokoro-js downloads the Kokoro model from HuggingFace (~300MB).
 *   - Forced alignment uses: uvx whisper-ctranslate2 (installed on first use via uv).
 *   - ONNX runtime (used by kokoro-js) requires Node.js >= 18; tested with Node 22.
 *
 * Exit codes:
 *   0  — success
 *   1  — failure; message written to stderr
 */

import { readFileSync, mkdirSync, writeFileSync, statSync, renameSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { parseArgs } from 'util';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const { values: args } = parseArgs({
  options: {
    text:      { type: 'string' },
    out:       { type: 'string' },
    voice:     { type: 'string', default: 'af_heart' },
    speed:     { type: 'string', default: '1.0' },
    warm:      { type: 'boolean', default: false },
    'no-align': { type: 'boolean', default: false },
  },
  strict: true,
});

if (!args.text || !args.out) {
  process.stderr.write('Usage: node tts.mjs --text <script.txt> --out <dir> [--voice af_heart] [--no-align]\n');
  process.exit(1);
}

const textPath = path.resolve(args.text);
const outDir = path.resolve(args.out);
const voice = args.voice ?? 'af_heart';
const speed = Number.parseFloat(args.speed ?? '1.0');
const warm = args.warm ?? false;
const noAlign = args['no-align'] ?? false;
if (!Number.isFinite(speed) || speed < 0.5 || speed > 1.5) {
  process.stderr.write('Error: --speed must be a number between 0.5 and 1.5\n');
  process.exit(1);
}

let scriptText;
try {
  scriptText = readFileSync(textPath, 'utf8').trim();
} catch (err) {
  process.stderr.write(`Error reading text file: ${err.message}\n`);
  process.exit(1);
}

if (!scriptText) {
  process.stderr.write('Error: script text file is empty\n');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// TTS with kokoro-js
// ---------------------------------------------------------------------------
process.stderr.write(`Generating TTS with voice "${voice}" via kokoro-js...\n`);
process.stderr.write('(First use: model download from HuggingFace ~300MB — this may take a few minutes)\n');

let KokoroTTS;
try {
  ({ KokoroTTS } = await import('kokoro-js'));
} catch (err) {
  process.stderr.write(`Error importing kokoro-js: ${err.message}\n`);
  process.stderr.write('Run: bun install (inside the scripts/ directory)\n');
  process.exit(1);
}

let tts;
try {
  tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
  });
} catch (err) {
  process.stderr.write(`Error initializing KokoroTTS: ${err.message}\n`);
  process.exit(1);
}

let audio;
try {
  audio = await tts.generate(scriptText, { voice, speed });
} catch (err) {
  process.stderr.write(`Error generating TTS audio: ${err.message}\n`);
  process.exit(1);
}

const wavPath = path.join(outDir, 'narration.wav');
try {
  await audio.save(wavPath);
} catch (err) {
  process.stderr.write(`Error saving WAV file: ${err.message}\n`);
  process.exit(1);
}

process.stderr.write(`Saved: ${wavPath}\n`);

// ---------------------------------------------------------------------------
// Optional "warm" EQ pass — gentle low-shelf lift, soft top end, light
// compression. Makes the synthetic voice rounder and friendlier.
// ---------------------------------------------------------------------------
if (warm) {
  process.stderr.write('Applying warm EQ pass (ffmpeg)...\n');
  const warmPath = path.join(outDir, 'narration-warm.wav');
  const eq = spawnSync('ffmpeg', [
    '-y', '-i', wavPath,
    '-af',
    'lowshelf=g=3:f=150,highshelf=g=-2.5:f=7500,acompressor=threshold=-18dB:ratio=2.5:attack=15:release=200:makeup=2',
    warmPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (eq.status !== 0) {
    process.stderr.write(`Warning: warm EQ pass failed (exit ${eq.status}); keeping the dry narration.\n${eq.stderr?.toString() ?? ''}\n`);
  } else {
    renameSync(warmPath, wavPath);
  }
}

// ---------------------------------------------------------------------------
// Forced alignment with whisper-ctranslate2 (via uvx)
// ---------------------------------------------------------------------------
let wordsPath = null;

if (!noAlign) {
  process.stderr.write('Running forced alignment via uvx whisper-ctranslate2...\n');

  const whisperResult = spawnSync(
    'uvx',
    [
      // onnxruntime dropped macOS x86_64 wheels after 1.19.x and 1.19.2 has no
      // cp313+ wheels — pin both so resolution works on Intel Macs.
      '--python', '3.12',
      '--with', 'onnxruntime==1.19.2',
      'whisper-ctranslate2',
      wavPath,
      '--word_timestamps', 'True',
      '--output_format', 'json',
      '--output_dir', outDir,
      '--model', 'small',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  if (whisperResult.status !== 0) {
    const errOut = whisperResult.stderr?.toString() ?? '';
    process.stderr.write(`Warning: whisper alignment failed (exit ${whisperResult.status}):\n${errOut}\n`);
    process.stderr.write('Continuing without word timestamps.\n');
  } else {
    // whisper-ctranslate2 writes <basename>.json into the output dir
    const whisperJsonPath = path.join(outDir, 'narration.json');

    let rawJson;
    try {
      rawJson = JSON.parse(readFileSync(whisperJsonPath, 'utf8'));
    } catch (err) {
      process.stderr.write(`Warning: could not read whisper JSON output: ${err.message}\n`);
      rawJson = null;
    }

    if (rawJson) {
      // Normalize: flatten segments → words
      const words = [];
      const segments = rawJson.segments ?? [];
      for (const seg of segments) {
        const wordEntries = seg.words ?? [];
        for (const w of wordEntries) {
          words.push({
            word: w.word ?? w.text ?? '',
            start: w.start ?? 0,
            end: w.end ?? 0,
          });
        }
      }

      wordsPath = path.join(outDir, 'words.json');
      writeFileSync(wordsPath, JSON.stringify(words, null, 2));
      process.stderr.write(`Saved: ${wordsPath} (${words.length} words)\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// Measure duration via ffprobe
// ---------------------------------------------------------------------------
let durationSec = 0;
const probeResult = spawnSync(
  'ffprobe',
  ['-v', 'quiet', '-print_format', 'json', '-show_streams', wavPath],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

if (probeResult.status === 0) {
  try {
    const probeData = JSON.parse(probeResult.stdout.toString());
    durationSec = parseFloat(probeData.streams?.[0]?.duration ?? '0');
  } catch {
    // ignore parse errors; durationSec stays 0
  }
}

// ---------------------------------------------------------------------------
// Final output
// ---------------------------------------------------------------------------
const result = {
  wav: wavPath,
  words: wordsPath,
  durationSec,
};
process.stdout.write(JSON.stringify(result) + '\n');
