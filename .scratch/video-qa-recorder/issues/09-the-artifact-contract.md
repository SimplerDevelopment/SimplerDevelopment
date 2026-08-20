# The artifact contract: folder layout and timeline schema

Type: prototype
Status: open
Blocked by: 04, 05, 06, 07, 08

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
