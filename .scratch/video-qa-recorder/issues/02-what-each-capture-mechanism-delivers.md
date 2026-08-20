# What each capture mechanism can actually deliver

Type: research
Status: resolved

## Question

Establish the facts that the capture decision waits on. For each of
`chrome.debugger`/CDP, content-script monkeypatching, and a hybrid:

- Can it retrieve **response bodies for failed requests** (4xx/5xx, network
  errors, blocked CORS, failed preflights)? `Network.getResponseBody` has known
  lifetime limits — confirm what survives a navigation.
- Does it capture **page-context** errors, unhandled rejections, and CSP
  violations, or only what a content script's isolated world can see?
- Does it see requests from **service workers, web workers, `sendBeacon`, and
  `<img>`/CSS-initiated** loads?
- What exactly does the `chrome.debugger` infobar say, can the user dismiss it,
  and what breaks if DevTools is already attached to the same tab?
- Which CDP domains and events are actually needed: `Network.requestWillBeSent`,
  `responseReceived`, `loadingFailed`, `Runtime.consoleAPICalled`,
  `Runtime.exceptionThrown`, `Log.entryAdded`, `Page.frameNavigated`.
- Is `chrome.debugger` permitted in a **Chrome Web Store** listing, and what
  review friction does it attract?

Deliverable: a findings note plus a minimum viable throwaway spike proving
response-body capture for a deliberately-failing request.

## Answer

### Recommendation (opinion, not a fact — separated from findings below)

**Hybrid, with `chrome.debugger`/CDP as the backbone, not a peer.** The
decisive fact is in Q2: an **isolated-world** content script's monkeypatch of
`window.fetch` / `window.console` / `XMLHttpRequest` never touches the page's
real calls at all — isolated worlds get their own `window` object, so
patching it patches nothing the page can see (CONFIRMED, Q2). To make
monkeypatching work on the page's actual traffic you must inject into the
**MAIN world**, which immediately re-inherits the page's own CSP and can be
raced by the page's own bootstrap code. Even then, MAIN-world monkeypatching
is structurally blind to service workers, web workers, `sendBeacon`, and any
`<img>`/CSS-initiated load (Q3) — none of those route through a patched
`fetch`/`XHR`. CDP's `Network` domain sees all of them uniformly because it
taps the network stack below JS entirely. So CDP is required regardless of
what else is built; the only open question is what to layer on top of it.

Use content-script injection (MAIN world) as a **supplement**, not a
replacement: (a) it is the only way to get a semantic "which DOM element was
interacted with" signal for the event timeline — CDP gives you network/DOM
protocol primitives, not click-target semantics; (b) for 4xx/5xx responses
specifically, cloning the `Response`/`XHR` body synchronously in page-context
JS is cheaper and immune to CDP's buffer-eviction/lifetime problem (Q1) — use
it as a belt-and-suspenders capture path, not the primary one, since it
shares CDP's blind spot for CORS-blocked/network-level failures. Accept the
Web Store review friction and the debugger infobar (Q3, Q4) as the cost of
the only mechanism that actually delivers uncaught-exception, CSP-violation,
and full network coverage without racing the page's own scripts.

---

### Q1 — Response bodies for FAILED requests

