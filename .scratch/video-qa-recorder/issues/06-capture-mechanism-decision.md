# Capture mechanism decision, and what counts as an interaction

Type: grilling
Status: resolved
Blocked by: 02 (resolved)

## Question

With the facts from "What each capture mechanism can actually deliver" in hand,
decide:

- **CDP, content-script, or hybrid** — and if hybrid, which signal comes from
  which source, and what happens when the debugger fails to attach.
- Is the `chrome.debugger` infobar acceptable for a developer tool? (It is
  arguably a *feature*: visible proof the session is being recorded.)
- **What is an interaction?** Clicks certainly. Also: typed input, `change` on
  selects, form submits, scroll, hover, drag, keyboard shortcuts, focus changes?
  Each one added is noise in the timeline unless it earns its place.
- **How is the element identified so an agent can act on it?** Rank the selector
  strategy — `data-testid` > `id` > ARIA role+accessible name > text content >
  nth-child path — and decide what else rides along (tag, visible text, bounding
  box, nearest labelled ancestor).
- Which **failed network calls** qualify: status >= 400, `loadingFailed`,
  timeouts, aborted requests? Are successful requests recorded at all?
- Body truncation limit, and behaviour on binary/streamed responses.

## Answer

**CDP backbone + an isolated-world content script. No MAIN world.** Six
interaction types. Every selector emitted rather than one chosen. Metadata for
every request, bodies only for failures, pulled eagerly.

---

### 1. Mechanism — and a correction to ticket 02

Ticket 02 recommended a hybrid with **MAIN-world** injection as the supplement.
That is more than is needed, and both of its stated reasons dissolve:

- **"MAIN world is needed for click-target semantics."** It is not. Isolated
  worlds get their own JS realm but share the **same DOM tree** — that is the
  precise meaning of "isolated" in 02's own primary source ("cannot access the
  context and variables of the others", i.e. JS state, not the DOM). A content
  script at `document_start` registering
  `window.addEventListener('click', …, {capture: true})` sees every click in
  its frame. Capture phase on `window` is the earliest possible point, and
  because the content script runs before any page script parses, it wins
  registration order — so a page calling `stopPropagation()` cannot hide an
  interaction from it.
- **"MAIN world gives belt-and-suspenders body capture."** It buys nothing.
  CDP retrieves 4xx/5xx bodies reliably (spike 13: `OK len=15`, and `OK
  len=600000` for a 600 KB body). The cases where CDP has no body —
  CORS-blocked, and true `loadingFailed` — are exactly the cases where page JS
  has no body either: a CORS-blocked `fetch` rejects with an opaque
  `TypeError`, carrying nothing to clone.

So MAIN world would cost a CSP-racing injection path in order to duplicate
what already works and to fail in the same places. Dropped.

**Division of labour:**

| Signal | Source |
|---|---|
| Network requests, responses, bodies, failures, CORS/CSP diagnoses | CDP `Network` + `Log` |
| Console output, uncaught exceptions, unhandled rejections | CDP `Runtime` (`consoleAPICalled`, `exceptionThrown`) + `Log.entryAdded` |
| Navigation | CDP `Page.frameNavigated` (+ History API pushState from the content script, which CDP reports only as a frame-level change) |
| Service-worker and web-worker traffic | CDP `Target.setAutoAttach({autoAttach: true, flatten: true})` + per-target `Network.enable` (spike 13: invisible without it) |
| **Which DOM element was interacted with** | **Content script, isolated world, `all_frames: true`** |

CDP cannot supply the last row in usable form. `DOM.getNodeForLocation` costs a
protocol round-trip per click and returns a `backendNodeId`, not semantics.
The `Input` domain synthesizes input, it does not observe it.

`all_frames: true` matters: each frame's content script reports its own
`location.href`, so an interaction inside an iframe is attributable. Relevant
to OAuth popups, embedded checkouts, and this repo's own visual editor.

**Known limit, accepted:** clicks inside a *closed* shadow root retarget to the
host element. `composedPath()` recovers the full path for open shadow roots
only. Closed roots are closed to MAIN world too, so no mechanism choice fixes
this.

### 2. When `chrome.debugger` fails to attach — refuse to start

