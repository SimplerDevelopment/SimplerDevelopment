# Clock sources, and how to normalize them to one timeline

Type: research
Status: resolved

## Question

The correlated timeline is the entire product, and it is worthless if the three
clocks drift apart. Establish precisely:

- What timebase do CDP events use? `Network.responseReceived` carries a
  monotonic `timestamp` and a separate `wallTime`; `Runtime.consoleAPICalled`
  carries a different one. Confirm which is which and how they relate to
  `performance.timeOrigin`.
- What timestamps does `MediaRecorder` actually give, and when does `t=0` for the
  produced webm really begin relative to the `start()` call?
- Whisper SRT offsets are relative to the start of the audio buffer — establish
  the offset between "mic capture started" and "video recording started", and
  whether they can be made to share an origin.
- Does content-script event time (`event.timeStamp`, `performance.now()`) share
  an origin with CDP's monotonic clock across processes? Cross-frame and
  cross-origin iframes have separate time origins.
- What accuracy is good enough? A ±250ms skew is invisible in a bug report; a
  ±2s skew attributes a console error to the wrong click.

Deliverable: a stated normalization rule — the single `t0` definition every
event, subtitle cue, and video frame maps onto.

## Answer

### Recommended normalization rule (RECOMMENDATION — synthesis, not a spec fact)

