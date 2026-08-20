# Map: Local-first video QA recorder (Chrome extension)

Label: wayfinder:map

## Destination

A **published, installable open-source repo**: a Chrome extension (plus whatever
local companion it needs) that records a QA session — tab video, narrated mic
audio transcribed locally to SRT, and a correlated event timeline of page URLs,
interacted elements, console logs and failed network responses — and writes raw
artifacts to disk for a coding agent to consume. Done when another developer, on
macOS/Linux/Windows, can follow the README and record their first session.

This effort **carries execution**, overriding wayfinder's plan-don't-do default:
the destination is a working published repo, not a spec.

## Notes

- **Domain:** Chrome MV3 extension + optional local sidecar process + local ASR
  (whisper.cpp / transformers.js). No hosted component of any kind.
- **Audience (settled at charting):** built for Dan first, but *any developer*
  must be able to run it. OS-agnostic — nothing may hard-code Homebrew paths,
  `/opt/homebrew`, or assume Apple Silicon.
- **Non-negotiables:** free, open source, fully local. Core function makes zero
  network calls. No accounts, no upload, no telemetry.
- **Prior art surveyed at charting:** Skreno (transcript + console + network +
  clicks + MCP, hosted, $10-15/mo), DevRecorder (video + console + network +
  navigation + MCP, free, no audio), PlayLog, BugReel, Vibe Feedback. None
  export a raw correlated artifact you own as files. That gap is the product.
- **Existing scaffold:** `extension/` in the SimplerDevelopment monorepo is a
  working MV3 + Vite + @crxjs + React 19 + Tailwind 4 + zod setup. Reusable as a
  copy source; wrong product to extend (it is tenant-coupled to the SD portal).
- **Skills every session should consult:** `/grilling`, `/domain-modeling`,
  ponytail (climb the lazy ladder before writing anything), and the delegation
  policy in CLAUDE.md — Opus decides, Sonnet builds.
- **Ledger:** if execution lands inside the SimplerDevelopment monorepo, CLAUDE.md
  requires a `PUX-###` card on board 153. If it lands in its own repo, this map
  plus the new repo's issues are the ledger. Resolved by "Where the code lives".

## Decisions so far

<!-- one line per resolved ticket: gist + link -->

- [What each capture mechanism can actually deliver](issues/02-what-each-capture-mechanism-delivers.md) —
  CDP is not optional. An isolated-world content script patches its own `window`,
  so it never sees the page's real `fetch`/`console`/XHR at all; MAIN-world
  injection fixes that but stays structurally blind to service workers, web
  workers, `sendBeacon`, and `<img>`/CSS loads. Only CDP taps below JS. 4xx/5xx
  bodies retrieve normally; true `loadingFailed` requests have no body to
  retrieve, ever; bodies do not survive navigation without
  `Network.configureDurableMessages`. Infobar text and review friction confirmed
  as unavoidable costs. Four spikes still open (CORS body retrieval, CSP-violation
  cross-world visibility, service-worker default visibility, buffer-eviction timing).

- [Local transcription: the real cost of each engine](issues/03-local-transcription-real-costs.md) —
  whisper.cpp ships **no macOS CLI binary, ever** (verified live: Ubuntu + Windows
  only, macOS gets an xcframework). Every Node binding either needs a compiler or
  is a 14-star package. So the sidecar cannot deliver one-command install on the
  primary developer's own OS. WebGPU in an MV3 offscreen document is real and
  demonstrated; one primary benchmark had WASM *beating* WebGPU for Whisper,
  contradicting vendor claims. Post-hoc transcription of a 10-min recording
  finishes in under a minute either way, so no streaming pipeline is needed.
  Recommends in-extension transformers.js, with a clean engine→segments→SRT seam
  so a bring-your-own-whisper.cpp path can be bolted on later.

