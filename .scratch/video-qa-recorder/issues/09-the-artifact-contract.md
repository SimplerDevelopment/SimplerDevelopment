# The artifact contract: folder layout and timeline schema

Type: prototype
Status: resolved
Blocked by: 04, 05, 06, 07, 08 (all resolved)

## Question

This is the product. Everything else is plumbing that produces it.

Write a **realistic hand-authored example session folder** — not a schema
document — for a plausible SD portal bug, and react to it. It should be possible
to read it cold and know what went wrong.

Settle by reacting to the artifact:

- Folder layout and file names. One directory per session, named how?
- The shape of `timeline.json`: is it one flat time-ordered event array with a
  discriminated `type`, or separate streams per source? Flat is far easier for an
  agent to reason over; separate streams are easier to produce.
- What every event carries in common (`t` in ms from `t0`, `type`, `url`) and what
  is type-specific.
- Does the SRT live as a real `.srt` file, get inlined into the timeline as
  `speech` events, or both? An agent reading one file beats an agent stitching
  two — but `.srt` is what a video player wants.
- Is there a generated `report.md` — a human- and agent-readable narrative — or
  is raw data the whole deliverable? (Every commercial competitor generates the
  report; not generating it is a deliberate position worth taking or rejecting.)
- Schema versioning, so the format can change without breaking consumers.

## Answer

The hand-authored example lives at
[`prototype/2026-08-20T14-32-09_app-simplerdev-com/`](../prototype/2026-08-20T14-32-09_app-simplerdev-com/)
— a real 26-second session against the SD portal visual editor where Save
returns 500. Read `report.md` first; it is the artifact arguing for itself.

Everything below is a **reaction to having written it**, which is what this
ticket asked for. Several of these are things a schema document would not have
surfaced.

---

### The governing rule the artifact revealed

Writing this made a pattern visible that had already been decided three times
independently, without anyone naming it:

> **One source of truth. Many derived views. Zero interpretation.**

- The webm is truth; `frames/` is a derived view of it (ticket 08).
- `timeline.json` is truth; `report.md` is a derived view of it (this ticket).
- Whisper segments are truth; both `transcript.srt` *and* the `speech` events are
  derived views of them (this ticket).

A derived view is safe to materialise precisely because it is regenerable — it
cannot drift from its source, because it has no independent existence. That is
what makes duplication acceptable here and would make a second *source*
unacceptable. This rule should govern every future format decision.

### Folder layout

```
2026-08-20T14-32-09_app-simplerdev-com/
  report.md          # deterministic rendering of timeline.json — the entry point
  session.json       # manifest: t0, environment, capture config, redaction summary
  timeline.json      # flat, time-ordered, discriminated union — the source of truth
  transcript.srt     # real SRT, for video players
  video.webm
  frames/
    000012340-network-500.jpg
    ...
```

**Name: `YYYY-MM-DDTHH-MM-SS_<host>`.** Sortable, self-describing, and
deliberately **colon-free** — `T14-32-09`, not `T14:32:09` — because colons are
illegal in Windows filenames and this project is OS-agnostic by charter. A
detail that only appears when you actually write the folder down.

**Frame naming: zero-padded ms offset + event type** —
`frames/000012340-network-500.jpg`. Sorts chronologically, and you can find the
frame for a moment without reading the timeline at all.

### `timeline.json` — flat, and an object rather than a bare array

**Flat, time-ordered, discriminated by `type`.** Correlating separate per-source
streams is exactly the work this tool exists to eliminate; shipping streams
would be exporting our convenience as the consumer's problem. The production
cost is one sort at the end.

It is an **object wrapping `events`**, not a bare array, so it carries
`schemaVersion`, `sessionId` and `t0Epoch` and remains self-describing when read
alone — which is how an agent will read it. Costs a `.events` deref; worth it.

**Common fields: `t`, `type`, `pageUrl`, and optional `tEnd` and `frame`.**

Two corrections to the field set as the ticket proposed it, both discovered by
writing real events:

1. **`url` had to become `pageUrl`.** The ticket proposed `url` as a common
   field, but `network` events already have a `url` meaning *the request
   target*. A field name that means "page context" on one event type and
   "request target" on another is a bug factory. Renamed everywhere.
2. **`tEnd` is not network-specific — events are intervals, not instants.**
   `speech` has cue duration, `network` has request duration, `drag` has gesture
   duration. So the common shape is `t` plus optional `tEnd`, and consumers
   should assume any event *may* span time.

