# Logo reveal — voice-synced "Simpler Development" intro

Self-contained animated logo reveal synced to a recorded voice take, rendered to
a 1920×1080 MP4 (`logo-reveal.mp4`) for use as a video intro/outro.

Originally built 2026-07-02 in a temp scratchpad (lost to tmp cleanup),
recovered from session transcripts 2026-07-08 — and lost *again* before that
recovery was ever committed. Recovered a second time and committed 2026-08-03;
that is why these files are in git now. Don't leave this directory untracked.

Tracked as PROM-001 on the Promotion board (project 170).

## Requirements

`prep.py`, `make_assets.py` and `gen_dings.py` need numpy, which is not installed
system-wide on the build machine. Run them through `uv`:

```bash
uv run --with numpy python3 prep.py ...
```

Also needs `ffmpeg` on PATH, and for the MP4 export, Playwright chromium (the
repo's e2e install covers it).

## Pipeline (in order)

```bash
bash record.sh                              # 1. record a take (mic; press q to stop)
uv run --with numpy python3 prep.py \
    take-1.wav 0 2.70                       # 2. trim + gentle clean -> voice.wav + voice.json
uv run --with numpy python3 build_html.py   # 3. compose -> index.html (self-contained)
open index.html                             # 4. preview; click Play
```

`prep.py` takes `[take.wav] [T0] [T1]`; with no args it picks the newest
`take-*.wav` and uses its full length. **Pass an explicit T1** if the take has
trailing silence — the fade-out is placed relative to it.

### MP4 export

The composition exposes `window.__short` (width/height/fps/duration/`seek`), the
renderer contract used by the `sd-create-short` skill, so its `render.mjs` drives
the export — deterministic seek-and-snap, no dropped frames:

```bash
# one audio bed: voice + the ding at DINGT, padded to the render duration
ffmpeg -y -i voice.wav -i ding.wav \
  -filter_complex "[1:a]adelay=2450|2450[d];[0:a][d]amix=inputs=2:duration=longest:normalize=0,apad[a]" \
  -map "[a]" -t 3.65 -ac 1 -ar 48000 -sample_fmt s16 mixdown.wav

node ../../../.claude/skills/sd-create-short/scripts/render.mjs \
  --html index.html --out /tmp/logo-reveal-render --audio mixdown.wav
```

`adelay` and `-t` must match `DINGT` and `RENDER_DUR` in `build_html.py`.
`RENDER_DUR` is derived from the ding's own length, because the bell rings ~1.2 s
and would otherwise be cut mid-decay: the visual beats end at `TOTAL` (3.2 s) but
the render runs to 3.65 s.

Asset regeneration (only needed if the logo/dings change):

```bash
curl -sLo iconLogo.png https://www.simplerdevelopment.com/iconLogo.png
ffmpeg -y -i iconLogo.png -vf "format=rgba,alphaextract" -f rawvideo -pix_fmt gray alpha128.raw
uv run --with numpy python3 make_assets.py   # decompose logo -> icon_brackets.png + icon_stars.png
uv run --with numpy python3 gen_dings.py     # 4 ding candidates + dings.html audition page
cp ding3_warmbell.wav ding.wav               # warm bell was the chosen default
```

## Choreography (3.2 s of beats, 3.65 s rendered, on take-1.wav)

The line is read **"Simpler [pause] Development"**:

| Beat | Time | Anchored to |
|---|---|---|
| brackets pop in (elastic overshoot) | 0.08 s | just ahead of the 0.12 s onset |
| "Simpler" un-wipes | 0.20 s | the vocal attack |
| *(hold)* | 1.50–2.04 s | the 0.54 s pause |
| "Development" snaps in with overshoot | 2.07 s | its punch (0.898) |
| sparkles + warm-bell ding | 2.45 s | just before speech ends at 2.55 |

Two things worth knowing before retiming to a different take:

- **"Simpler" is anchored to its attack, not its swell apex.** The apex is at
  1.08 s — the loudest point of the whole take — but this delivery draws the word
  out over 1.38 s, so anchoring there left the text ~0.9 s behind the voice. The
  sustained swell is carried by the loudness-driven scale/drop-shadow instead.
- **The dip at 0.45–0.48 s is a syllable boundary inside "Simpler", not the word
  gap.** The real gap is the 0.54 s pause. Choreographing to the dip produces a
  convincing-looking but wrong result.

Voice cleaning is deliberately gentle (highpass 70 Hz, adeclick, loudnorm, hsin
fades — no spectral denoise) to keep the natural "singy" delivery. `prep.py`
forces mono (`-ac 1`): the envelope pass reads the WAV as a flat int16 array, so
a stereo input reads as interleaved L/R — doubling the reported duration and
turning the envelope into channel alternation. `record.sh` captures mono, but a
DAW export generally will not.

## What's committed vs generated

Committed (source, or not reproducible):

- `take-1.wav` — the voice recording. **Irreplaceable.**
- `iconLogo.png`, `icon_brackets.png`, `icon_stars.png` — logo layers
- `fonts/geist-latin.woff2` — copied from the `next` package (`next/dist/next-devtools/server/font/`). It used to be `curl`ed from a Next.js content-hashed URL on the live site, which 404s after every deploy; the package copy doesn't rotate.
- `logo-reveal.mp4` — the rendered deliverable

Generated, and gitignored — rebuild with the commands above:
`voice.wav`, `voice.json`, `ding*.wav`, `dings.html`, `index.html`,
`mixdown.wav`, `alpha128.raw`.

`analyze.py` (a throwaway ASCII ink-map viewer for the logo alpha channel) did not
survive either loss and was not recovered. Nothing in the pipeline calls it —
`make_assets.py` does the real connected-component split.
