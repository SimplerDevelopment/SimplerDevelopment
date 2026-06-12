---
name: sd-create-short
description: Turn one SimplerDevelopment feature (feature name, vault Domain Map note, or URL) into a branded 20–40s MP4 video: script → Kokoro TTS + Whisper word alignment → GSAP composition → QA → render → upload to portal media library → emit a `video` block JSON + LinkedIn caption. Use when the user says 'create a short about X', 'make a feature video for Y', 'LinkedIn video for Z', 'promo video for W', 'short about the Visual Editor', 'feature spotlight', 'social video for X', 'make a short about our booking pages', 'generate a marketing clip', or 'turn the company brain into a short'. Produces two deliverables: (1) a ready-to-paste `video` block JSON for blog posts and (2) a local MP4 + drafted LinkedIn caption for manual native upload.
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, WebFetch, Glob, Grep
---

# sd-create-short

Turn one SimplerDevelopment feature into a branded 20–40s marketing video. The full pipeline runs locally on the authoring machine — no new platform dependencies. The portal only stores the MP4 (existing media tools) and renders it (existing `video` block).

## Pre-flight

1. **Read `.sd/config.json`.** If missing or stale (>14 days since `generatedAt`), tell the user to run `sd-init` first and stop. Every step depends on the brand snapshot already being resolved.
2. **Read `.sd/learnings.md`** (if it exists). Apply every rule under `## Active rules` to this run. When a rule prohibits something you were about to do, say so explicitly before proceeding differently.
3. **First-use setup.** If `scripts/package.json` has never been installed in this skill, run:
   ```bash
   cd /path/to/.claude/skills/sd-create-short/scripts && bun install
   ```
   Scripts are invoked with `node`, not bun. Requires `ffmpeg` on `PATH` and `uvx` (for Whisper alignment).
4. **Ask the user** if either is not stated:
   - **Ratio:** `4:5` (1080×1350, LinkedIn feed) or `16:9` (1920×1080, blog embed)?  Default: `4:5`.
   - **Duration target:** 20–40s; default ~25–30s.
   - **Angle (optional):** "launch announcement", "how it works", "before/after" — or none (feature spotlight default).

## Sourcing

Build the fact base before writing a single word of the script.

1. **Vault Domain Map first.** Open `vault/03 - Domains/` and find the map for the named feature. If ambiguous, check `vault/00 - Index/Domains Index.md`. The Domain Map is the cheapest, most accurate source — it was written deliberately.
2. **README.** Scan for any concrete capability claims, user-facing feature names, or numbers the map omitted.
3. **Live site pages (optional).** If the user provides a URL or the Domain Map cites one, fetch it with `WebFetch`. Use this for any live-product screenshots, pricing, or phrasing already on the public site.
4. **Anti-fabrication gate (load-bearing).** Every claim, stat, or capability statement in the final script must trace back to one of the sources above. Keep a private trace list as you draft:

   ```
   [claim] → [source file or URL, line/section]
   ```

   If a claim cannot be traced, remove it or replace it with a placeholder. **Never invent numbers, never extrapolate a metric that isn't stated.** Surface any gaps to the user rather than filling them with plausible-sounding content.

## Script formula

Write the script to the `sd-short-data` `scenes` structure (four scene kinds):

| Beat | Scene kind | On-screen text | ~Duration |
|------|------------|----------------|-----------|
| Hook | `hook` | Bold statement or question that earns the next 25s | 4–6s |
| Feature beat 1–3 | `feature` | Heading + 2–3 tight bullets | 5–8s each |
| Proof point | `stat` | One concrete number or outcome | 4–5s |
| CTA | `cta` | Heading + URL | 4–5s |

Rules:
- **~75 words max for 30s.** Count them. Cut ruthlessly.
- **Text-first.** Every scene carries the full message in on-screen text. Voiceover is enhancement, not load-bearing — the video must work muted.
- **Brand voice.** Pull `messaging.toneOfVoice`, `messaging.valueProposition`, and `messaging.keyDifferentiators` from `.sd/config.json`. The script's register and framing must match.
- **CTA always links to simplerdevelopment.com** unless the user specifies otherwise.

## Step-by-step run procedure