**`t0` = epoch-ms (Unix time, UTC) captured via `Date.now()` in the same synchronous
call that invokes `MediaRecorder.start()`** on the tab-video recorder (offscreen
doc / background context). Everything else is expressed as
`t_ms = source_epoch_ms - t0` (integer ms, may be negative for pre-recording
network activity — don't clamp).

Per-source conversion to epoch-ms:

| Source | Formula | Notes |
|---|---|---|
| CDP `Network.*` (`requestWillBeSent`, `responseReceived`, `loadingFailed`, `dataReceived`, …) | Capture `offset_s = wallTime − timestamp` once from the first `requestWillBeSent` in the session. For every later Network event: `epoch_ms = (timestamp + offset_s) × 1000` | Only `requestWillBeSent` carries `wallTime`; every other Network event is `MonotonicTime`-only and must reuse the stored offset |
| CDP `Runtime.consoleAPICalled` / `Log.entryAdded` | `epoch_ms = event.timestamp` | Already epoch-ms — no conversion |
| MediaRecorder video frame | `epoch_ms = t0 + frame_presentation_time_ms` | Presentation time is already "ms since recorder start" by construction; `t0` itself carries the dominant error (see table below) |
| Whisper SRT cue | `epoch_ms = t0 + cue_offset_ms` **iff** the audio track Whisper transcribed is the audio track of the *same* `MediaRecorder` that produced the video (recommended design, Q3). Otherwise a separately-measured `audio_t0_offset` must be added — do not assume 0 | Single-recorder design makes AV-relative error small even though the absolute anchor to wall-clock is uncertain |
| Content-script DOM event (`event.timeStamp`) | `epoch_ms = performance.timeOrigin + event.timeStamp` (both are already DOMHighResTimeStamp ms), computed **per frame/context** | Each document/iframe has its own `timeOrigin`; convert in the frame that captured the event, then send the epoch-ms number up — never compare raw `event.timeStamp` across frames |

The rule routes every source through **epoch-ms** rather than trying to align
raw monotonic clocks directly, because (a) CDP's `Runtime.Timestamp` already is
epoch-ms, (b) CDP's `Network` `MonotonicTime` converts to epoch-ms via the
documented `wallTime` trick, and (c) content-script time converts to epoch-ms
via `performance.timeOrigin`. No primary source confirms CDP's monotonic clock
and a renderer's `performance.now()` are literally the same clock instance
(see Q1/Q4) — epoch-ms sidesteps that open question entirely.

### Q1 — CDP timebases

- `Network.requestWillBeSent.timestamp` and `Network.responseReceived.timestamp`
  are type `MonotonicTime` = **"Monotonically increasing time in seconds since
  an arbitrary point in the past."** CONFIRMED —
  https://chromedevtools.github.io/devtools-protocol/tot/Network/
- `Network.requestWillBeSent.wallTime` is type `TimeSinceEpoch` = **"UTC time
  in seconds, counted from January 1, 1970."** CONFIRMED — same URL.
  `responseReceived` has **no** `wallTime` field. CONFIRMED — same URL.
- `Network.loadingFailed.timestamp` is `MonotonicTime`, no `wallTime` field
  (verified directly — this is the "failed network calls" case named in the
  ticket). CONFIRMED — https://chromedevtools.github.io/devtools-protocol/tot/Network/#event-loadingFailed
- `Runtime.consoleAPICalled.timestamp` and `Log.entryAdded`'s `LogEntry.timestamp`
  are both type `Runtime.Timestamp` = **"Number of milliseconds since epoch."**
  — i.e. epoch-ms, not monotonic. CONFIRMED —
  https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#type-Timestamp
  and https://chromedevtools.github.io/devtools-protocol/tot/Log/#type-LogEntry
- **The standard `wallTime − timestamp` offset trick**: capture the offset once
  from any event carrying both fields (in practice only `requestWillBeSent`),
  reuse that constant to convert every other `MonotonicTime` event in the same
  debugger session: `epoch = timestamp + offset`. This is the practice Chrome
  DevTools engineers describe when discussing devtools-frontend's
  `NetworkRequest.js` timestamp normalization. CONFIRMED (practice exists) —
  https://groups.google.com/g/chrome-debugging-protocol/c/FofPysNnHx4 ; the
  exact formula is a direct, mechanical consequence of the two type
  definitions above, not a separately-published formula.
- **Caveat (follows directly from the type definitions, CONFIRMED by
  construction):** `MonotonicTime` is immune to system-clock adjustment;
  `TimeSinceEpoch`/`wallTime` is a true wall-clock read and **can jump** if the
  OS clock is NTP-corrected mid-session. An offset captured early in a long
  recording can go stale. `Runtime.Timestamp` (epoch-ms) has no such offset
  step — it's a direct wall-clock read at call time, so it doesn't share this
  failure mode, but it does share the "OS clock jumped" one.
- **Relation to `performance.timeOrigin`:** UNVERIFIED as a directly-documented
  fact. There's strong circumstantial evidence Blink's network timing is
  `TimeTicks`-based (a 2011 Chromium changelist "Use a monotonic clock
  (TimeTicks) to report network times to WebCore" —
  https://codereview.chromium.org/7602023/), and `performance.now()` is also
  ultimately `TimeTicks`-derived, but no primary source states CDP's `Network`
  `MonotonicTime` and a specific renderer's `performance.now()` share one
  literal clock instance/origin across the browser-process ↔ renderer-process
  boundary. Chromium's own time-safety doc only confirms `TimeTicks` "may have
  come from several different clocks" without resolving cross-process identity
  (https://www.chromium.org/developers/design-documents/time-safety-and-readability/).
  **This is why the recommended rule avoids relying on it** — see Q5 spike #5.

### Q2 — `MediaRecorder` t=0

- The `start()` algorithm in the MediaStream Recording spec does not define a
  named "recording start time" / origin timestamp, and does not guarantee
  captured data begins exactly at the `start()` call. CONFIRMED —
  https://w3c.github.io/mediacapture-record/
- `BlobEvent.timecode`: spec text — **"the `timecode` in the first produced
  `BlobEvent` MUST contain 0. Subsequent `BlobEvent`s' `timecode` contain the
  difference of the timestamp of creation of the first chunk in said
  `BlobEvent` and the timestamp of the first chunk of the first produced
  `BlobEvent`."** It's a `DOMHighResTimeStamp`, but purely **relative** —
  elapsed recording time, not a wall-clock anchor. It cannot by itself answer
  "what epoch time did t=0 occur at." CONFIRMED —
  https://developer.mozilla.org/en-US/docs/Web/API/BlobEvent/timecode and spec
  text above.
- `timecode` browser support: Chrome 57+ (current Chrome: yes), Edge 79+,
  Safari 14.1+; **not supported in any Firefox version**. CONFIRMED —
  https://caniuse.com/mdn-api_blobevent_timecode
- **Real, reported lag before `start()`:** a detailed W3C spec-repo issue
  states Chrome's `MediaRecorder` can deliver "data supplied in the blob
  [that] contains data from BEFORE the media recorder is told to start
  (usually 140ms worth)," and that there is "no way of knowing how much data
  is sitting in a buffer" from the API alone. CONFIRMED that the phenomenon and
  issue exist and the quote is accurate — https://github.com/w3c/mediacapture-record/issues/208.
  The **"140ms" figure is that one reporter's own measurement on their own
  machine/config, not a documented Chrome guarantee** — treat it as
  evidence the pre-buffer is on the order of 100ms+, not as a constant to code
  against. UNVERIFIED as a hard number; needs a spike on your target
  environment.
- `timeslice`-based `dataavailable` firing is explicitly documented as
  imprecise: **"timeslice is not exact and the real intervals may be delayed
  due to other pending tasks... don't rely on timeslice and the number of
  chunks received to calculate the time elapsed."** MDN recommends keeping a
  separate wall-clock timer instead. CONFIRMED —
  https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event
- Practical anchor (RECOMMENDATION, not spec-guaranteed): sample `Date.now()`
  synchronously alongside the `MediaRecorder.start()` call and treat that as
  `t0`. The true first frame may be up to roughly 100–150ms earlier (per the
  reported phenomenon above) or later (hardware encoder warm-up) — this
  uncertainty is not resolvable via any documented API; only empirical
  measurement bounds it (spike #1 below).

### Q3 — Audio/video origin alignment

- **Recommended design:** combine mic (`getUserMedia`) and tab audio
  (`chrome.tabCapture`/`getDisplayMedia`) into one mixed audio track via a
  shared `AudioContext` (`createMediaStreamSource` × 2 → merge →
  `MediaStreamAudioDestinationNode`), `addTrack` that onto the video
  `MediaStream`, and record **one `MediaRecorder`**. This is the documented
  pattern for tab-audio capture in the first place — `chrome.tabCapture`
  **mutes the tab** unless its audio is routed through an `AudioContext` back
  to `destination`, so an `AudioContext` mixing step is required regardless.
  CONFIRMED (pattern + the muting requirement) —
  https://developer.chrome.com/docs/extensions/reference/api/tabCapture ,
  corroborated by multiple reference implementations (e.g.
  https://github.com/addpipe/getDisplayMedia-demo).
- With this design, Whisper's "start of the audio buffer" and the video's
  frame-0 both derive from the **same recorder's t0** — eliminating a whole
  class of cross-recorder offset. **However**, Chromium's implementation still
  runs independent `VideoTrackRecorder` and `AudioTrackRecorder` objects,
  muxed by a `MediaRecorderHandler` — the spec and Chromium's own module
  README do not document or quantify how tightly these two per-track encoder
  paths stay in sync inside one recorder. CONFIRMED (architecture exists) —
  https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/modules/mediarecorder/README.md
  ; the actual sync tightness is UNVERIFIED — no source quantifies it (spike #3).
- If mic and tab video are instead captured as **genuinely separate**
  `MediaStream`s recorded by **separate** `MediaRecorder` instances, there is
  no spec text anywhere addressing cross-recorder synchronization (searched
  the mediacapture-record issue tracker directly — issues #4, #147, #208 all
  discuss track-add/remove and single-recorder timing gaps, none address
  multi-recorder alignment). CONFIRMED (absence of coverage) —
  https://github.com/w3c/mediacapture-record/issues . Each recorder
  independently exhibits the Q2 warm-up-lag behavior and the two lags are **not
  correlated** — do not assume simultaneous `start()` calls produce a
  simultaneous t=0.
- `AudioContext.currentTime` runs on the **audio hardware thread's own clock
  domain**, which drifts independently of the system/monotonic clock behind
  `performance.now()` — this is precisely why the Web Audio API ships
  `AudioContext.getOutputTimestamp()`, returning `{contextTime,
  performanceTime}`: `contextTime` "in the same units and origin as
  `AudioContext.currentTime`," `performanceTime` "an **estimation** of the
  moment... in the same units and origin as `performance.now()`." CONFIRMED —
  https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp
  , spec: https://webaudio.github.io/web-audio-api/#dom-audiocontext-getoutputtimestamp
  — note it is specified as an *estimation*, and it's defined in terms of the
  **output** device position; using it to anchor an **input** capture pipeline
  (mic → Whisper) is an inference, not a directly-documented guarantee. If
  audio is captured via an `AudioWorkletProcessor`/`ScriptProcessorNode`, the
  cleaner anchor is reading `performance.now()` synchronously inside the same
  JS callback that receives the audio buffer — no cross-clock-domain
  correlation needed at all. RECOMMENDATION, not a documented API contract.
- Whisper's SRT "start of buffer" is whatever your own code decides to feed
  the model — an implementation choice, not a browser guarantee. Feeding it
  the audio track decoded from the combined single-recorder webm makes its
  uncertainty **identical to, and no worse than**, the video's Q2 uncertainty.

### Q4 — Cross-process/cross-origin time origins

- `performance.timeOrigin` is set per browsing context: a fresh document gets
  its own value at navigation-start; a worker gets its own at creation.
  CONFIRMED — https://developer.mozilla.org/en-US/docs/Web/API/Performance/timeOrigin
- **Consequence for cross-origin iframes:** each iframe is its own
  document/browsing context with its **own** `timeOrigin`. A content script's
  raw `event.timeStamp` from inside an iframe is not directly comparable to
  one from the top frame or a sibling frame without converting each through
  its *own* `performance.timeOrigin` to epoch-ms first. CONFIRMED (direct
  consequence of the per-context `timeOrigin` definition, same source).
  Corroborated on the CDP side: same-process iframes get distinct
  `Runtime.executionContextCreated` contexts; out-of-process iframes (OOPIFs)
  are entirely separate CDP targets requiring
  `Target.setAutoAttach({flatten:true})` to reach. CONFIRMED —
  https://www.chromium.org/developers/design-documents/oop-iframes/ and
  https://github.com/ChromeDevTools/devtools-protocol/issues/72
- **`event.timeStamp` in Chrome today:** `DOMHighResTimeStamp`, "accurate to 5
  microseconds," and — per current spec/MDN — same units and same time origin
  as `performance.now()` **within that document**. So within one
  frame/document, `event.timeStamp` and `performance.now()` are directly
  comparable today. CONFIRMED —
  https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp
- **Does content-script `performance.now()` share an origin with CDP's
  monotonic clock, across the extension/renderer boundary?** UNVERIFIED as a
  hard guarantee — same open question as Q1. The safe answer used by the
  recommended rule: don't compare raw monotonic values across that boundary at
  all; convert both sides to epoch-ms independently (content script via
  `performance.timeOrigin + event.timeStamp`; CDP via the `wallTime` trick or
  direct `Runtime.Timestamp`) and compare epoch-ms.
- **Asymmetry worth flagging, CONFIRMED via spec text:** HR-Time explicitly
  states `timeOrigin`'s epoch value is only an *approximation*: **"The value
  returned by get time origin timestamp is approximately the time after the
  Unix epoch that global's time origin happened... because [it] is recorded
  with respect to a monotonic clock that is not subject to system and user
  clock adjustments."** So content-script-derived epoch-ms is immune to
  mid-session NTP jumps but only *approximately* correct at the origin moment;
  CDP's `wallTime`/`Runtime.Timestamp` are exact OS reads at read-time but
  **can** jump with the system clock. Both are "epoch-ms" but with different
  failure modes. CONFIRMED — https://www.w3.org/TR/hr-time-3/#dom-performance-timeorigin

### Expected residual error (order of magnitude, per source, after normalization)

| Source | Confidence | Expected residual error |
|---|---|---|
| CDP `Runtime`/`Log` (`consoleAPICalled`, `Log.entryAdded`) | High — direct epoch read | sub-ms to a few ms (IPC/scheduling jitter) |
| CDP `Network` (`requestWillBeSent`, `responseReceived`, `loadingFailed`, …) | Medium-High — mechanism confirmed, cross-process clock identity unverified | sub-ms to a few ms typically; can grow across very long recordings if the OS clock is corrected mid-session |
| Content-script DOM event (`event.timeStamp`) | Medium — formula confirmed, exact skew unverified | ~1–5ms typical, plus must be re-derived per frame for iframes |
| MediaRecorder video timeline → `t0` | **Low** — single largest, least-controllable budget item | **~50–150ms** (reported Chrome pre-buffer/warm-up behavior, no documented bound) |
| Whisper SRT cue, single combined-recorder design | Medium — architecture bounds the *relative* error even though absolute anchor is uncertain | same magnitude as video (~50–150ms), but **tightly coupled to** video error, so AV-relative accuracy is good |
| Whisper SRT cue, separate-recorder/stream design | Low — no documented cross-recorder sync guarantee | video error **+ independent** audio warm-up error, potentially ~100–300ms uncorrelated |

All of the above comfortably clear the ticket's stated bar (±250ms invisible,
±2s wrong-click-attribution) **except** the separate-recorder design in a
worst case, which is a concrete argument for the single-combined-recorder
architecture in Q3.

### Spikes still needed (measurement required — do not guess)

1. **MediaRecorder start() → true t=0 lag.** Render a full-screen millisecond
   clock in the tab (updated via `performance.now()`/`requestAnimationFrame`),
   call `MediaRecorder.start()`, capture `Date.now()` at the call site, decode
   the resulting webm, read the on-screen clock value visible in the first
   frame, diff against the captured `Date.now()`. Repeat for `chrome.tabCapture`
   vs `getDisplayMedia`, and for the combined-stream design.
2. **CDP-epoch vs content-script-epoch agreement.** From a content script,
   `console.log()` a marker containing `performance.timeOrigin +
   performance.now()`; capture the corresponding `Runtime.consoleAPICalled`
   event's `timestamp` via `chrome.debugger`; diff. Repeat from top frame,
   same-origin iframe, and cross-origin iframe (OOPIF) to see whether
   cross-process skew is measurable.
3. **Internal A/V mux tightness within one MediaRecorder.** Record a combined
   stream with a synchronized audio "beep" (`AudioContext`-scheduled) and a
   simultaneous on-screen visual flash driven from the same schedule; measure
   the offset between the beep's position and the flash's frame position in
   the decoded output.
4. **Cross-recorder lag, if a separate-recorder design is ever needed.** Start
   two `MediaRecorder`s back-to-back in the same JS turn; repeat spike #1's
   clock-in-frame technique independently for each; diff.
5. **CDP `Network` `MonotonicTime` single-sourced or per-process?** Fire a
   main-frame request and an OOPIF (cross-origin iframe) request from the same
   `Promise.all` at a known instant; compare whether the `wallTime − timestamp`
   offset is identical (within noise) for both. Resolves the open question
   from Q1/Q4.

### Sources

- https://chromedevtools.github.io/devtools-protocol/tot/Network/ (requestWillBeSent, responseReceived, MonotonicTime, TimeSinceEpoch)
- https://chromedevtools.github.io/devtools-protocol/tot/Network/#event-loadingFailed
- https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#event-consoleAPICalled
- https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#type-Timestamp
- https://chromedevtools.github.io/devtools-protocol/tot/Log/#event-entryAdded
- https://groups.google.com/g/chrome-debugging-protocol/c/FofPysNnHx4 (Network timestamp normalization discussion, Paul Irish)
- https://groups.google.com/g/google-chrome-developer-tools/c/AkecL9r9VwE (requestWillBeSent timestamp meaning)
- https://codereview.chromium.org/7602023/ (TimeTicks used for network timing in WebCore, 2011)
- https://www.chromium.org/developers/design-documents/time-safety-and-readability/ (TimeTicks multiple clock sources)
- https://developer.mozilla.org/en-US/docs/Web/API/BlobEvent/timecode
- https://w3c.github.io/mediacapture-record/ (MediaRecorder spec: start() algorithm, BlobEvent.timecode)
- https://caniuse.com/mdn-api_blobevent_timecode
- https://github.com/w3c/mediacapture-record/issues/208 (reported pre-`start()` buffering, ~140ms)
- https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event (timeslice imprecision)
- https://developer.chrome.com/docs/extensions/reference/api/tabCapture (tab audio muting / AudioContext routing requirement)
- https://github.com/addpipe/getDisplayMedia-demo (combined mic+tab audio+video reference implementation)
- https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/modules/mediarecorder/README.md (VideoTrackRecorder/AudioTrackRecorder architecture)
- https://github.com/w3c/mediacapture-record/issues (searched for cross-recorder sync coverage — none found)
- https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp
- https://webaudio.github.io/web-audio-api/#dom-audiocontext-getoutputtimestamp
- https://developer.mozilla.org/en-US/docs/Web/API/Performance/timeOrigin
- https://www.chromium.org/developers/design-documents/oop-iframes/ (OOPIF architecture)
- https://github.com/ChromeDevTools/devtools-protocol/issues/72 (evaluation-in-iframes / execution context model)
- https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp
- https://www.w3.org/TR/hr-time-3/#dom-performance-timeorigin (High Resolution Time Level 3 — timeOrigin as approximation)