**Per-type payloads:** `navigation` · `speech` · `click` · `keydown` · `change` ·
`submit` · `drag` · `focus` (the six interaction types from 06, plus navigation)
· `network` · `console` · `exception`. `exception` stays distinct from
`console` because CDP distinguishes `exceptionThrown` from `consoleAPICalled`,
and flattening them would discard that.

### SRT: both file and inlined `speech` events

Both, and the governing rule above is why: the Whisper segments are the single
source, and the `.srt` file and the `speech` events are two derived renderings
of it. The `.srt` exists because it is what a video player wants and what was
asked for originally; the `speech` events exist because an agent reading one
file beats an agent stitching two.

**Writing it out revealed why this matters more than it looks.** In the example,
the narration *"And clicking save"* lands at **00:11.210** and the click lands at
**00:11.880** — the narration comes **first**. People narrate intent before
acting. That ordering is information, and it only exists if speech is
interleaved into the same array as the events. In a separate stream it is a
timestamp you have to reconstruct; in the flat array it is just the previous row.

### `report.md` — generate it, deterministically, with no model

The ticket framed not generating it as a position worth taking. Having written
one, the position to take is the opposite — but with a sharp qualification that
resolves the tension.

A *narrative* report needs a model, which would breach the zero-network-calls
non-negotiable. But narrative is not what is needed: **the consuming agent
brings the narrative.** What is needed is a deterministic rendering — session
header, failures grouped by `(method, url, status)` with counts, the interleaved
timeline, the redaction summary. All mechanical. All regenerable from
`timeline.json`.

Writing it was the test: I had to consciously *avoid* typing "the root cause is
an unapplied migration," and the report is immediately useful without it. So
`report.md` carries a standing disclaimer that it contains no analysis. It is a
view, never an opinion.

### Schema versioning

`schemaVersion` (integer) in **both** `session.json` and `timeline.json`, so
either file is interpretable alone. Rule: **additive changes do not bump it** —
consumers must ignore unknown fields — and only a breaking change to an existing
field's meaning or removal bumps the major. The tool version travels separately
in `session.json.tool`, so a consumer can distinguish "format changed" from
"producer changed".

---

### What reading the artifact cold actually proved

- **The response body is the entire diagnosis.** The console error says
  `Failed to save post` — worthless. The 500 body says
  `column "cdn_cache_enabled" of relation "posts" does not exist`, and the
  diagnosis is instant. Ticket 06's eager-body-on-`loadingFinished` rule is
  therefore not one capture decision among many; **strip it and this artifact is
  worth nothing.** It is the single highest-value byte in the folder.
- **Metadata-for-all earns its place, but not the way I expected.** Both failing
  requests here are 500s, so failures-only would have caught them. What
  metadata-for-all actually contributes is the two successful `GET`s at 00:02
  and 00:03 — evidence the page loaded and the media call worked, which is how
  an agent *rules things out* rather than finds them.
- **Ticket 08 justified itself concretely.** The narration says the button
  *"is still in the saving state"* and the timeline cannot represent that at all
  — no event fires for a spinner that never stops. The frame at
  `000012340-network-500.jpg` is the only record of it. That is the
  "un-schema'd channel" argument turning up as a real gap in a real session,
  rather than as theory.
- **Redacted typed values read fine.** `{"redacted": true, "chars": 62, "shape":
  "text"}` tells you a field was filled and roughly with what. Ticket 05's
  shape-preserving choice costs almost nothing in legibility.

### Gaps the artifact exposed (extension points, not v1 work)

- **No `marker` event.** Nothing lets the recorder say *"this is the bug"* — the
  narration carries it implicitly (*"save is just broken on this page"*), which
  works but is not machine-findable. An obvious future event type; belongs to
  the recording-UX fog.
- **No session-end event.** Duration lives in `session.json` only. Fine for now,
  noted so it is a choice rather than an oversight.

---

### Consequences for other tickets

- **11 (how an agent consumes a session)** — **now unblocked**, and materially
  pre-answered: `report.md` is the entry point, `timeline.json` is the detail.
  The live question narrows to whether anything beyond files is needed.
- **10 (how artifacts reach disk)** — confirmed. One directory, one atomic write
  at stop, plus a few hundred small frame files. Combined with 08, this is close
  to disqualifying for `chrome.downloads`.
- **06 / 08 / 05** — all three validated against a concrete artifact rather than
  in the abstract; no decision reversed.
