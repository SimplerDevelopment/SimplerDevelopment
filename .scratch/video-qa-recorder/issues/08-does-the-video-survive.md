# Does the video survive, and in what form?

Type: grilling
Status: resolved

## Question

The stated consumer is a coding agent, and an agent reads SRT and JSON, not
pixels. The video is also by far the most expensive artifact — encode time, disk,
and the only reason `tabCapture`/`getDisplayMedia` permissions are needed at all.

- **Keep the full webm, keep only frames at event boundaries, or drop video
  entirely?** A frame captured at each click is a fraction of the size and is
  something a multimodal agent can actually look at.
- Who is the video *for* — the agent, a human reviewing the bug later, or the
  person who recorded it proving what they saw?
- If frames only: at what events, at what resolution, and does that lose the
  "watch the bug happen" value that makes screen recording worth doing?
- If full video: resolution/bitrate defaults, and does it get referenced from the
  timeline by timestamp so an agent can tell a human "watch from 2:14"?
- Does the answer change if the video is cheap to keep but simply never read?

Note this is decidable independently of the capture and transcription branches,
but it constrains the artifact contract.

## Answer

**Keep the full webm at native resolution, 15fps, VP8 — and ship a frame index
alongside it, extracted post-hoc from that webm rather than captured live.**

---

### 1. Why the video survives

The video is the **un-schema'd channel**. The event timeline records what we
thought to record; the video records what we did not. Every visual bug class —
layout breakage, a spinner that never resolves, flash of unstyled content,
z-index stacking, an animation that stutters — is simultaneously
*unrepresentable in JSON* and *unmarked by any event boundary*. So a
frames-only artifact is blind to precisely the cases video exists to catch,
and the timeline cannot cover for it.

**Who it is for, ranked:**

1. **The human reviewing the bug.** Primary. "It looked wrong" has no JSON form.
2. **The person who recorded it, proving what they saw.** Real and underrated —
   a QA report that carries its own evidence does not get argued with.
3. **The agent.** Tertiary *today*, but the direction of travel: multimodal
   agents read frames now. Design for it (timestamp indexing, frame index)
   without pretending it is the present use.

**"Does the answer change if the video is cheap to keep but never read?"** —
yes, and it argues for keeping it. The cost of keeping is bounded and known
(disk). The cost of not having it on the one session where the bug was visual
is the entire session, re-recorded, if the bug even reproduces.

**Killing video would not have broken the clock.** Stated explicitly because
tickets 04 and 07 built the design around a single `MediaRecorder`, and that
could be mistaken for a dependency: `t0 = Date.now()` sampled at `start()`
works identically for an audio-only recorder. The clock is not an argument for
video, and should not be allowed to masquerade as one.

### 2. Capture defaults

| Setting | Value | Why |
|---|---|---|
| Resolution | **native** (no downscale) | Legibility is the whole point — "what did the error message actually say". Any downscale mushes small text on a 1920 viewport. |
| Frame rate | **15 fps** | For QA, readable beats smooth. Halves the data vs 30. Skew implication: one frame interval ≈ 66 ms, still far inside the ±250 ms budget (spike 13). |
| Video codec | **VP8** | Markedly cheaper on CPU than VP9. Encode competes with the app under test, so this is a *correctness* choice, not a size one — a saturated core changes the timing of the thing being measured. |
| Audio codec | **Opus** | From the AudioContext tee (ticket 07). |
| Bitrate | **~1.5 Mbps** | ≈ 11 MB/min; a 15-minute session lands near 170 MB. |
| Container | `video/webm;codecs=vp8,opus` | Gate on `MediaRecorder.isTypeSupported()` at startup and fail loudly, not silently, if unsupported. |

**One per-session toggle, default on.** Some sessions are only chasing a
network bug. A boolean is cheap; a second capture architecture is not.

### 3. The frame index — post-hoc, not live

The frame index is browsable by eye, hands a multimodal agent pixels without
asking it to decode video, and makes the artifact folder legible on its own.
It does **not** need to be captured during the session to do any of that.

**How:** when recording stops, play the finished webm once at high
`playbackRate`, muted, and use **`video.requestVideoFrameCallback`** — whose
`metadata.mediaTime` gives each frame's exact position — drawing to a canvas
whenever a wanted timestamp passes. One linear pass. ~30 lines.

This buys three things over capturing live:

- **No `Page.captureScreenshot` round-trip per event**, so nothing perturbs the
  timing of the session being measured. This was the only real objection to the
  index and it is fully avoidable.
- **No dependency on seek accuracy**, which is exactly the `tabCapture`-cadence
  question still marked unverified. A linear pass never seeks.
- **No second capture path to build or keep correct.** The webm remains the sole
  ground truth; the index is a derived view that happens to be materialised.

**Which frames:** one per event, taken at **t + 400 ms** — the *effect*, which
is what you want to look at. Plus a frame at every navigation, every console
error, and every failed request, since those have no interaction to hang off.
*`ponytail:` one frame, not a before/after pair — the "before" state is almost
always the previous event's after-frame. Add the pair if real artifacts prove
otherwise.* Events within 250 ms of each other share a frame.

**Frame encoding:** JPEG q≈0.8, downscaled to **1280 px long edge** — ≈100 KB
each, so ~200 events ≈ 20 MB. Note the deliberate asymmetry: the *video* keeps
native resolution and the *frames* downscale, because they have different jobs.
The video is read for detail; frames are read for glanceability, and multimodal
agents resize to roughly this range anyway. JPEG over WebP purely for
universality — an artifact meant to be handed around should open anywhere.

**Cap total frames at ~300**; past that, keep only navigations, errors and
failed requests. A pathological session should not write five thousand JPEGs.

### 4. Timeline indexing

Every event carries its offset from `t0`, which is the same offset that indexes
into the webm — so "watch from 02:14.320" works for a human, and an agent can
name a moment precisely. Events additionally reference their extracted frame by
path. Exact field names and the `frames/` layout belong to ticket 09.

---

### Consequences for other tickets

- **09 (artifact contract)** — gains a `frames/` directory and a per-event frame
  reference. Now **unblocked except for 05**.
- **10 (how artifacts reach disk)** — materially affected, and this is the
  sharpest consequence. The payload is now hundreds of MB *plus* a few hundred
  small files. Writing 200 individual JPEGs through `chrome.downloads` means 200
  entries in the download shelf and 200 user-visible files landing in
  `~/Downloads`. That pushes 10 hard toward the **File System Access API**.
- **05 (privacy)** — inherits frames as well as video. A frame is exactly as
  unredactable as the video it came from. Partly defused by `tabCapture`
  capturing only the tab (no other tabs, no OS notifications), but the tab
  itself may show PII, and neither artifact can be scrubbed field-wise the way
  JSON can.
- **06** — the deliberately-skipped `scroll` event stays skipped; it was
  contingent on video dying, and video lived.
- **Fog: session storage and retention** — sharpened, not resolved. ~170 MB of
  webm plus ~20 MB of frames per 15-minute session makes retention a real
  question rather than a theoretical one.

### Still unverified (carried to fog, not blocking)

`chrome.tabCapture` is paint-driven, so a mostly-static page delivers sparse
frames. Whether the resulting webm's own timeline still tracks wall-clock —
i.e. whether "seek to 2:14" lands where the timeline says it should — is
untested. The frame index no longer depends on it (linear pass, no seeking),
but *human* seeking does. Cheap spike; not a blocker.
