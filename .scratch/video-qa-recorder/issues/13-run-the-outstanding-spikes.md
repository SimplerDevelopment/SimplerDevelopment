# Run the outstanding spikes against a real browser

Type: task
Status: resolved

## Question

Nothing to decide here — this is the manual work that three resolved research
tickets left behind. Each spike is already specified step-by-step in its source
ticket; this ticket exists because two decisions are blocked until they are run,
and because none of them can be settled from documentation.

From [02 What each capture mechanism can actually deliver](02-what-each-capture-mechanism-delivers.md):

1. Can `Network.getResponseBody` retrieve a body for a **CORS-blocked request or
   a failed preflight**? Evidence conflicts.
2. Is a **CSP violation** (`securitypolicyviolation`) visible to an isolated-world
   content script, given they share the DOM?
3. Are **service worker** targets visible by default, or only after
   `Target.setAutoAttach`?
4. How fast does the CDP network buffer actually **evict** bodies, and does
   `Network.configureDurableMessages` fix it across a navigation?

From [04 Clock sources, and how to normalize them](04-clock-sources-and-normalization.md):

5. **The dominant error term.** Record an on-screen millisecond clock; compare the
   value visible in frame 0 against the `Date.now()` sampled at
   `MediaRecorder.start()`. Establishes real t0 skew — believed 50–150ms, unverified.

From [03 Local transcription: the real cost of each engine](03-local-transcription-real-costs.md):

6. **WebGPU vs WASM on this machine**, for ~10 minutes of narration, at the model
   tier we intend to default to. One primary source found WASM *beating* WebGPU,
   contradicting vendor claims — so the default must be measured, not assumed.

Resolved when each has a recorded yes/no/number. The answers get appended here and
the source tickets get a pointer back.

## Answer

All run 2026-08-20 against Playwright Chromium 1.61 (headless) + ffmpeg 8.1.2 on
macOS. Scripts are in `../spikes/`; re-runnable with `node .scratch/video-qa-recorder/spikes/<name>.mjs`
from the repo root.

### 1. CORS-blocked and preflight-denied bodies — CONFIRMED: not retrievable

A cross-origin `fetch` to an endpoint with no `Access-Control-Allow-Origin`
surfaces as `Network.loadingFailed` / `net::ERR_FAILED`, and
`getResponseBody` returns **"No data found for resource with given
identifier"**. A `PUT` with a custom header whose preflight is refused produces
*two* entries: the failed PUT (no body), and the `OPTIONS` preflight itself,
which appears as `status=403 phase=finished` — and whose body is *still* not
retrievable ("No resource with given identifier found").

Control: 404 and 500 responses **with** `ACAO` returned their bodies fine
(`OK len=15`), as did a 600KB 200.

**Consequence:** "failed network call responses" can only ever mean 4xx/5xx
bodies the page was allowed to read. CORS and connection-level failures are
metadata-only.

**Mitigation found:** `Log.entryAdded` carries the full human-readable
diagnosis — `"Access to fetch at 'http://localhost:8902/nocors' from origin
'http://localhost:8901' has been blocked by CORS policy…"`. For a QA artifact
that is arguably *more* useful than the body would have been. Capture it.

### 2. CSP violations — superseded, not spiked as written

The original question (can an isolated-world content script see
`securitypolicyviolation`?) is moot now that CDP is the mandatory backbone.
CDP reports it directly: `Log.entryAdded` fired with
`source: "security", level: "error"`, text `"Executing inline script violates
the following Content Security Policy directive 'script-src…'"`. No
content-script path needed.

### 3. Service workers — CONFIRMED: invisible by default

A service worker's own `fetch('/SW_ORIGINATED_PING')` **never appeared** on the
page's CDP session. The only URL seen was the document itself — `/sw.js` did not
even show up. After `Target.setAutoAttach({autoAttach: true, flatten: true})`,
the worker attached as `service_worker:http://localhost:8903/sw.js`.

**Consequence:** worker traffic requires per-target attach plus `Network.enable`
on each attached target. Not free, and easy to ship without noticing — a QA
session against a PWA or anything using a SW fetch handler would silently
under-report.