Create a working folder per video: `/tmp/sd-short-<slug>/` (never committed to git).

### Step 1 — Write script.txt

Write the narration script to `/tmp/sd-short-<slug>/script.txt`. One line per sentence, ~75 words total. This is what Kokoro will speak.

### Step 2 — TTS + word alignment

```bash
node /path/to/.claude/skills/sd-create-short/scripts/tts.mjs \
  --text /tmp/sd-short-<slug>/script.txt \
  --out /tmp/sd-short-<slug>/ \
  [--voice af_heart] [--speed 1.0] [--warm] \
  [--engine kokoro|chatterbox] [--voice-ref /tmp/ref.wav]
```

Outputs:
- `/tmp/sd-short-<slug>/narration.wav`
- `/tmp/sd-short-<slug>/words.json` — array of `{word, start, end}` in seconds

Prints JSON: `{wav, words, durationSec}`. First run downloads the Kokoro model (~300 MB) — warn the user and wait.

**No-VO mode** (if TTS fails or user prefers text-only): pass `--no-align` flag, or skip this step entirely and hand-pace scenes at ~5s per scene in Step 3. Text-first compositions ship fine without audio; LinkedIn autoplays muted anyway.

#### Voice selection

Default voice: `af_heart` (American female, warm and clear — good general-purpose choice).

Other Kokoro voices worth offering the user before committing to a long production run:

| Voice | Character |
|-------|-----------|
| `af_bella` | American female — slightly breathy, conversational |
| `af_nicole` | American female — polished, slightly formal |
| `am_michael` | American male — neutral, professional |
| `am_fenrir` | American male — deeper, authoritative |
| `bf_emma` | British female — crisp, trustworthy |

Pass via `--voice <name>`. **Recommend auditioning once** with a one-line sample (`--text /tmp/sample.txt`) before committing to a full production short — voice fit varies significantly by script tone.

**Warm / friendly delivery** — two knobs on `tts.mjs`, plus the script itself:
- `--speed 0.9` (range 0.5–1.5, default 1.0): 0.88–0.95 reads calmer and friendlier. Slower speech lengthens the narration — re-check total duration against the target.
- `--warm`: post-processes the narration with a gentle EQ (low-shelf +3 dB @150 Hz, high-shelf −2.5 dB @7.5 kHz, light compression) for a rounder, less synthetic top end. Safe default for marketing voiceover.
- Script tone matters as much as the knobs: contractions, direct address ("you", "your site"), and short comma-spliced sentences (Kokoro breathes at punctuation) read warmer than formal copy.

Recommended warm preset for SD shorts: `--voice af_heart --speed 0.9 --warm`.

#### Engine selection — Kokoro (default) vs Chatterbox (voice cloning)

`tts.mjs` has two interchangeable synthesis backends. Everything downstream
(word alignment, duration, GSAP timing) is engine-agnostic, so this is a pure
swap of the synthesis step — pick per-short.

| | **Kokoro** (default) | **Chatterbox** (optional) |
|---|---|---|
| Use for | Generic branded voice | Cloning a specific person (e.g. Dan, a client) |
| Voices | Fixed pretrained set (`af_heart`, …) | Zero-shot clone from a reference clip |
| Flag | (default) or `--engine kokoro` | `--engine chatterbox`, or just `--voice-ref <clip.wav>` |
| Speed | Fast | Slower (torch); fine for a 20–40s short |
| First-run DL | ~300 MB | ~1 GB weights |
| License | Apache 2.0 | **MIT** — both safe to ship commercially |

**Cloning a voice:**

```bash
node .../scripts/tts.mjs \
  --text /tmp/sd-short-<slug>/script.txt \
  --out  /tmp/sd-short-<slug>/ \
  --voice-ref /tmp/dan-sample.wav      # implies --engine chatterbox
```

- **Reference clip:** ~5–10s of clean, single-speaker speech (no music/noise). A WAV
  works best. The clone quality tracks the reference quality directly.
- **Delivery knobs** (Chatterbox only; Kokoro's `--voice`/`--speed`/`--warm` don't apply):
  `--exaggeration` (0.25 calm → 1.0 dramatic, default 0.5) and `--cfg-weight`
  (lower = slower/more deliberate, default 0.5). For warm marketing VO, try
  `--exaggeration 0.4 --cfg-weight 0.4`.
