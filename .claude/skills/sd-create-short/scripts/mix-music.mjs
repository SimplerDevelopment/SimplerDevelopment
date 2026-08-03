/**
 * mix-music.mjs — Mix background music into an sd-create-short MP4.
 *
 * Usage:
 *   node mix-music.mjs --video <in.mp4> (--mood <name> | --music <file>) [--gain <dB>] [--out <out.mp4>]
 *
 * Arguments:
 *   --video <path>   Input MP4 (required).
 *   --mood  <name>   One of: tech | ad | educational | educational-alt | tutorial | tutorial-alt
 *                    Resolves to bgm-<mood>.mp3 found in the first of:
 *                      1. $SD_SHORT_BGM_DIR
 *                      2. <repo>/.agents/skills/huashu-design/assets/  (found by walking up from this file)
 *                      3. ~/.claude/skills/huashu-design/assets/
 *   --music <file>   Absolute path to any audio file — bypasses mood lookup entirely.
 *   --gain  <dB>     Volume adjustment in dB applied to the music track (default: -19).
 *                    Use -19 when narration is present (music stays under VO).
 *                    Use -14 to -16 for no-VO shorts where music carries the feel.
 *   --out   <path>   Output MP4 path (default: <in-basename>-music.mp4 in same dir as input).
 *
 * Behavior:
 *   - Probes the input video with ffprobe (duration; whether it has an audio stream).
 *   - Loops the music track with -stream_loop -1 so short BGM files never run out.
 *   - Applies gain, 1 s fade-in, 2 s fade-out ending exactly at video duration, then trims to duration.
 *   - If the video HAS narration: mixes original audio + music via amix (normalize=0).
 *     Output: -c:a aac -b:a 192k.
 *   - If the video has NO audio: music chain becomes the sole audio track (-shortest).
 *   - Video stream is always copied (-c:v copy — never re-encoded).
 *
 * Exit:
 *   0  — success; prints one JSON line:
 *          { "out": <path>, "sizeBytes": <n>, "mood": <name|null>, "music": <resolved-path>, "hadNarration": <bool> }
 *   1  — failure; message written to stderr.
 */

import { spawnSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const { values: args } = parseArgs({
  options: {
    video: { type: 'string' },
    mood:  { type: 'string' },
    music: { type: 'string' },
    gain:  { type: 'string' },
    out:   { type: 'string' },
  },
  strict: true,
});

function die(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

if (!args.video) die('--video is required');
if (!args.mood && !args.music) die('either --mood or --music is required');
if (args.mood && args.music) die('--mood and --music are mutually exclusive');

const VALID_MOODS = ['tech', 'ad', 'educational', 'educational-alt', 'tutorial', 'tutorial-alt'];

const videoPath = path.resolve(args.video);
if (!existsSync(videoPath)) die(`video file not found: ${videoPath}`);

const gainDb = args.gain !== undefined ? parseFloat(args.gain) : -19;
if (!Number.isFinite(gainDb)) die(`--gain must be a number, got: ${args.gain}`);

// ---------------------------------------------------------------------------
// Mood → music file resolution
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walk up from startDir until we find a dir that contains
 * .agents/skills/huashu-design/assets. Returns the assets dir or null.
 */
function findHuashuAssetsUpward(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, '.agents', 'skills', 'huashu-design', 'assets');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached fs root
    dir = parent;
  }
}

let musicPath;
let resolvedMood = null;

if (args.music) {
  musicPath = path.resolve(args.music);
  if (!existsSync(musicPath)) die(`music file not found: ${musicPath}`);
} else {
  const mood = args.mood;
  if (!VALID_MOODS.includes(mood)) {
    die(`unknown mood "${mood}". Valid moods: ${VALID_MOODS.join(', ')}`);
  }
  resolvedMood = mood;
  const filename = `bgm-${mood}.mp3`;

  const searchPaths = [];

  // 1. $SD_SHORT_BGM_DIR
  if (process.env.SD_SHORT_BGM_DIR) {
    searchPaths.push(path.join(process.env.SD_SHORT_BGM_DIR, filename));
  }

  // 2. Walk up from script location for .agents/skills/huashu-design/assets/
  const huashuAssets = findHuashuAssetsUpward(__dirname);
  if (huashuAssets) {
    searchPaths.push(path.join(huashuAssets, filename));
  }

  // 3. ~/.claude/skills/huashu-design/assets/
  searchPaths.push(path.join(os.homedir(), '.claude', 'skills', 'huashu-design', 'assets', filename));

  musicPath = searchPaths.find(p => existsSync(p)) ?? null;

  if (!musicPath) {
    const searched = searchPaths.map(p => `  - ${p}`).join('\n');
    die(`BGM file "${filename}" not found. Searched:\n${searched}\n\nOptions:\n  - Set SD_SHORT_BGM_DIR to the directory containing the BGM files.\n  - Use --music <file> to specify an audio file directly.`);
  }
}

