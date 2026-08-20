# Saving the homepage draft

**Session** `2026-08-20T14-32-09_app-simplerdev-com`
**Recorded** 2026-08-20 14:32:09 UTC · **Duration** 26.5s
**Start URL** https://app.simplerdev.com/portal/websites/12/posts/487/edit
**Chrome** 141.0.7390.54 · macOS 15.4 · viewport 1728×969

> This report is a deterministic rendering of `timeline.json`. It contains no
> analysis — every line below is a fact recorded during the session. Read
> `timeline.json` for the full detail.

---

## Failures

**2 failed requests**, 1 distinct.

### PATCH /api/portal/posts/487 → 500 (×2, at 00:11.942 and 00:21.103)

```
{"success":false,"error":{"code":"DB_ERROR","message":"column \"cdn_cache_enabled\" of relation \"posts\" does not exist"}}
```

Request body (truncated, 19004 bytes total):
```
{"blocks":[…14 items…],"cdnCacheEnabled":true,"status":"draft"}
```

Frames: `frames/000012340-network-500.jpg`, `frames/000021503-network-500.jpg`

**2 console errors**, 1 distinct.

### `Failed to save post` (×2, at 00:12.318 and 00:21.361)
```
at savePost (editor-bar.tsx:118:13)
at async onClick (editor-bar.tsx:74:5)
```

---

## Timeline

| Time | | Event |
|---|---|---|
| 00:00.000 | nav | **load** https://app.simplerdev.com/portal/websites/12/posts/487/edit |
| 00:01.180 | 🎙 | *"Okay, I'm in the editor for the homepage draft. I want to add a testimonial block and save it."* |
| 00:02.340 | log | `[editor] hydrated 14 blocks for post 487` |
| 00:02.412 | net | GET `/api/portal/posts/487` → 200 (286ms) |
| 00:03.105 | net | GET `/api/portal/media?siteId=12&token=[redacted]` → 200 (285ms) |
| 00:04.120 | drag | `[data-testid='block-palette-testimonial']` → `#block-canvas` (pointer, 1840ms) |
| 00:05.210 | 🎙 | *"Dragging the testimonial block in, dropping it under the hero."* |
| 00:08.940 | change | `[data-testid='block-testimonial-quote']` — value withheld (62 chars, text) |
| 00:11.210 | 🎙 | *"And clicking save."* |
| 00:11.880 | click | **Save changes** `[data-testid='editor-save']` |
| 00:11.942 | **net** | **PATCH `/api/portal/posts/487` → 500** (342ms) |
| 00:12.318 | **err** | **`Failed to save post`** |
| 00:14.060 | 🎙 | *"It's just spinning. Nothing happened — no toast, no error, the button's still in the saving state."* |
| 00:19.380 | 🎙 | *"Let me try it once more."* |
| 00:21.048 | click | **Save changes** `[data-testid='editor-save']` |
| 00:21.103 | **net** | **PATCH `/api/portal/posts/487` → 500** (299ms) |
| 00:21.361 | **err** | **`Failed to save post`** |
| 00:23.890 | 🎙 | *"Same thing twice. So it's not a fluke — save is just broken on this page."* |

---

## Redaction

Typed values: **off** (default). Applied this session:

- `authorization` header redacted ×14
- `cookie` header redacted ×14
- `set-cookie` header redacted ×2
- `token` URL parameter redacted ×1
- 1 typed value withheld
- 0 high-entropy matches in captured bodies

> ⚠️ **`video.webm` and `frames/` are not redacted.** They show whatever was on
> screen in this tab. Redaction is best-effort heuristics, not a guarantee.
> Review before sharing.

---

## Files

| File | |
|---|---|
| `timeline.json` | 18 events — full detail, the source of truth |
| `transcript.srt` | 6 cues, Whisper `base.en` via transformers.js (wasm) |
| `video.webm` | 26.5s, 1728×969 @ 15fps, VP8/Opus, 4.9 MB |
| `frames/` | 9 JPEGs at event boundaries, 1280px long edge |
| `session.json` | manifest — capture config, environment, redaction summary |