- **Requires `uv` on PATH** (same as the Whisper alignment step). Chatterbox runs
  via `uv run chatterbox_tts.py`; deps resolve automatically on first use.
- **Consent gate:** only clone a voice you have permission to use. Dan's own voice
  for SD marketing is the clean default; cloning a client or third party needs
  their explicit consent. If unsure, fall back to Kokoro.
- **Fallback:** if Chatterbox fails (no `uv`, download/disk issue), drop the
  `--engine`/`--voice-ref` flags to use Kokoro, or `--no-align` for no-VO mode.

### Step 3 — Author `sd-short-data` JSON

Build the composition data object that the template will read. Shape:

```json
{
  "meta": {
    "width":    1080,
    "height":   1350,
    "fps":      30,
    "duration": <durationSec from tts.mjs, or hand-paced total>
  },
  "brand": {
    "primaryColor":     "<brand.primaryColor>",
    "secondaryColor":   "<brand.secondaryColor>",
    "accentColor":      "<brand.accentColor>",
    "backgroundColor":  "<brand.backgroundColor>",
    "textColor":        "<brand.textColor>",
    "headingFont":      "<brand.headingFont>",
    "bodyFont":         "<brand.bodyFont>",
    "logoUrl":          "<brand.logos.logoUrl>",
    "logoSquareUrl":    "<brand.logos.logoSquareUrl>",
    "companyName":      "<brand.companyName>",
    "tagline":          "<messaging.tagline>",
    "ctaUrl":           "https://simplerdevelopment.com"
  },
  "scenes": [
    { "kind": "hook",    "start": 0,    "end": 5.2,  "heading": "...", "sub": "..." },
    { "kind": "feature", "start": 5.2,  "end": 12.8, "heading": "...", "bullets": ["...", "..."] },
    { "kind": "feature", "start": 12.8, "end": 19.4, "heading": "...", "bullets": ["...", "..."] },
    { "kind": "demo",    "start": 19.4, "end": 26.0, "heading": "See it in action", "caption": "...", "clipSrc": "clip.mp4", "clipStartOffset": 0 },
    { "kind": "stat",    "start": 26.0, "end": 30.7, "stat": "...",    "label": "..." },
    { "kind": "cta",     "start": 30.7, "end": 34.6, "heading": "...", "cta": "simplerdevelopment.com" }
  ]
}
```

`start`/`end` values: use `words.json` timestamps so each scene begins on its first spoken word. In no-VO mode, hand-pace at ~5s per scene with 0.3s gaps.

Brand values are copied verbatim from `.sd/config.json` — never hard-coded.

**`demo` scene kind** — plays a real screen capture (from Step 3b) inside a browser-chrome frame (traffic-light dots + brand URL pill), heading above and optional caption below. `clipSrc` resolves relative to the composition file — copy the clip into the working folder in Step 4. `clipStartOffset` (seconds, default 0) picks where in the clip playback starts; if the scene outlasts the clip it loops. The video is driven frame-by-frame by the renderer's seek (never autoplays), so the final MP4 is deterministic. If the clip is missing or fails to load, the scene degrades to a branded placeholder panel — the render never hangs. A short with real product footage converts better than text alone: prefer one demo scene per short when the feature has visible UI.

### Step 3b — Capture screen footage (optional but recommended)

Record the actual product UI with `capture.mjs` — Playwright drives a scripted browser session, records it, and converts to a clean MP4 clip:

```bash
node /path/to/.claude/skills/sd-create-short/scripts/capture.mjs \
  --plan /tmp/sd-short-<slug>/capture-plan.json \
  --out /tmp/sd-short-<slug>/clip.mp4 \
  [--speed 1.25]
```

The plan JSON: `{ url, viewport: {width, height}, storageState?, hideSelectors?, settleMs, steps: [...], tailMs }` with step actions `click | type | hover | scroll | press | wait | goto` (see the header comment in `capture.mjs` for the full shape; `testdata/capture-plan.json` is a working example). Prints `{clip, durationSec, sizeBytes, width, height}`.