- [Clock sources, and how to normalize them](issues/04-clock-sources-and-normalization.md) —
  `t0 = Date.now()` sampled synchronously at `MediaRecorder.start()`; every source
  converts to epoch-ms, then `t = source_epoch_ms - t0`. CDP Network `timestamp` is
  monotonic (convert via `wallTime - timestamp` from `requestWillBeSent`), but CDP
  Runtime/Log `timestamp` is already epoch-ms — genuinely different fields.
  `chrome.tabCapture` **mutes the tab** unless routed through an `AudioContext`,
  which conveniently forces the right design: one AudioContext-mixed stream through
  a **single** `MediaRecorder`, so video frame-0 and Whisper's buffer-start share an
  origin. MediaRecorder's t0 is not spec-aligned to `start()` (Chrome has delivered
  pre-`start()` data, ~140ms measured by one reporter) — the dominant error term,
  and unverified.

- [Run the outstanding spikes against a real browser](issues/13-run-the-outstanding-spikes.md) —
  CORS/preflight bodies are **never** retrievable (but `Log.entryAdded` carries the
  full human-readable CORS diagnosis, which is arguably better for QA). Service
  worker traffic is **invisible** without `Target.setAutoAttach` + per-target
  `Network.enable`. Response bodies **do not survive a navigation**, and
  `configureDurableMessages` is accepted but does not help — so bodies must be
  pulled **eagerly on `loadingFinished`** or the artifact silently ships empty.
  MediaRecorder t0 skew measured at one frame interval (−49..−21ms @30fps,
  −6..−3ms @60fps), far below the ±250ms budget — not the feared ~140ms. CDP
  reports CSP violations directly (`source: security`). Confirmed live that CDP
  mixes **three** units: monotonic seconds, epoch seconds (`wallTime`), and epoch
  milliseconds. The WebGPU-vs-WASM benchmark was deliberately deferred to the real
  extension — it tunes a default, not the architecture.

- [Transcription architecture decision](issues/07-transcription-architecture-decision.md) —
  **In-extension transformers.js, no sidecar**, with an engine→segments→SRT seam so
  whisper.cpp can be bolted on later. Model downloads on first use and caches
  forever; an offline local-model path exists for air-gapped use. Tier is asked once
  at first run rather than hardcoded — and that one dialog also carries the download
  explanation and the offline option. Transcription is **post-hoc**, not streaming.
  Audio uses an **AudioContext tee**: one branch into the single MediaRecorder (A/V
  sync, unmutes the tab), one AudioWorklet tap emitting 16kHz mono PCM to Whisper —
  which dissolves the conflict between this ticket and ticket 04. Mic optional,
  default ON; no speech simply means no `.srt`. Kills the sidecar option in ticket
  10 and the free-MCP assumption in ticket 11.

## Not yet specified

- **Which transcription backend is actually faster here.** One primary benchmark
  found WASM beating WebGPU for Whisper, contradicting vendor claims. Must be
  measured inside a real MV3 offscreen document before release; deferred from the
  spike ticket on purpose, and easy to forget.
- **`chrome.tabCapture` frame cadence on a static page.** Frame 0 is only a usable
  time anchor if frames arrive continuously; tabCapture is paint-driven. Affects
  whether video can be correlated by frame at all.

- **The recording UX itself.** Popup vs side panel vs keyboard shortcut; how you
  start/stop; whether you can drop a marker mid-session ("this is the bug") that
  lands in the timeline. Hangs on the capture-mechanism decision.
- **Multi-tab and multi-window sessions.** What happens when QA opens a link in a
  new tab, or the flow spans an OAuth popup. Debugger attachment is per-target.
- **Session storage, size, and retention.** A 15-minute 1080p webm is large;
  where sessions accumulate and what prunes them.
- **Post-session review before handoff.** Whether you get to trim, redact, or
  annotate a session before it becomes an artifact folder. Hangs on the privacy
  and artifact-contract decisions.
- **Testing strategy.** What a test even looks like for a thing whose input is a
  live browser and a human voice.
- **Integration with SD's own QA loop.** Whether the `/qa` skill and board 153
  consume these artifacts directly. Deliberately deferred — solve the generic
  tool first.

## Out of scope

- **Anything hosted.** No server, no accounts, no upload, no sharing links. Local
  files only; that constraint is the product's identity, not a v1 shortcut.
- **Cross-browser.** Chrome/Chromium only. Firefox and Safari have neither the
  debugger API shape nor the extension model this depends on.
- **Non-developer packaging.** Settled at charting: the audience is developers.
  A client-facing or QA-contractor installer is a different effort.
