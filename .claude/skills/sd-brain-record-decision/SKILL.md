---
name: sd-brain-record-decision
description: Capture a Company Brain decision record — title, context, decision, rationale, alternatives, reversibility, anchors — via the SimplerDevelopment portal MCP. The skill conducts a structured interview, calls brain_decisions_create, optionally attaches topics via brain_topics_attach, and returns the portal URL where the user can view, supersede, or share the decision. Use when the user says 'record a decision', 'log a decision', 'we decided X — capture it', 'decision: X', 'document the call we made on Y', 'this should be a decision record', or after a meeting where a clear decision was made. Requires a sd-init `.sd/config.json`. Default mode creates with status='accepted'; use status='proposed' for decisions still under discussion.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# sd-brain-record-decision

Interview the user for the elements of a decision record, write it to the Company Brain as an immutable-ish row, optionally tag with topics, and hand back the portal URL the user can share or supersede.

Decisions are first-class in Brain: rationale / decision text / reversibility cannot be edited in place once captured. The only way to "change" a decision is to **supersede** it — create a successor that links back to the old row. This skill knows when to call `brain_decisions_create` vs `brain_decisions_supersede`.

## Pre-flight

1. **Read `.sd/config.json`.** If missing or stale (>14 days), tell the user to run `sd-init` first. Don't proceed — every step depends on the client/brand/site already being resolved.
2. **Confirm brain entitlement.** The MCP server only exposes `brain_*` tools when the active client has Brain enabled. If `mcp__simplerdevelopment-postcaptain__brain_dashboard_summary` returns "scope not granted", stop and tell the user to enable Brain in their portal subscription.
3. **Read `.sd/learnings.md`** if it exists — apply its `## Active rules`. Pay particular attention to client-specific rules (e.g. "all hiring decisions must include decisionMakerId", "this client always uses `confidential` for finance decisions") because decisions are immutable and the cost of getting a rule wrong is a supersede chain entry forever.
4. **Pull the portal domain** from `.sd/config.json` (or `whoami` if not present) so the output URL is correct: `https://<portalDomain>/portal/brain/decisions/<id>`.

## Decision tree (which mode)

| User intent | Mode | Primary tool |
|---|---|---|
| "Record a new decision" / "we decided X" | **new** | `brain_decisions_create` |
| "We changed our mind on the X decision" / "supersede #123" | **supersede** | `brain_decisions_list` → `brain_decisions_supersede` |
| "We're still debating but want to log it" | **proposed** | `brain_decisions_create` (the helper today always writes `status='accepted'`; surface this limitation — see Edge cases) |
| "Reject the old #123 decision, we never went with it" | **reject** | `brain_decisions_reject` |

If the user's intent is ambiguous, ask one short clarifying question — don't guess.

## Sourcing — ASK if unclear

A decision usually has obvious source material (the conversation that just happened, a meeting transcript, a slack thread). But the skill should still confirm:

- **`prompt-only`** — capture only what the user just told you. Most common.
- **`meeting`** — derive context/decision from a Brain meeting. List recent meetings via `brain_list_meetings({ limit: 10 })` and let the user pick. Pre-fill `anchors.meetingId` and pull context from the meeting summary.
- **`note`** — derive from an existing Brain note. Use `brain_list_notes` to surface candidates; pre-fill `anchors.noteId`.
- **`mixed`** — combine.

**Do not invent context/rationale the user hasn't given.** Leave the field empty (allowed for `context` and `alternativesConsidered`) rather than fabricating. A thin honest record is better than a verbose imagined one — and decisions are immutable, so a fabricated rationale will haunt the chain forever.

## Interview script

Ask these eight prompts. Each one has an example for what good input looks like. If the user volunteered something in the original message, skip that prompt and confirm what you captured.

1. **Title** (required, ≤255 chars) — short noun phrase, no verbs.
   - Example: "Use Postgres for primary store" (not "We decided to use Postgres").
   - The portal renders this as the card heading.