// ---------------------------------------------------------------------------
// Probe input video with ffprobe
// ---------------------------------------------------------------------------
const probeResult = spawnSync('ffprobe', [
  '-v', 'quiet',
  '-print_format', 'json',
  '-show_streams',
  '-show_format',
  videoPath,
], { encoding: 'utf8' });

if (probeResult.status !== 0) {
  die(`ffprobe failed:\n${probeResult.stderr}`);
}

let probeData;
try {
  probeData = JSON.parse(probeResult.stdout);
} catch {
  die('ffprobe returned unparseable JSON');
}

const duration = parseFloat(probeData.format?.duration);
if (!Number.isFinite(duration) || duration <= 0) {
  die(`could not determine video duration from ffprobe output`);
}

const streams = probeData.streams ?? [];
const hadNarration = streams.some(s => s.codec_type === 'audio');

// ---------------------------------------------------------------------------
// Build output path
// ---------------------------------------------------------------------------
const outPath = args.out
  ? path.resolve(args.out)
  : (() => {
      const base = path.basename(videoPath, path.extname(videoPath));
      return path.join(path.dirname(videoPath), `${base}-music.mp4`);
    })();

// ---------------------------------------------------------------------------
// Build ffmpeg command
// ---------------------------------------------------------------------------
// Music filter chain:
//   1. volume=<gain>dB
//   2. afade in 1s
//   3. afade out 2s ending at video duration
//   4. atrim to video duration (belt-and-suspenders)
const fadeOutStart = Math.max(0, duration - 2.0);
const musicFilter = `volume=${gainDb}dB,afade=t=in:d=1.0,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=2.0,atrim=end=${duration.toFixed(3)}`;

const ffmpegArgs = ['-y'];

// Input 0: video (stream_loop not needed — it's not audio)
ffmpegArgs.push('-i', videoPath);

// Input 1: music (looped so short tracks don't run out)
ffmpegArgs.push('-stream_loop', '-1', '-i', musicPath);

// Video: copy only, never re-encode
ffmpegArgs.push('-c:v', 'copy');

if (hadNarration) {
  // Mix [0:a] (narration) with filtered [1:a] (music)
  // normalize=0 keeps narration at full level; music is already attenuated via gain
  ffmpegArgs.push(
    '-filter_complex',
    `[1:a]${musicFilter}[bgm];[0:a][bgm]amix=inputs=2:duration=first:normalize=0[aout]`,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', String(duration),
  );
} else {
  // No narration — music chain is the sole audio track
  ffmpegArgs.push(
    '-filter_complex',
    `[1:a]${musicFilter}[bgm]`,
    '-map', '0:v',
    '-map', '[bgm]',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
  );
}

ffmpegArgs.push(outPath);

// ---------------------------------------------------------------------------
// Run ffmpeg
// ---------------------------------------------------------------------------
const ffResult = spawnSync('ffmpeg', ffmpegArgs, {
  stdio: ['ignore', 'pipe', 'pipe'],
  encoding: 'utf8',
});

if (ffResult.status !== 0) {
  process.stderr.write(`ffmpeg failed (exit ${ffResult.status}):\n${ffResult.stderr}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Emit result JSON
// ---------------------------------------------------------------------------
const sizeBytes = statSync(outPath).size;
const result = {
  out: outPath,
  sizeBytes,
  mood: resolvedMood,
  music: musicPath,
  hadNarration,
};

process.stdout.write(JSON.stringify(result) + '\n');