Authoring guidance:
- **Target**: run `bun dev` and capture the local portal (e.g. the visual editor on a seeded demo site), or capture the live site. For authed pages, pass a Playwright `storageState` JSON (export one from an e2e login or a manual session).
- **Viewport** 1440×900 reads well inside the chrome frame at both ratios. Use `hideSelectors` to drop cookie banners/toasts.
- **Pacing**: type/click steps get human-like pauses automatically; `--speed 1.25`–`1.5` tightens the final clip — demo footage almost always benefits from a modest speed-up.
- Keep clips 5–10s; one clear interaction beats a tour. Match `end - start` of the demo scene to the (post-speed) clip duration, or set `clipStartOffset` to skip dead air.

### Step 4 — Set up the composition

1. Copy the template to the working folder:
   ```bash
   cp /path/to/.claude/skills/sd-create-short/templates/feature-spotlight-<ratio>.html \
      /tmp/sd-short-<slug>/composition.html
   ```
2. Copy `gsap.min.js` next to it:
   ```bash
   cp /path/to/node_modules/gsap/dist/gsap.min.js /tmp/sd-short-<slug>/gsap.min.js
   ```
   (`gsap` is already a production dep — no extra install needed.)
3. If using a `demo` scene: make sure the capture clip sits next to the composition under the exact name used in `clipSrc` (e.g. `/tmp/sd-short-<slug>/clip.mp4` from Step 3b).
4. Inject the `sd-short-data` blob into the composition. The template reads:
   ```html
   <script id="sd-short-data" type="application/json">...</script>
   ```
   Replace the placeholder JSON inside that tag with the object from Step 3.

### Step 5 — Overflow check (fix until clean)

```bash
node /path/to/.claude/skills/sd-create-short/scripts/check-overflow.mjs \
  --html /tmp/sd-short-<slug>/composition.html \
  [--step 0.5]
```

Exit 0 = clean. Exit 1 = violations JSON printed to stdout listing which elements exceed the canvas at which timestamps.

Fix: shorten text, reduce font size, trim bullets, or mark intentionally-bleed elements with `data-overflow-ok`. Re-run until exit 0. Do not proceed to render with overflow violations outstanding.

### Step 6 — Browser preview (user sign-off)

Open the composition HTML in the default browser for the user to review the animation before committing render time:

```bash
open /tmp/sd-short-<slug>/composition.html
```

Tell the user: "Open in Chrome for the most accurate preview. When you're happy with the animation, say 'render it'."

Pause here. Do not auto-proceed to render.

### Step 7 — Render MP4

Once the user approves:

```bash
node /path/to/.claude/skills/sd-create-short/scripts/render.mjs \
  --html /tmp/sd-short-<slug>/composition.html \
  --out /tmp/sd-short-<slug>/ \
  [--audio /tmp/sd-short-<slug>/narration.wav]
```

Outputs `/tmp/sd-short-<slug>/short.mp4` (H.264 yuv420p, crf 20, AAC audio).
Prints JSON: `{mp4, sizeBytes, durationSec, frames}`.

**Hard cap: 25 MB.** Check `sizeBytes`. If over, re-render at higher crf (e.g. `crf 26`) or trim the script to shorten duration.

### Step 7b — Mix background music (optional)

After render and before upload, you can layer a background music track under the narration (or as the sole audio for no-VO shorts):

```bash
node /path/to/.claude/skills/sd-create-short/scripts/mix-music.mjs \
  --video /tmp/sd-short-<slug>/short.mp4 \
  (--mood <name> | --music <file>) \
  [--gain <dB>] \
  [--out /tmp/sd-short-<slug>/short-music.mp4]
```

Prints JSON: `{ "out": ..., "sizeBytes": ..., "mood": <name|null>, "music": <resolved-path>, "hadNarration": <bool> }`.

**Video is never re-encoded** (`-c:v copy`). The music loops automatically so short BGM files never run out, with a 1 s fade-in and 2 s fade-out ending exactly at the video's duration.

#### Moods