### 4. Body lifetime across navigation — CONFIRMED, and worse than expected

`Network.configureDurableMessages({enabled: true})` was **ACCEPTED** (the command
exists and does not throw). It made no difference: after a single
`page.goto()`, **every** body — including the ones that had just read back
successfully — failed with "No resource with given identifier found". The 600KB
response and the 15-byte responses died alike, so this is not buffer-size
eviction; it is per-navigation teardown.

**Consequence — the most important build constraint found so far:** response
bodies must be pulled **eagerly, on `Network.loadingFinished`**, and buffered by
the recorder. A design that walks the request list at stop-time and fetches
bodies then will return an artifact with every body missing, and will do so
*silently*. This directly feeds the privacy ticket too: eager capture means the
bodies exist in memory for the whole session.

### 5. MediaRecorder t0 skew — CONFIRMED, and much smaller than feared

Method: paint `Date.now()` into a canvas every rAF, `captureStream(fps)`, record,
extract frame 0 with ffmpeg, read the painted value, compare against `Date.now()`
sampled synchronously at `rec.start()`. Six trials:

| fps | frame 0 | `rec.start()` | skew |
|---|---|---|---|
| 30 | 1787251113701 | ...750 | −49 ms |
| 30 | 1787251116185 | ...206 | −21 ms |
| 30 | 1787251118601 | ...634 | −33 ms |
| 60 | 1787251121052 | ...056 | −4 ms |
| 60 | 1787251123484 | ...490 | −6 ms |
| 60 | 1787251125918 | ...921 | −3 ms |

Chrome does emit a frame from *before* `start()`, confirming mediacapture-record
#208 — but the magnitude is **one frame interval**, not the ~140 ms the reporter
measured. It is the age of the most recently captured frame at `start()`.

`BlobEvent.timecode` was `0` for the first blob, as the spec requires, so it
provides no absolute anchor. Confirmed.

**Consequence:** at 60fps the skew is ~5 ms and can be ignored; at 30fps ~35 ms,
still far inside the ±250 ms threshold ticket 04 set as invisible.

**Caveat, and it matters:** this used `canvas.captureStream`, which produces
frames continuously. `chrome.tabCapture` is driven by page *paints* — on a static
page it may go a long time between frames, so "the most recent frame" could be
seconds stale. The skew is bounded by the source's frame interval, and
tabCapture's interval is not fixed. Verify against real `tabCapture` before
trusting frame 0 as a time anchor; the safe design anchors on `Date.now()` at
`start()` and treats frame 0 as untrusted.

### 6. WebGPU vs WASM benchmark — DEFERRED, deliberately

Not run. Ticket 03 already settled the *architecture* question (in-extension,
because whisper.cpp ships no macOS CLI binary), and this benchmark only tunes a
**default** — which engine backend to prefer — that can be flipped in one line.
Measuring it in a synthetic Playwright rig would need a model download, WebGPU
flags, and a headed browser, and would still not measure the thing we care about:
throughput inside a real MV3 offscreen document. Cheaper and more honest to
measure it in the actual extension once one exists.

**Do not let this be forgotten:** the one primary benchmark found had WASM
*beating* WebGPU for Whisper, so the default must be measured before release,
not assumed. Carried forward as fog on the map.

### Bonus finding — the timebase trap is worse than documented

Measured live in the same run. **Three** different units are in play, not two:

```
Network.responseReceived.timestamp : 92519.3109          monotonic SECONDS
Network.requestWillBeSent.wallTime : 1787251018.083095   epoch SECONDS
Runtime.consoleAPICalled.timestamp : 1787251018333.788   epoch MILLISECONDS
Log.entryAdded.timestamp           : 1787251018259.806   epoch MILLISECONDS
Date.now()                         : 1787251019507       epoch MILLISECONDS
```

`wallTime` is epoch **seconds** while `Runtime`/`Log` are epoch **milliseconds** —
a 1000× error waiting to happen, in adjacent fields of the same protocol. Ticket
04's normalization rule holds, but the conversion must multiply `wallTime` by
1000 before differencing. Worth a named helper and a unit test on day one.