Most commonly DevTools is already open on that tab; a target accepts one
debugger client. **Refuse to record, with an actionable message** ("DevTools is
attached to this tab — close it and retry").

The reasoning is about the *consumer*, not the user: a session silently missing
network and console cannot be distinguished, by the agent reading it, from a
session where nothing failed. It will confidently conclude the wrong thing.
Failing loudly costs one retry; failing quietly costs a wrong diagnosis.

Rejected alternative — record degraded with `capture: {network: false, …}` in
the manifest. Honest, and ticket 09 may want a capability manifest anyway for
mic-off sessions, but it is strictly more machinery for a worse failure mode.
If 09 introduces that manifest for other reasons, revisit.

### 3. The infobar is the recording indicator, not a cost

Both 02 and the original charting treated `"<Extension> started debugging this
browser"` as a tax. Reframe: a tool that captures your microphone and your
`Authorization` headers **should** display a non-dismissible banner for as long
as it is doing so. Chrome supplies for free the affordance this tool would
otherwise have to build. Settled; not a tradeoff.

### 4. What counts as an interaction — six types

`click`, `keydown` (non-text only), `change`, `submit`, `drag`, `focus`.

- **`click`** — activations. Not `pointerdown`; not `auxclick`.
- **`keydown`, non-text only** — Enter, Escape, Tab, arrows, and modifier
  combos (⌘K, ⌃C). **Never per-character** — that is the noise firehose, and
  the typed *value* arrives via `change` instead.
- **`change`, not `input`** — one event when a field commits, not one per
  keystroke. The captured *value* is deliberately left to ticket 05; this
  ticket only fixes that the event exists and carries element identity.
- **`submit`** — cheap, high-signal.
- **`drag`** — see the gotcha below.
- **`focus`** — see the dedupe rule below.

**Excluded:** `hover` (enormous volume, near-zero information), continuous
`scroll` (the video shows it), `input` per-keystroke. *`ponytail:` scroll is
skipped deliberately — if ticket 08 kills the video, revisit, because without
pixels a debounced scroll position becomes the only way an agent learns a
control was below the fold.*

**Drag — the native-DnD trap.** HTML5 `dragstart`/`drop` fire only for elements
that are natively `draggable`. Practically every modern drag UI — dnd-kit,
react-beautiful-dnd, and this repo's own visual-editor selection/resize
overlays — is built on **pointer events** and dispatches no HTML5 drag events
at all. Listening for native drag events only would therefore have captured
nothing in exactly the cases that motivate capturing drag. So capture **both**:

1. native `dragstart` / `drop`, and
2. a pointer heuristic — `pointerdown` → `pointermove` past a ~5 px threshold →
   `pointerup` — emitted as **one** `drag` event carrying start target, end
   target, and both rects.

One event per gesture, not a pointermove stream.

**Focus — dedupe against click.** `focus` fires on essentially every click, so
unfiltered it doubles the timeline with rows that restate the click. Record a
`focus` event **only when it was not immediately preceded by a click on the
same element**, which leaves precisely the keyboard-driven focus moves — the
tab-order and focus-trap bugs that justify the event at all.

### 5. Element identity — emit every selector, do not rank-then-pick

Ranking picks one and discards what a different consumer needed: a Playwright
agent wants `getByRole`, a human reading the artifact wants the CSS path, a
test author wants the testid. All of them cost ~300 bytes per event together,
which is nothing next to a webm.

```jsonc
"target": {
  "selector": "[data-testid='save-btn']",  // best available
  "selectorKind": "testid",                // testid|id|role|text|css
  "css": "main > form > button.btn.primary:nth-of-type(2)",  // always present
  "role": "button",
  "name": "Save changes",                  // accessible name
  "tag": "button",
  "text": "Save changes",                  // trimmed, capped 120 chars
  "id": null,
  "rect": { "x": 412, "y": 890, "w": 104, "h": 36 },
  "frameUrl": "https://app.example.com/settings"
}
```

Preference order for `selector`: `data-testid` / `data-test` / `data-cy` /
`data-qa` → `id` → role + accessible name → text content → `nth-of-type` path.

`rect` earns its place as the only field tying an event to a video frame (and
so it survives whichever way ticket 08 goes — it is what would let a still
frame be annotated).

**Accessible name** gets the lazy computation: `aria-label` → `aria-labelledby`
→ associated `<label>` → `alt` / `title` / `placeholder` → trimmed text
content. *`ponytail:` ~15 lines covering the overwhelming majority; the AccName
spec is the upgrade path if names come out wrong in practice.*

Skipped: ancestor chain, "nearest labelled ancestor". The accessible-name
computation already absorbs the label case. Add when a real artifact proves an
element unidentifiable without it.

### 6. Which network calls qualify

**Metadata for every request; bodies only for failures.**

Every request gets a small row (~200 bytes): method, URL, resource type,
status, timing, transfer size. Request *count* is itself a QA signal — "that
button fired twelve identical POSTs" is invisible to a failures-only artifact,
as is "the call was never made at all".

**Bodies are fetched only for:**
- `status >= 400` — response body via `getResponseBody`.
- `Network.loadingFailed` — no body exists, ever (02, confirmed by spike 13).
  Record the **diagnosis** instead: `errorText`, `corsErrorStatus`,
  `blockedReason`, plus the matching `Log.entryAdded` line, which spike 13
  found carries the full human-readable CORS explanation — for QA purposes
  better than a body would have been.

**Request `postData` rides along free** for qualifying failures —
`requestWillBeSent` already carries it (or `hasPostData` +
`Network.getRequestPostData`). "The button sent the wrong payload" is a
top-three QA finding and costs nothing extra. Subject to ticket 05's redaction.

**Aborted requests are recorded but not flagged as failures.** `loadingFailed`
covers timeouts (`net::ERR_TIMED_OUT`) and aborts (`net::ERR_ABORTED`)
identically, but navigation cancels in-flight requests and `AbortController`
churn is routine — flagging those would fill the artifact with false positives.
`canceled: true` distinguishes them.

**Rejected:** bodies for same-origin 2xx. It would catch the
200-with-the-wrong-payload bug, which is real and invisible to every other
option — but it drags ticket 05 much wider, since a successful authenticated
API response is the single worst thing to hand to a third-party model.
*`ponytail:` skipped; add via 05's allowlist mechanism if it earns its place.*

### 7. Bodies — eager, capped, no binary, no streams

**Eagerly, on `loadingFinished`, always.** Spike 13 is unambiguous: bodies do
not survive a navigation, and `Network.configureDurableMessages` is *accepted*
but does not help. Deferred or batched retrieval silently ships an artifact
with empty bodies. This is the single most consequential build constraint on
the record.

**64 KB cap**, then `truncated: true` + real `size`. Error bodies are small
JSON or an HTML error page; 64 KB captures essentially all of them, and the
first 64 KB of a stack-trace page is the useful part. The cap is ours, not the
protocol's — spike 13 pulled 600 KB fine.

**Binary is not stored.** `base64Encoded: true`, or a non-text content-type →
`{contentType, size, omitted: "binary"}`. Base64 image bytes tell an agent
nothing and inflate the artifact 4/3×.

**Streams are metadata-only, and this is called out on purpose.**
`loadingFinished` never fires for an open SSE (`text/event-stream`) response,
so the eager-body path simply never runs — a silent non-event that would
otherwise be rediscovered as a mystery. WebSockets use an entirely separate
CDP event family (`webSocketFrameSent`/`Received`) and are **out of scope for
v1**: metadata only.

---

### Consequences for other tickets

- **09 (artifact contract)** — supplies the `target` shape, the six event
  types, and the network row/body split. Now blocked only by 05 and 08.
- **05 (privacy)** — inherits three concrete surfaces to rule on: `change`
  values, request `postData`, and 4xx/5xx response bodies. Also inherits the
  rejected same-origin-2xx option as a possible allowlist feature.
- **08 (video)** — `rect` on every target is the correlation hook, and the
  deliberately-skipped scroll event is the thing to reinstate if the video dies.
- **Fog: recording UX** — was "hangs on the capture-mechanism decision". Now
  unblocked and free to graduate.
- **Fog: multi-tab sessions** — sharpened rather than resolved. Debugger
  attachment is per-target and `Target.setAutoAttach` is already required for
  workers; whether it also carries new tabs is untested.
