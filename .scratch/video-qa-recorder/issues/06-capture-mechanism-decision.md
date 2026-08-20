# Capture mechanism decision, and what counts as an interaction

Type: grilling
Status: open
Blocked by: 02

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