| Mood | Description |
|------|-------------|
| `tech` | Minimal synth + piano, Apple-keynote feel. **Default recommendation** for SD feature shorts. |
| `ad` | Upbeat electronic with build + drop. Best for promos and launch announcements. |
| `educational` | Warm guitar / e-piano. Good for how-it-works and tutorial-style scripts. |
| `educational-alt` | Alternate warm guitar / e-piano arrangement. |
| `tutorial` | Unobtrusive lo-fi. Ideal for step-by-step walkthroughs. |
| `tutorial-alt` | Alternate lo-fi arrangement. |

#### Gain guidance

- **`-19` dB (default):** music sits clearly under narration — use whenever VO is present.
- **`-14` to `-16` dB:** music carries more of the feel for no-VO (text-only) shorts.
- Use `--music <file>` to substitute any audio file you own or have licensed, bypassing mood lookup entirely.

#### Licensing caution

The mood tracks ship with the third-party vendored `huashu-design` skill (`.agents/skills/huashu-design/assets/`) and their provenance and license are **not documented**. Before publishing commercial marketing videos that include these tracks, verify their licensing terms or substitute a track you own or have properly licensed via `--music <file>`. LinkedIn and YouTube can detect and flag copyrighted audio on upload.

### Step 8 — User approves the MP4

```bash
open /tmp/sd-short-<slug>/short.mp4
```

Tell the user the file path, size, and duration. Ask for approval before uploading. Pause here.

### Step 9 — Upload to portal media library

Follow the presign → PUT → register pattern exactly:

**9a. Presign:**
```
mcp__simplerdevelopment-postcaptain__media_upload_presign {
  "filename":  "sd-short-<slug>.mp4",
  "mimeType":  "video/mp4",
  "fileSize":  <sizeBytes from render output>
}
```
Parse `result.content[0].text` as JSON. Check for `error` key — stop and surface if present. On success, extract `{ mediaKey, uploadUrl, requiredHeaders, expiresAt }`. The `uploadUrl` TTL is 5 minutes — proceed immediately.

**9b. PUT the file:**
```bash
curl -X PUT \
  -H "Content-Type: video/mp4" \
  -H "Content-Length: <sizeBytes>" \
  <requiredHeaders as -H flags> \
  --data-binary @/tmp/sd-short-<slug>/short.mp4 \
  "<uploadUrl>"
```
A 200 response means the upload succeeded. Any non-2xx is a failure — re-presign if TTL expired; otherwise surface the error.

**9c. Register:**
```
mcp__simplerdevelopment-postcaptain__media_register {
  "mediaKey":        "<mediaKey from presign>",
  "originalFilename": "sd-short-<slug>.mp4",
  "mimeType":        "video/mp4",
  "alt":             "<feature name> — SimplerDevelopment feature short",
  "websiteId":       <defaultSiteId from config>
}
```
Parse `result.content[0].text`. Check for `error`. On success, extract the media row — the URL field gives `/api/media/proxy/media/<uuid>.mp4`.

## MCP response handling — read errors first

SimplerDevelopment's MCP wraps every response — successes AND errors — in a JSON-RPC success envelope shaped like:

```
{"result":{"content":[{"type":"text","text":"{...JSON...}"}]}}
```

Before reporting success to the user, parse `result.content[0].text` as JSON. If the parsed object contains an `error` key (e.g. `{"error":"Site not found"}` or `{"error":"Unauthorized"}`), the call FAILED — even though the JSON-RPC envelope said `result`. STOP immediately. Surface the error verbatim to the user. Do NOT invent a media URL, block JSON, or upload confirmation. Hallucinated success is worse than a visible failure.

Only treat the call as successful when the parsed text contains the expected entity shape (e.g. a media row with a `.url` for `media_register`).

## Output

Return to the user:

**Blog deliverable** — paste-ready `video` block JSON:
```json
{
  "type":     "video",
  "url":      "/api/media/proxy/media/<uuid>.mp4",
  "caption":  "<one-line feature description>",
  "controls": true
}
```

**LinkedIn deliverable** — local MP4 path + drafted caption:
```
File: /tmp/sd-short-<slug>/short.mp4

Caption draft:
<Hook line — ≤120 chars, shows before "…see more">
<1–2 value lines grounded in the feature's real capabilities>
Try it → simplerdevelopment.com
#webdev #smallbusiness #<featureHashtag>
```