2. **Context** (optional but recommended) — one paragraph on the situation that forced the decision.
   - Example: "Q1 deal pipeline doubled — current SQLite single-writer can't keep up with concurrent embeds."
   - If the user has none, leave blank; do NOT fabricate.

3. **Decision** (required) — what was decided, plainly. Avoid hedging.
   - Example: "Migrate primary store to Postgres on Railway by end of Q2."

4. **Rationale** (required) — why this and not something else.
   - Example: "Connection pooling solves the concurrent-writer issue, Railway already hosts our pgvector for Brain, and our team has Postgres ops experience."

5. **Alternatives considered** (optional) — what else was on the table and why it lost.
   - Example: "Litestream-replicated SQLite (rejected: still single-writer). Planetscale Vitess (rejected: no pgvector)."

6. **Reversibility** (required — defaults to `two_way`) — `one_way` for hard-to-undo, `two_way` for easy-to-revert.
   - Example: schema migration with data backfill = `one_way`; feature flag flip = `two_way`.
   - Use Material Icons `arrow_back` for two-way / `block` for one-way when surfacing in summaries.

7. **Decision maker** (optional) — the person whose call this was. If the user gives a name (not a user id), look it up:
   - Try `brain_search({ query: "<name>", types: ["contact"] })` first.
   - If no match and the user is logged in, default to themselves (the `whoami` user id).
   - If still unresolved, leave `decisionMakerId: null` — the MCP helper falls back to the actor id.

8. **Anchors** (optional) — meeting / note / CRM company / deal that this decision is about.
   - For meeting: offer to list recent ones via `brain_list_meetings({ status: 'approved', limit: 10 })`. Pre-fill `anchors.meetingId`.
   - For note: `brain_list_notes({ limit: 10 })` — pick the most recently updated. Pre-fill `anchors.noteId`.
   - For company/deal: `brain_search({ query: "<name>", types: ["company", "deal"] })`.
   - Multiple anchors are fine.

## Optional: topic tagging

After the decision is created and you have its `id`, ask: "Tag this decision with any topics?"

1. If yes, call `brain_topics_tree({ includeDescriptions: false })`. Render the tree using indentation by `path` depth (Material Icons `folder` / `folder_open` for parents, `label` for leaves) — never emojis.
2. Let the user pick one or more topic ids (multi-select).
3. Call `brain_topics_attach({ targetEntityType: 'decision', targetEntityId: <id>, topicIds: [...] })`.

If the user wants a topic that doesn't exist yet, hand off to the `sd-brain-organize-topics` skill (mode C — one-shot create) rather than inventing a tree shape inline.

## MCP tool sequence

The ordered calls a model running this skill should make. Skip any call whose inputs the user didn't provide.

```
1. (optional, only for the supersede mode)
   brain_decisions_list({ status: 'accepted', limit: 20 })
     → find the decision id the user wants to replace

2. NEW MODE:
   brain_decisions_create({
     title, context?, decision, rationale,
     alternativesConsidered?, reversibility,
     decidedAt?, decisionMakerId?,
     anchors?: { meetingId?, noteId?, companyId?, dealId? },
     confidentialityLevel?
   })

   SUPERSEDE MODE:
   brain_decisions_supersede({
     oldId,           // from step 1
     title, context?, decision, rationale,
     alternativesConsidered?, reversibility,
     decidedAt?, decisionMakerId?,
     anchors?, confidentialityLevel?
   })

   REJECT MODE:
   brain_decisions_reject({ id, reason? })

3. (optional) topic-tagging
   brain_topics_tree({ includeDescriptions: false })
   brain_topics_attach({
     targetEntityType: 'decision',
     targetEntityId: <id from step 2>,
     topicIds: [...]
   })

4. brain_decisions_get({ id, include: ['context', 'rationale'] })
     → confirm the row landed; pull the formatted summary for the user
```

## Output contract

Return to the user:

- The new decision id.
- The portal URL: `https://<portalDomain>/portal/brain/decisions/<id>`.
- A one-line summary in this exact format (Material Icons over emojis):
  - `Recorded: <title> [<reversibility> · <decision-maker-name | "unassigned"> · <decidedAt YYYY-MM-DD>]`
  - Example: `Recorded: Use Postgres for primary store [two_way · Sarah Lee · 2026-05-20]`
- A bullet list of any topics that were attached (with their `path`).
- If supersede: also surface the link to the old decision (`/portal/brain/decisions/<oldId>`) and note that it's now in `status: 'superseded'`.

## Edge cases

- **Status='proposed' for decisions still under debate.** The current `brain_decisions_create` helper always writes `status='accepted'` — there is no input field for status. If the user explicitly wants a "proposed" decision, surface this gap honestly ("the MCP tool today doesn't accept a `status` argument — it writes `accepted`. You can flip to `rejected` via `brain_decisions_reject` later if the proposal dies, or supersede it once a real decision lands. Want to proceed anyway?"). Do NOT silently change the semantics.
- **Supersedes an older decision.** If the user's prompt mentions "we changed our mind about X" / "this replaces the old decision on Y", proactively run `brain_decisions_list({ status: 'accepted', limit: 50 })` and offer matches. Use `brain_decisions_supersede` instead of `_create`. The old row is automatically flipped to `status: 'superseded'` and pointed at the new id — confirm this in the response.
- **Already-superseded decision.** `brain_decisions_supersede` refuses if the `oldId` is already in `status: 'superseded'` (the chain is closed). Tell the user to supersede the HEAD of the chain instead; offer to walk it via `brain_decisions_get({ id: oldId }).descendants[0].id`.
- **Mentioned a meeting that exists.** If the user says "the call with Acme on Tuesday" and `brain_list_meetings` returns a hit whose title matches, pre-fill `anchors.meetingId` and confirm before creating ("anchoring to meeting #42 — 'Acme Q2 strategy call'. ok?").
- **Mentioned a person who isn't in CRM.** `brain_search` won't return a contact id. Don't block — leave `decisionMakerId: null` and surface to the user ("couldn't resolve 'Sarah Lee' to a CRM contact; leaving decisionMaker unset. You can patch it later via brain_decisions_update").
- **Confidentiality.** Decisions involving compensation, terminations, M&A, or named-customer disputes should be flagged `confidentialityLevel: 'confidential'`. Ask if the user hasn't said.
- **Empty rationale.** The helper refuses. If the user truly has no rationale ("we just decided"), push back once — a decision without a rationale is not a decision record, it's a fact. Suggest a one-line rationale ("`team consensus, no specific blocker`") if they want to proceed.

## Failure modes

- **No `.sd/config.json`** → tell user to run `sd-init`. Don't proceed.
- **Brain entitlement missing** → `brain_*` tools return "scope not granted". Tell the user to enable Brain in their portal subscription.
- **`brain_decisions_create` rejects missing required field** → surface the specific field name (title / decision / rationale) and re-prompt for it.
- **`brain_topics_attach` returns `alreadyAttached: n, attached: 0`** → topics were already on this entity (idempotent re-run). Confirm to the user; don't treat as an error.
- **Supersede on a not-found `oldId`** → "decision not found" error. Re-run `brain_decisions_list` to surface valid ids.

## Feedback handoff

At the very end of the run, if the user has given concrete feedback during the conversation (e.g. "next time don't ask about confidentiality unless I mention it", "default to attaching the `decisions` topic", "use `one_way` not `two_way` when I say 'shipped'"), invoke `sd-learn`:

```
sd-learn with:
  artifact: decision <id>
  feedback: "<verbatim user feedback>"
  skill: sd-brain-record-decision
```

Match how `sd-create-page` calls `sd-learn` — pass the artifact ref + verbatim feedback, let `sd-learn` derive the rule and update `.sd/learnings.md`'s `## Active rules` section. Future runs of this skill will read that file and apply the rules.

If the user only confirmed without editing ("looks good, ship it"), don't pollute the log — skip the sd-learn call.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-brain-record-decision" ~/.claude/skills/sd-brain-record-decision
```