**4xx/5xx (HTTP-level errors): `getResponseBody` works normally.** A 404/500
still completes the request — `Network.responseReceived` fires with a real
status and `Network.loadingFinished` follows — so the body is retrievable
exactly as for a 200. CONFIRMED (architecture, corroborated by
`Network.responseReceived` semantics: "fires when the header of the response
becomes available"):
https://chromedevtools.github.io/devtools-protocol/tot/Network/

**True network-level failures (DNS failure, connection refused/reset,
aborted, blocked-by-client, mixed-content block): no body ever exists to
retrieve.** `Network.loadingFailed` fires *instead of* `responseReceived` —
its schema has no body field — so calling `getResponseBody` on that
`requestId` returns protocol error **-32000, "No resource with given
identifier found"** / "No data found for resource with given identifier."
This is not a bug, it's the expected shape: the browser never received bytes
to buffer. CONFIRMED, corroborated by five independent reports of the same
error on the same trigger:
- https://chromedevtools.github.io/devtools-protocol/tot/Network/#event-loadingFailed (no body param)
- https://github.com/ChromeDevTools/devtools-protocol/issues/64 (error code -32000, "No data found for resource with given identifier")
- https://github.com/mafredri/cdp/issues/42
- https://github.com/chromedp/chromedp/issues/1317
- https://github.com/puppeteer/puppeteer/issues/2258
- https://sentry.io/answers/failed-to-load-response-data-no-data-found-for-resource-with-given-identifier/

**Blocked CORS / failed preflight: UNVERIFIED, evidence conflicts.**
`Network.loadingFailed` has a dedicated `corsErrorStatus` field, implying
CORS failures route through the no-body path like other network failures.
But a real GitHub report claims `getResponseBody` "fails for CORS requests
sometimes" specifically *after* a request appears to complete normally
(preflight fires, then a response is received) — i.e., inconsistent, not a
clean "always no body." Preflight (`OPTIONS`) itself is a distinct tracked
request with its own `requestId` and typically an empty body regardless.
UNVERIFIED: https://github.com/cyrus-and/chrome-remote-interface/issues/148

**Lifetime — does NOT reliably survive navigation.** `Network.enable` takes
`maxResourceBufferSize`/`maxTotalBufferSize` to size an in-memory buffer;
bodies are evicted from this "inspector cache" once the buffer is exceeded,
and by default they are **not** durable across a cross-process navigation.
A separate, newer command — `Network.configureDurableMessages` — exists
specifically to store bodies outside the renderer so they survive
cross-process navigation; without calling it, navigation is a body-loss
event. CONFIRMED:
- https://chromedevtools.github.io/devtools-protocol/tot/Network/ (`Network.enable` buffer params, `Network.configureDurableMessages`)
- https://github.com/puppeteer/puppeteer/issues/6647 ("Request content was evicted from inspector cache")
- https://sentry.io/answers/failed-to-load-response-data-no-data-found-for-resource-with-given-identifier/ (body loss "after multiple page reloads or page navigations")

**Design implication:** call `getResponseBody` **eagerly**, inside the
`responseReceived`/`loadingFailed` handler, and persist to disk immediately —
never defer or batch it for later retrieval, and never assume it survives a
navigation the user's test flow causes.

---

### Q2 — Coverage gaps of the (isolated-world) content-script approach

**Page-context `window.onerror` / unhandled rejections: NOT visible.**
Isolated worlds get a private JS execution environment; the shared surface
is the DOM only. Errors thrown by the page's own scripts fire in the page's
realm, not the content script's — a content script's `window.onerror` never
sees them. CONFIRMED:
https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
("none of these — web page, content scripts, and any running extensions —
can access the context and variables of the others"). Corroborated by a
reported Chromium behavior where content-script `onerror` doesn't reliably
fire for page errors at all, with `try/catch` cited as the practical
workaround: https://forum.sentry.io/t/receiving-too-many-unrelated-errors-from-chrome-extension/4668

**`console`/`fetch`/`XMLHttpRequest` monkeypatching from isolated world: does
nothing to the page's real calls.** Each isolated world gets its own
`window` object; patching `window.fetch`/`console.log` there patches a
binding the page's code never references — the page calls its own realm's
version, untouched. This is the load-bearing finding for the whole
mechanism comparison, not just a coverage footnote. CONFIRMED (isolated
JS state — same primary source as above), corroborated by two technical
write-ups explaining the separate-`window` mechanism and that `world:
"MAIN"` (Manifest V3 `chrome.scripting`) is required to have any effect:
https://kpracuk.dev/articles/accessing-websites-window-object-in-chrome-extension/,
https://www.okeowoaderemi.com/articles/posts/understanding-contentscript-and-executionworld/

**CSP violation reports: UNVERIFIED, but architecture favors visibility.**
`securitypolicyviolation` fires on the `Document` and bubbles to `Window`.
Because isolated worlds share the DOM tree (that is the entire premise of
"isolated," per the primary source above), a content script's
`document.addEventListener('securitypolicyviolation', …)` *should*
architecturally receive page CSP violations even though it can't see JS
state. No primary source explicitly tests this for content scripts
specifically — flagged UNVERIFIED, needs a spike. CDP does not depend on
this either way: `Log.entryAdded` carries a `source` field whose enum
includes `"violation"`, giving CDP an independent, browser-level path to CSP
violations regardless of the DOM-sharing question. CONFIRMED:
https://chromedevtools.github.io/devtools-protocol/tot/Log/#event-entryAdded

---

### Q3 — service workers / web workers / `sendBeacon` / `<img>`, CSS `url()`

**Service workers & dedicated/shared web workers: invisible to any
content-script monkeypatch, isolated or MAIN world.** A worker executes in
its own global scope (`self`, not `window`) — a completely separate realm
that content scripts cannot be injected into at all (Chrome's
`content_scripts`/`chrome.scripting` targets are documents/frames, not
worker contexts). Patching the page's `fetch` has zero effect on a fetch
call made from inside a worker's own script. CDP *can* see worker traffic,
but not for free: a debugger attached only to `{tabId}` does not
automatically enumerate worker/service-worker targets — `Target.setAutoAttach`
explicitly lists "child workers and new versions of service worker" as
targets it will discover and auto-attach to, meaning the extension must
drive that flow itself. CONFIRMED that the mechanism exists and is named for
exactly this purpose:
https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-setAutoAttach
— UNVERIFIED that a bare `chrome.debugger.attach({tabId})` misses
SW-initiated fetches by default (no primary source states this negative
directly; treat as the working assumption pending a spike).

**`navigator.sendBeacon`: invisible unless separately patched.** It is a
distinct browser API, not routed through `fetch`/`XHR` — a monkeypatch of
only `fetch`+`XHR` (the common implementation shortcut) misses it entirely.
It could be patched as a third explicit target from MAIN world, but even
then there's little to gain: `sendBeacon` is fire-and-forget by spec, no
response body is ever exposed to JS. CDP sees the outbound request/outcome
as an ordinary network entry regardless.

**`<img>` and CSS-initiated loads (`url()` backgrounds, `@font-face`, etc.):
structurally unobservable by any JS monkeypatch.** These are issued directly
by the HTML/CSS parser and rendering engine — they never call through
`fetch`, `XHR`, or any other JS-interceptable function, in either world. The
only page-context signal is indirect and low-fidelity: per-element
`onerror`/`onload`, or `PerformanceObserver({type:'resource'})`, which
reports timing/initiator type but zero body access, and `responseStatus`
pinned to `0` for cross-origin resources unless the server opts in via
`Timing-Allow-Origin`. CONFIRMED:
https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus
CDP's `Network` domain reports these as ordinary `requestWillBeSent`/
`responseReceived`/`loadingFailed` events uniformly with everything else,
since it operates below the JS/DOM layer.

---

### Q4 — The `chrome.debugger` infobar

**Exact wording: `"<Extension name> started debugging this browser"`**,
shown per-tab whenever the debugger is attached. Confirmed by a live,
concrete example (Claude in Chrome, which drives via `chrome.debugger`):
https://github.com/anthropics/claude-code/issues/69287

**Dismissible: no built-in UI dismiss.** The only documented ways to
suppress it are (a) launching Chrome with `--silent-debugger-extension-api`
(a command-line flag the *user* must add to their shortcut, not something
the extension can set), or (b) enterprise `ExtensionInstallForcelist`
policy-installed extensions, which don't trigger it. Neither is available to
a normal Web-Store-installed consumer extension. The linked feature request
asking Chrome to add a built-in suppression mechanism was **closed as "not
planned."** CONFIRMED: same issue as above.

**DevTools already attached to the same tab: mutually exclusive, and
whoever attaches second usually wins/breaks the first.** Two states matter:
1. If the extension is attached via `chrome.debugger` and the user *then*
   opens DevTools on that tab, the extension is force-detached — `onDetach`
   fires with reason `"replaced_with_devtools"` (a documented `DetachReason`
   enum value; CDP itself emits `{"method":"Inspector.detached","params":
   {"reason":"replaced_with_devtools"}}` on disconnect).
2. If DevTools (or another `chrome.debugger` client) is already attached and
   the extension calls `.attach()` second, the call **fails** — a live,
   reported case of this in the wild throws `"Navigation failed: Another
   debugger is already attached to the tab with id"`.
CONFIRMED:
https://developer.chrome.com/docs/extensions/reference/api/debugger
(detach happens "when Chrome DevTools is being invoked for the attached
tab"), corroborated by a real bug report showing the second-attach failure
mode in production: https://github.com/nanobrowser/nanobrowser/issues/161

**Design implication:** the extension must handle `onDetach` gracefully
(pause/flag the recording, don't crash) and must not assume it can silently
re-attach — the user opening DevTools mid-recording is a real, documented
failure path, not a hypothetical.

---

### Q5 — Minimum CDP domain/event set

| Signal | Domain to enable | Events/commands |
|---|---|---|
| Console logs | `Runtime.enable` | `Runtime.consoleAPICalled` (type ∈ log/debug/info/error/warning/…, args, stackTrace) |
| Uncaught exceptions + unhandled rejections | `Runtime.enable` | `Runtime.exceptionThrown` (`ExceptionDetails`; rejected-promise cases carry the rejected value in the same event) |
| CSP violations | `Log.enable` | `Log.entryAdded` (filter `source === "violation"`) |
| Network requests | `Network.enable` (set `maxResourceBufferSize`/`maxTotalBufferSize` generously, or call `Network.configureDurableMessages`) | `Network.requestWillBeSent`, `Network.responseReceived`, `Network.loadingFinished`, `Network.loadingFailed`; command `Network.getResponseBody` called eagerly per request |
| Full-document navigations | `Page.enable` | `Page.frameNavigated` |
| SPA / History-API / hash navigations | `Page.enable` (same) | `Page.navigatedWithinDocument` (`navigationType` ∈ `fragment`/`historyApi`/`other`) — **required separately**, `frameNavigated` only covers cross-document loads |

All CONFIRMED against the primary CDP reference:
- https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#event-consoleAPICalled
- https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#event-exceptionThrown
- https://chromedevtools.github.io/devtools-protocol/tot/Log/#event-entryAdded
- https://chromedevtools.github.io/devtools-protocol/tot/Network/
- https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-frameNavigated
- https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-navigatedWithinDocument

Note: worker/service-worker request coverage additionally needs
`Target.setAutoAttach` (see Q3) — not listed above because it attaches
*targets*, not events on the tab target.

---

### Q4b — Chrome Web Store policy on the `debugger` permission

**Allowed, not banned — but manually reviewed and prone to false-positive
rejection.** The `"debugger"` manifest permission triggers explicit
install-time warnings ("Access the page debugger backend" plus, in
practice, warnings equivalent to broad host access since it operates without
`host_permissions` scoping). CONFIRMED:
https://developer.chrome.com/docs/extensions/reference/permissions-list

Chrome Web Store's general permissions policy requires "the narrowest
permissions necessary" and a written Permissions Justification in the
Developer Dashboard for sensitive permissions; `debugger` falls in the
manually-reviewed tier (alongside `tabs`, `cookies`, `history`, `downloads`,
`webRequest`) rather than being auto-approved. CONFIRMED:
https://developer.chrome.com/docs/webstore/program-policies/permissions,
https://developer.chrome.com/docs/webstore/review-process

**Real friction:** CWS's automated "excessive/unused permission" check
(internally nicknamed "Purple Potassium" by developers) is known to throw
false positives, requiring an Appeal with written justification through the
Developer Dashboard. UNVERIFIED for the `debugger` permission *specifically*
— the one concrete Google Groups thread I could fetch and verify in full
was a Purple Potassium false positive for `contextMenus`/`tabs`/`storage`,
not `debugger`:
https://groups.google.com/a/chromium.org/g/chromium-extensions/c/GdtnseYh5Ng
Secondary summaries (dev.to, Medium write-ups on Purple Potassium) claim
this also happens to legitimate `debugger`-permission users, but I could not
independently confirm a first-hand `debugger`-specific report — flag as
UNVERIFIED, worth a targeted search of the chromium-extensions Google Group
for "debugger" directly before relying on it in a design doc.
Reference: https://blog.june07.com/chrome-web-store-rejection-notification-purple-potassium/

Debugging/testing tools using `chrome.debugger` **are** published and live
on the Store today (existence proof, not a friction measurement) — e.g.
"LT Debug": https://chromewebstore.google.com/detail/lt-debug/kofahhnmgobkidipanhejacffiigppcd

---

### Spikes still needed (exact steps)

1. **CORS-blocked / failed-preflight response body.** Build a throwaway MV3
   extension: `chrome.debugger.attach({tabId})`, `Network.enable`, load a
   test page that does `fetch('https://example-no-cors-headers.test/api')`
   against a server that (a) returns 500 with a body, (b) returns 200 but
   omits `Access-Control-Allow-Origin`, (c) fails the preflight (`OPTIONS`
   returns 403). For each, log every `Network.responseReceived` /
   `Network.loadingFailed` event and immediately call
   `Network.getResponseBody({requestId})`, recording success/error per case.
   Settles Q1's CORS ambiguity definitively.

2. **`securitypolicyviolation` visibility from isolated world.** Content
   script (isolated world, default) on a test page with
   `Content-Security-Policy: script-src 'self'` that triggers a violation
   (inline `<script>` or blocked external script). Add
   `document.addEventListener('securitypolicyviolation', e => console.log('CS SAW IT', e))`
   in the isolated-world content script and separately confirm via
   `Log.entryAdded` (`source: "violation"`) over CDP. Settles Q2.

3. **Service-worker request visibility without explicit auto-attach.**
   Attach `chrome.debugger` to a tab whose page registers a service worker
   that itself calls `fetch()` (e.g., in a `push` or periodic-sync handler,
   or simply proxying page fetches). Enable only `Network.enable` on the tab
   target (no `Target.setAutoAttach`) and confirm whether SW-initiated
   requests appear. Then repeat with `Target.setAutoAttach({autoAttach:
   true, flatten: true})` and diff. Settles Q3's default-visibility question.

4. **Buffer eviction / navigation-loss window, empirically.** Trigger a
   failing request, then navigate the tab (same-origin and cross-origin) at
   varying delays (0ms, 500ms, 5s) before calling `getResponseBody`,
   without `Network.configureDurableMessages`; repeat with it enabled.
   Quantifies exactly how eager the eager-capture requirement (Q1) needs to
   be in practice.

---

### Sources

- https://chromedevtools.github.io/devtools-protocol/tot/Network/
- https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-getResponseBody
- https://chromedevtools.github.io/devtools-protocol/tot/Network/#event-loadingFailed
- https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#event-consoleAPICalled
- https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#event-exceptionThrown
- https://chromedevtools.github.io/devtools-protocol/tot/Log/#event-entryAdded
- https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-frameNavigated
- https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-navigatedWithinDocument
- https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-setAutoAttach
- https://developer.chrome.com/docs/extensions/reference/api/debugger
- https://developer.chrome.com/docs/extensions/reference/permissions-list
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/docs/webstore/program-policies/permissions
- https://developer.chrome.com/docs/webstore/review-process
- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus
- https://github.com/anthropics/claude-code/issues/69287
- https://github.com/nanobrowser/nanobrowser/issues/161
- https://github.com/cyrus-and/chrome-remote-interface/issues/148
- https://github.com/ChromeDevTools/devtools-protocol/issues/64
- https://github.com/mafredri/cdp/issues/42
- https://github.com/chromedp/chromedp/issues/1317
- https://github.com/puppeteer/puppeteer/issues/2258
- https://github.com/puppeteer/puppeteer/issues/6647
- https://sentry.io/answers/failed-to-load-response-data-no-data-found-for-resource-with-given-identifier/
- https://forum.sentry.io/t/receiving-too-many-unrelated-errors-from-chrome-extension/4668
- https://kpracuk.dev/articles/accessing-websites-window-object-in-chrome-extension/
- https://www.okeowoaderemi.com/articles/posts/understanding-contentscript-and-executionworld/
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/GdtnseYh5Ng
- https://blog.june07.com/chrome-web-store-rejection-notification-purple-potassium/
- https://chromewebstore.google.com/detail/lt-debug/kofahhnmgobkidipanhejacffiigppcd
