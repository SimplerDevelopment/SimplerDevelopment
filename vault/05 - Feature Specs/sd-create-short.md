---
type: spec
domain: cms-blocks
status: accepted
date: 2026-06-10
sources:
  - lib/mcp/tools/cms.ts
  - types/blocks/media.ts
  - components/blocks/render/VideoBlockRender.tsx
  - .claude/skills/sd-init/SKILL.md
  - .claude/skills/sd-build-html-embed/SKILL.md
---

# Feature: sd-create-short — branded feature shorts for LinkedIn + blog

## Overview

A new `sd-create-*` family skill that turns one SimplerDevelopment feature (named feature, vault Domain Map, or URL) into a **branded 20–40s marketing video**: scripted from real source material, animated as a brand-styled HTML/GSAP composition, rendered to MP4 locally, uploaded to the portal media library, and delivered as (a) a ready-to-paste `video` block for blog posts and (b) a local MP4 + caption copy for LinkedIn native upload. Audience: marketing/owner authoring via Claude Code; output consumed on public sites + LinkedIn. Inspired by the HyperFrames/Archon workflow (Cole Medin's `hyperframes-ai-video-generation`), but self-contained — no new platform dependencies.

**Core stance: zero platform changes for MVP.** All generation (script, TTS, render) happens skill-side on the authoring machine. The platform only stores the MP4 (existing media tools) and renders it (existing `video` block).

## Domain context

Read first: [[CMS & Blocks]]. Invariants that constrain this feature:

- **Blocks are universal, never client-specific** — we reuse the existing `video` block (defined in `types/blocks/media.ts`, rendered by `components/blocks/render/VideoBlockRender.tsx`); no new block type needed.
- **Media upload path already supports MP4**: `media_upload_presign` → `curl PUT` → `media_register` in `lib/mcp/tools/cms.ts`. 25 MB cap; allowlist includes `video/mp4`. A 30s 1080p H.264 short is ~5–10 MB — comfortably inside the cap.
- **Brand comes from the sd-init snapshot** (.sd/config.json — gitignored, generated at runtime): colors, heading/body fonts, logo set, and `messaging` (tagline, value proposition, differentiators, tone of voice). The skill must not hard-code brand values.
- **Approval-URL convention**: sibling skills always deliver a draft + approval URL for stakeholder review before publish; the blog path here should match.
- `gsap` is already a production dependency (`package.json`), and the local machine has `ffmpeg`, Playwright, and Whisper (`uvx whisper-ctranslate2`) available — the render + alignment pipeline needs nothing new installed except the one-time Kokoro model download (~325 MB).

## User stories

- As the **SD owner**, I want to say "make a short about the Visual Editor" and get a branded MP4 + LinkedIn caption, so each platform feature gets social promotion without an editor or motion designer.
- As a **content author**, I want the short grounded in real docs (vault Domain Maps, README, simplerdevelopment.com pages) so it never invents stats or features.
- As a **blog author**, I want the video uploaded to the media library and handed to me as a `video` block JSON, so embedding it in a post is paste-and-publish.
- As a **LinkedIn viewer scrolling with sound off**, I want every scene to carry the message in on-screen text, so the video works muted (voiceover is enhancement, not load-bearing).

## Requirements

### Must have
- **Inputs:** feature name / Domain Map note / URL + optional angle ("launch announcement", "how it works", "before/after"). Target duration 20–40s.
- **Pre-flight:** read .sd/config.json (stop if missing/stale → run `sd-init`), read .sd/learnings.md, read the relevant Domain Map (see [[00 - Domains Index]]) as primary source material.
- **Script:** 4-beat formula — Hook → 2–3 feature beats → proof point → CTA (simplerdevelopment.com); ~75 words max for 30s. **Anti-fabrication gate:** every claim/stat must trace to a repo doc, vault note, or live site page; no invented numbers.
- **Text-first composition:** one HTML file per short, GSAP timeline, brand tokens injected from the config snapshot (colors, fonts, wide/square logo, tagline). Every scene readable with audio muted.
- **Aspect ratios:** `4:5` 1080×1350 (LinkedIn feed) and `16:9` 1920×1080 (blog) — chosen per run, one ratio per render.
- **Voiceover (default, $0):** **Kokoro** local TTS (Apache 2.0, ~82M params, CPU, no API key) generates narration; **local Whisper forced alignment** (`uvx whisper-ctranslate2`, already installed via the `video-ingest` skill) recovers the word timestamps that drive scene sync. **Graceful no-VO mode** (text + timing-only) remains a first-class path.
- **Render:** deterministic frame-by-frame — Playwright loads the composition, seeks the GSAP timeline frame-by-frame at 30fps, screenshots each frame; ffmpeg assembles frames + muxes narration into H.264 MP4. (Screencast capture drops frames; seek-and-snap doesn't.)
- **QA gate before upload:** automated overflow check (no text/element outside the canvas at any sampled frame) + open the MP4 for the user to approve before upload.
- **Delivery:** upload via `media_upload_presign` + `media_register`; return (1) media proxy URL, (2) ready-to-paste `video` block JSON, (3) local MP4 path, (4) drafted LinkedIn caption (hook line, 2–3 hashtags, link).
- **Self-improvement:** invoke `sd-learn` at the end when the user gave feedback, matching sibling skills.

### Nice to have
- Auto-create a draft promo blog post (headline + intro + `video` block) with an approval URL, reusing the `sd-create-page` flow.
- Square `1:1` 1080×1080 variant; render both ratios in one run.
- ElevenLabs as an optional premium voice upgrade (better inflection, voice cloning; native word timestamps skip the Whisper alignment step).
- ~~Background music bed with auto-fade~~ **Shipped (2026-06-10)**: scripts/mix-music.mjs loops/fades/ducks a mood track (`tech`/`ad`/`educational`/`tutorial` + alts, resolved from the vendored huashu-design BGM library) or any `--music <file>` under the narration. ⚠️ The bundled tracks' license is undocumented — verify or substitute owned audio before commercial publishing.
- A second deliverable format: the interactive HTML bundle itself via `posts_upload_html_zip` (html-embed block) for "live demo" embeds, reusing `sd-build-html-embed`.
- Extend `VideoBlock` with `loop` / `muted` / `poster` props so blog embeds can autoplay muted (today the type only has `url`, `caption`, `autoplay`, `controls` — browsers block autoplay with sound).
- Scene-template library beyond the first one: "before/after", "stat-led", "3-step how-it-works".
- ~~Animated screen captures of real features~~ **Shipped (2026-06-10)**: `demo` scene kind plays a captured clip inside a browser-chrome frame, driven frame-by-frame by the renderer (deterministic; seek() is now awaitable), with graceful placeholder fallback when no clip exists. Footage produced by scripts/capture.mjs.

## Technical design

### Database changes
None for MVP. (`media` rows are created by the existing `media_register` tool.)

### API changes
None for MVP. All three media tools (`media_upload_presign`, `media_register`, `media_upload_from_url`) already exist in `lib/mcp/tools/cms.ts` with MP4 in the MIME allowlist.

### Portal / Admin UI
None for MVP.

### Public site / blocks
Reuse `video` block as-is. Only the nice-to-have `loop`/`muted`/`poster` props would touch `types/blocks/media.ts` + `components/blocks/render/VideoBlockRender.tsx` + registry metadata (via `simplerdev-block-type` conventions, one small PR).

### MCP exposure
No new MCP tools. The skill consumes existing ones: `media_upload_presign`, `media_register`, optionally `posts_create` (draft promo post path).

### Skill layout (new files, mirrored to ~/.claude/skills/ like siblings)

```
.claude/skills/sd-create-short/
```
- SKILL.md — frontmatter + pre-flight + sourcing + script formula + render + upload + failure modes (sibling skeleton: see `.claude/skills/sd-create-page/SKILL.md`)
- templates/feature-spotlight-4x5.html, feature-spotlight-16x9.html — brand-token-parameterized GSAP compositions
- scripts/tts.mjs — Kokoro narration → Whisper forced alignment, writes narration.wav + word-timestamps JSON (ElevenLabs path: one API call returns both)
- scripts/render.mjs — Playwright seek-and-snap → frames/ → ffmpeg assemble + mux
- scripts/mix-music.mjs — optional BGM bed: loop + fade + −19 dB duck under narration (mood library or --music file)
- scripts/capture.mjs — Playwright-scripted screen recording of real product UI → H.264 clip (capture-plan JSON: url/steps/storageState; optional speed-up)
- scripts/check-overflow.mjs — sampled-frame bounding-box audit

Pipeline per run (all local, one working folder per video):
1. Source + script (with anti-fabrication trace list)
2. TTS: Kokoro → Whisper word alignment (or timing-only plan in no-VO mode)
3. Fill template → composition HTML, scene transitions pinned to word timestamps
4. Lint + overflow check → fix → preview in browser for user sign-off
5. Render MP4 → user approves the file
6. Presign → PUT → register → emit block JSON + LinkedIn caption

## Scaffolds to use

- None of `simplerdev-feature-scaffold` / `simplerdev-ui-scaffold` — no routes/UI.
- `simplerdev-block-type` only if/when the `VideoBlock` prop extension (nice-to-have) is picked up.
- Author the skill following the sibling `sd-create-*` SKILL.md skeleton (pre-flight → sourcing → authoring → MCP call → response handling → output → failure modes → sd-learn).

## Validation plan

Per [[06 - Validation/Gate Picking|Gate Picking]]: MVP changes no platform code → no unit/integration/tenancy gates apply. Skill-level validation instead:
- Dry-run the full pipeline against one real feature (suggest: Visual Editor) in both ratios; verify MP4 plays in QuickTime + Chrome + uploads under 25 MB.
- Overflow check must pass at 0 violations on the shipped templates.
- Verify the emitted `video` block JSON renders on a draft post (manual `/qa` pass).
- If `VideoBlock` props are extended: typecheck + registry drift test + one e2e render assertion, then `bun test:critical`.

## Open questions

- ~~**TTS engine**~~ **Decided (2026-06-10): Kokoro + Whisper forced alignment is the default, $0 path; ElevenLabs demoted to optional premium upgrade.** No-VO mode stays as the fallback (fully viable for LinkedIn's muted autoplay).
- **Voice**: default is `af_heart`; six audition samples generated (af_heart, af_bella, af_nicole, am_michael, am_fenrir, bf_emma) — owner to pick the brand voice before the first production short. Voice cloning only becomes relevant if ElevenLabs is ever added.
- **Music licensing**: the huashu-design BGM tracks have no documented license — confirm provenance or buy/substitute tracks before publishing commercially.
- **Blog delivery default**: just media URL + block JSON, or always auto-create the draft promo post with approval URL?
- **First three features to produce**: suggest Visual Editor, Company Brain, Booking Pages.
- **LinkedIn posting**: stays manual (download + upload) — any appetite for API posting later, or out of scope permanently?