LinkedIn upload is manual: download the MP4, go to linkedin.com/post/new, attach the file, paste the caption.

Also state:
- Media proxy URL
- Working folder: `/tmp/sd-short-<slug>/`
- Rendered duration and file size

## Failure modes

| Failure | Resolution |
|---------|------------|
| Missing `.sd/config.json` | Stop. Tell user to run `sd-init`. |
| Kokoro model not downloaded (~300 MB on first run) | Warn the user; the download happens automatically inside `tts.mjs` on first invocation. If it fails (no network, disk full), fall back to `--no-align` / no-VO mode and hand-pace scenes. |
| Whisper alignment produces garbled timestamps | Retry with `--model small` flag (tts.mjs should forward it to uvx). If still wrong, fall back to no-VO hand-paced mode — the composition still ships, just without word-sync. |
| `check-overflow.mjs` exits 1 | Fix the violations (shorten text, shrink font, or mark element `data-overflow-ok`). Do not proceed to render with violations. |
| MP4 exceeds 25 MB | Re-render at higher crf (`--crf 26` or `--crf 30`), or trim the script to reduce duration. A 30s 1080p H.264 short is typically 5–10 MB; oversized usually means the composition is 1920×1080 at high bitrate. |
| Presign URL expired (5-min TTL) | Call `media_upload_presign` again to get a fresh URL. The render file is unchanged; just re-PUT. |
| `curl` PUT returns non-2xx | Check `requiredHeaders` were all passed. Re-presign if >5 min elapsed. Surface the HTTP status to the user. |
| `media_register` returns `error` | Surface verbatim. Common cause: `mediaKey` was already registered (idempotent — check if a URL already exists from an earlier run). |
| `gsap.min.js` not found | Run `bun add gsap` in the project root (it is already a production dep — this case means the dep was removed). |
| `ffmpeg` not on PATH | Ask the user to install it: `brew install ffmpeg` on macOS. The render script will error explicitly if missing. |
| Mood track not found (`mix-music.mjs` exits 1) | The error message lists every searched path (`$SD_SHORT_BGM_DIR`, `.agents/skills/huashu-design/assets/`, `~/.claude/skills/huashu-design/assets/`). Fix by setting `SD_SHORT_BGM_DIR`, ensuring the `huashu-design` skill assets are present, or bypassing mood lookup with `--music <file>` pointing to any audio you have locally. To skip background music entirely, simply omit Step 7b. |
| Demo scene shows the branded placeholder instead of footage | `clipSrc` didn't resolve — confirm the clip file sits next to the composition with the exact `clipSrc` name. The template degrades gracefully on purpose; fix the path and re-render. |
| `capture.mjs` records a blank/login page | The target needed auth — pass `storageState` (export from a logged-in Playwright session), or capture a public page instead. Use `hideSelectors` for cookie banners. |
| Demo footage looks sluggish in the short | Re-run `capture.mjs` with `--speed 1.25`–`1.5`, or trim dead air with `clipStartOffset`. |

## Self-improvement

At the end of every run where the user gave concrete feedback (anything edited, any scene they asked to change, any stat they corrected), invoke `sd-learn`:

```
sd-learn
  artifact:  "short <slug>"
  feedback:  "<user's verbatim feedback>"
  skill:     "sd-create-short"
```

This writes a rule to `.sd/learnings.md` that the next run will read in pre-flight. Lessons that accumulate here:
- "Always use the square logo for the `stat` scene"
- "Client X prefers no CTA URL — they want a phone number instead"
- "Reduce bullet text to 5 words max — the 4:5 canvas clips at 6"

## Install

This skill ships as part of the SimplerDevelopment client skills bundle. Install all sibling skills in one step from the portal:

**https://simplerdevelopment.com/install**

macOS, Windows, and Linux installers download the bundle to `~/.claude/skills/`. Both Claude Desktop and Claude Code auto-discover skills from that path on next restart.

See `CLIENT_QUICKSTART.md` (installed alongside this file) for the full setup walkthrough, including the MCP-server config Claude Desktop needs and the one-time `sd-init` bootstrap.
