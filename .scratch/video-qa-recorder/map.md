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

- [Capture mechanism, and what counts as an interaction](issues/06-capture-mechanism-decision.md) —
  **CDP backbone + an isolated-world content script; no MAIN world.** This corrects
  ticket 02: isolated worlds share the DOM, so a `document_start` capture-phase
  listener on `window` sees every click and wins registration order against the
  page's own `stopPropagation` — and MAIN-world body cloning buys nothing, because
  CORS-blocked `fetch` rejects opaquely with nothing to clone. The debugger infobar
  is reframed as the recording indicator a mic-and-headers capture tool ought to
  show anyway. Attach failure (DevTools already open) **refuses to start**, because
  a silently network-less session is indistinguishable to the consuming agent from
  a session where nothing failed. Six interaction types — click, non-text keydown,
  change (not `input`), submit, drag, focus — with focus deduped against click so
  only keyboard-driven moves land, and drag captured via **both** native DnD and a
  pointer heuristic, since dnd-kit/react-beautiful-dnd/the visual editor dispatch
  no HTML5 drag events at all. Element identity emits **every** selector rather
  than ranking and picking one (testid → id → role+name → text → css path, plus
  tag, text, `rect`, frameUrl). Network: metadata for every request, bodies only
  for 4xx/5xx, `loadingFailed` recorded as diagnosis-not-body, aborts recorded but
  not flagged, request `postData` free. Bodies pulled **eagerly on
  `loadingFinished`**, 64 KB cap, binary omitted, SSE/WebSocket metadata-only.

- [Does the video survive, and in what form](issues/08-does-the-video-survive.md) —
  **Yes: full webm, native resolution, 15fps, VP8/Opus, ~1.5 Mbps** (≈11 MB/min).
  Native res because legibility is the point; 15fps because readable beats smooth;
  VP8 because encode CPU competes with the app under test, making codec choice a
  *correctness* question and not a size one. The video is the **un-schema'd
  channel** — the timeline holds what we thought to capture, the video holds what
  we didn't, and every visual bug class is both unrepresentable in JSON and
  unmarked by any event boundary, which is what kills frames-only. A **frame index
  ships alongside it, extracted post-hoc from the finished webm** by one linear
  `requestVideoFrameCallback` pass — so it costs no live `Page.captureScreenshot`
  round-trip, perturbs nothing, and never depends on seek accuracy. One frame per
  event at t+400ms (the effect), plus navigations/errors/failures, JPEG at 1280px
  — note the deliberate asymmetry: video keeps native res, frames downscale,
  because they have different jobs. Video is a per-session toggle, default on.
  Killing video would *not* have broken the clock — stated explicitly so that
  can't masquerade as a reason.

- [Privacy and redaction defaults](issues/05-privacy-and-redaction-defaults.md) —
  Threat model named first: the adversary is **the user's own next action**, since
  the artifact leaves the machine by their hand. So the goal is that the default
  folder is safe to hand over without thinking. Capture-time-vs-review-time is a
  false choice — it conflates *when redaction runs* with *whether the raw
  persists*; answer is **redact in memory before serialization, raw never hits
  disk**, and the usual cost of that evaporates under **shape-preserving
  redaction** (`"[redacted: 32-char hex]"` keeps the field, the fact it was
  populated, and its well-formedness). **Typed values off by default** with a
  shape descriptor and one toggle — asymmetric harm: a missed heuristic leaks a
  credential silently and irreversibly, the safe default merely costs a re-record.
  Detection layers `autocomplete` tokens (standardised, checked first), name/label
  patterns, and **value-shape scanning**, which is the only layer that catches a
  secret pasted into an unlabelled field. Headers redacted by name+pattern — and
  **URLs get the same treatment**, the forgotten leak vector, via one shared
  normaliser since URLs appear in navigation, network rows *and* `Referer`. No
  origin allowlist (friction on a safety mechanism is how it gets disabled). **No
  persistent content script and no `<all_urls>`** — `activeTab` + programmatic
  injection, with `registerContentScripts` covering `document_start` for the rest
  of the session. Pixels get **no** automatic redaction, said plainly rather than
  faked. Session writes directly, carrying a **redaction summary** that reports
  its own risk; a real pre-export gate stays fog.

- [The artifact contract: folder layout and timeline schema](issues/09-the-artifact-contract.md) —
  **The product.** Hand-authored a real example session at
  [`prototype/2026-08-20T14-32-09_app-simplerdev-com/`](prototype/2026-08-20T14-32-09_app-simplerdev-com/)
  (SD portal editor, Save returns 500) and reacted to it. Surfaced the rule that
  had already been decided three times without being named: **one source of truth,
  many derived views, zero interpretation** — webm→frames, timeline→report,
  Whisper segments→both `.srt` *and* inlined `speech` events. A derived view is
  safe to materialise precisely because it cannot drift. `timeline.json` is
  **flat, time-ordered, discriminated by `type`**, wrapped in an object so it
  carries `schemaVersion`/`t0Epoch` and stays self-describing read alone. Two
  field corrections found only by writing real events: common `url` had to become
  **`pageUrl`** (it collided with network's own `url`), and **`tEnd` is not
  network-specific — events are intervals, not instants**. Folder name is
  deliberately **colon-free** for Windows. `report.md` **is** generated, but
  strictly deterministically with no model — the consuming agent brings the
  narrative, the report brings the facts. Reading it cold proved the response
  body *is* the entire diagnosis (console said `Failed to save post`; the 500 body
  named the missing column), so 06's eager-body rule is the highest-value byte in
  the folder. Also proved 08: the narration's *"still in the saving state"* has no
  event that can represent it — only the frame does.

- [How artifacts reach disk](issues/10-how-artifacts-reach-disk.md) —
  **File System Access API primary, single-`.zip` `chrome.downloads` fallback.**
  The deciding argument is **memory, not aesthetics**: `chrome.downloads` holds
  every `MediaRecorder` chunk in RAM until stop (~170 MB / 15 min, ~350 MB / 30),
  while FSA's `createWritable()` streams chunks straight to disk at record time.
  Secondary but real: `conflictAction: 'uniquify'` would append ` (1)` and
  **silently invalidate every `frame` path in `timeline.json`** — correctness, not
  ugliness. The fallback exists for **enterprise policy**
  (`DefaultFileSystemWriteGuardSetting` can block FSA outright), is memory-bound,
  and is documented as a degraded mode. No default path — the user picks once.
  Handle persists via IndexedDB; expect ~one re-grant click per browser restart,
  **flagged unverified** because confirming it needs a native OS dialog Playwright
  cannot drive. Offscreen doc reads the handle from IndexedDB rather than through
  `sendMessage` (JSON-serialized, handles cannot travel).

- [How a coding agent consumes a session](issues/11-how-an-agent-consumes-a-session.md) —
  **Ship an MCP server**, as a strictly optional consumption layer. Recommendation
  had been files-only; the token argument carried it (a 15-min session's raw
  timeline is ~50k tokens). Made compatible with 03/07 by splitting the install
  story: **recording** needs only the extension, no runtime, no network;
  **querying** is `npx -y video-qa-mcp` in a config block. That is legitimately
  additive where the whisper.cpp sidecar was not — it was required to *produce*
  the artifact, needed a compiler, and had no macOS binary. Hard constraint: files
  must keep working standalone. Four tools (`sessions_list`, `session_report`,
  `session_query`, `session_frame`), **read-only**, with session ids resolved
  against the directory listing rather than concatenated — `../` is the obvious
  escape once a session folder is shared. Papercut recorded: `showDirectoryPicker`
  never exposes an absolute path, so the extension cannot tell the server where
  sessions live and the user states it twice. No skill ships — a format needing a
  manual is a format that is wrong.

- [Where the code lives, what it is called, how it is licensed](issues/01-where-the-code-lives.md) —
  **`SimplerDevelopment/bugcast`, MIT.** Its own repo, not a monorepo directory: a
  contributor would otherwise clone a 357k-line SaaS platform and inherit CI,
  dependency-cruiser boundaries, a file-size budget and a ~10-min pre-push
  typecheck built for other constraints — and the project now houses **two**
  publishable artifacts with independent cadences (Web Store listing + npm package
  from 11). The monorepo's only real argument dissolves rather than losing:
  **copying `extension/`'s scaffold never required co-location.** Name verified
  free on npm at decision time; discoverability is handled by the listing title
  ("Bugcast — Video QA Recorder") rather than by a long package name. MIT because
  the Apache patent argument is thin for documented browser APIs plus an
  off-the-shelf model — and **no copyleft anywhere** in the dependency set
  (transformers.js is Apache-2.0, weights MIT/Apache), so nothing forces a change
  later. **Ledger is the new repo's GitHub issues** — CLAUDE.md's off-ledger rule
  is scoped to *this* repo, and an OSS project whose tracker strangers cannot see
  is broken by construction — plus one `PUX-###` card on 153 for visibility. The
  map and its 13 tickets ship with the repo as design documentation: every
  decision *and its rejected alternatives*, including the wrong ones.

- [Install and distribution across macOS, Linux and Windows](issues/12-install-and-distribution.md) —
  **Release zip on day one, Store submission in parallel** — the launch is never
  gated on a review nobody controls, and `chrome.debugger` + tab capture + mic is
  close to the exact profile reviewers scrutinise hardest (05 helps by removing
  `<all_urls>`, but does not make review predictable). The zip is permanent, not a
  stopgap: enterprise-blocked users, audit-before-you-trust users, and any review
  gap. **Four steps to a session, five to agent handoff, and the core path never
  touches a terminal** — the concrete payoff of killing whisper.cpp in 03, and a
  property to defend in future changes. Windows: colon-free folder name already
  handled (09), `.srt` must be **CRLF**, and the MCP server is the *only*
  component that builds paths as strings — the extension holds FSA handles, not
  strings, which deletes the whole bug class from the larger component. Version
  drift detected via 09's `schemaVersion`: the MCP server **refuses loudly** on an
  unknown version rather than best-effort parsing, and both artifacts ship from
  one git tag. **Four-check self-test** (CDP / capture / disk / ASR-on-a-bundled-
  clip) after first run, because every subsystem fails *quietly* — the ASR check
  earns its place and incidentally settles the WebGPU-vs-WASM question on real
  hardware.

## Not yet specified

- **Which transcription backend is actually faster here.** One primary benchmark
  found WASM beating WebGPU for Whisper, contradicting vendor claims. Must be
  measured inside a real MV3 offscreen document before release. **Now has a home:**
  ticket 12's first-run self-test runs the model against a bundled clip, which is
  the first real measurement on that machine.
- **`chrome.tabCapture` frame cadence on a static page.** tabCapture is
  paint-driven, so a static page delivers sparse frames. Spike 13 removed the
  frame-0-as-anchor worry (anchor on `Date.now()` at `start()`), and 08's frame
  index no longer depends on seeking — but whether the webm's own timeline tracks
  wall-clock, i.e. whether a *human* seeking to "2:14" lands where the timeline
  says, is still untested. Cheap spike.

- **The recording UX itself.** Popup vs side panel vs keyboard shortcut; how you
  start/stop; whether you can drop a marker mid-session ("this is the bug") that
  lands in the timeline. **Unblocked** — ticket 06 settled the mechanism; free to
  graduate to a ticket whenever it is worth one.
- **Multi-tab and multi-window sessions.** What happens when QA opens a link in a
  new tab, or the flow spans an OAuth popup. Debugger attachment is per-target, and
  06 already requires `Target.setAutoAttach` for workers — whether that same flow
  also carries new tabs is untested.
- **Session storage, size, and retention.** ~170 MB of webm plus ~20 MB of frames
  per 15-minute session (08). Largely answered by 10: the user owns the directory
  they picked, and nothing in the tool deletes anything. What remains is whether
  the tool should *warn* as a directory grows.
- **Post-session review before handoff.** Sharpened by 05 into a concrete upgrade
  path: a pre-export gate that would *replace* the redaction summary, and which is
  the only thing that actually stops a leak rather than reporting it afterwards.
  Also covers trimming and annotating. Deliberately not built for v1.
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
