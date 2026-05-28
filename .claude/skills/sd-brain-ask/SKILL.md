---
name: sd-brain-ask
description: Ask a question of the Company Brain. The skill routes the question to the right MCP tools — brain_search for general text, brain_decisions_list for 'what did we decide' questions, brain_list_meetings for meeting lookups, brain_topics_entities for topic-scoped browsing. Optionally filters by topic, decision-maker, or date range. Returns answers with citations linking back to the source records in the portal. Use when the user says 'ask brain', 'search my brain', 'what did we decide about X', 'what was the last meeting on Y', 'find any decisions involving Z', 'show me everything tagged with W'. Requires a sd-init `.sd/config.json`.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# sd-brain-ask

A scoped-search front door for the Company Brain. The user asks a natural-language question; the skill classifies the intent, picks the right MCP tool(s), runs them in parallel when independent, and returns an answer with citations linking back to the source records in the portal.

This skill is read-only. It never mutates Brain — for capturing new decisions, use `sd-brain-record-decision`; for organizing topics, `sd-brain-organize-topics`.

## Pre-flight

1. **Read `.sd/config.json`.** If missing or stale (>14 days), tell the user to run `sd-init` first. Don't proceed.
2. **Confirm brain entitlement.** Brain read tools need the `brain:read` scope. If denied, stop with the same message as the sibling skills.
3. **Read `.sd/learnings.md`** — apply `## Active rules`. Search rules typically include "always cite", "never hallucinate when no result", "prefer decision-list for 'what did we decide' phrasing".
4. **Pull the portal domain** from `.sd/config.json` (or `whoami`) so citation URLs are absolute.

## Intent classification

The question's shape determines the primary tool. Map first, run second.

| Question shape | Primary tool(s) | Filter / args |
|---|---|---|
| "What did we decide about pricing?" | `brain_decisions_list` + `brain_search` | text="pricing" on search; no status filter on decisions |
| "Show me the latest accepted decisions" | `brain_decisions_list` | `{ status: 'accepted', limit: 20 }` |
| "Any one-way decisions we made this quarter?" | `brain_decisions_list` | `{ reversibility: 'one_way', dateFrom: '<Q-start>', dateTo: '<Q-end>' }` |
| "What did Sarah decide last month?" | resolve owner via `brain_search({ types: ['contact'] })` → `brain_decisions_list` | `{ decisionMakerId, dateFrom, dateTo }` |
| "Last meeting with Acme?" | `brain_list_meetings` + `brain_search({ types: ['meeting'] })` | text="Acme" |
| "Show me everything tagged 'hiring'" | `brain_topics_tree` → `brain_topics_entities` | resolve topic id from name |
| "Open commitments for Sarah" | `brain_list_tasks({ ownerId, status: 'open' })` | resolve ownerId via `brain_search` |
| "Find the proposal from last month" | `brain_search({ types: ['note', 'post'] })` | text |
| open-ended ("tell me about X") | `brain_search` only | text |

If the question doesn't match a row above, default to `brain_search` (the hybrid lexical+semantic catch-all) and let the citations carry the answer.

## Filter extraction

Patterns to extract structured filters from natural language. Apply ALL that match.

- **Topic** — phrases like "tagged with X", "about X" where X is a known topic name. Run `brain_topics_list` once and cache; match X against `name` or `path` segment. If found, pass `topicId` to `brain_decisions_list` (currently a no-op pass-through per the helper TODO, but accepted) AND use `brain_topics_entities({ topicId })` for a full topic-scoped result set.
- **Decision-maker** — phrases like "Sarah's decisions", "decided by Mike". Resolve via `brain_search({ query: name, types: ['contact'] })`; take the first hit's user id (if available) as `decisionMakerId`.
- **Date range** — phrases like "this quarter", "last month", "since March", "in 2026". Compute `dateFrom` / `dateTo` as ISO strings. Default to `null` if ambiguous (don't guess).
- **Reversibility** — phrases like "one-way decisions", "irreversible", "two-way". Pass `reversibility: 'one_way' | 'two_way'`.
- **Status** — phrases like "accepted", "proposed", "superseded", "rejected" decisions. Pass `status`.
- **Limit** — phrases like "top 5", "the last 10". Pass `limit`, otherwise default to a sane 20 (50 for `brain_search`).

If multiple filters match, apply ALL — narrower is better than broader for the first pass. The user can ask for a broader retry if results are empty.

## MCP tool sequence

The skill can run multiple read tools in parallel when they're independent. Always cap result counts to keep token usage reasonable.

```
READ — search / list:
  brain_search({ query, types?: ['note'|'meeting'|'task'|'relationship'|'company'|'contact'|'deal'|'post'], limit?: ≤50 })
  brain_decisions_list({ status?, reversibility?, decisionMakerId?, dateFrom?, dateTo?, supersededOnly?, topicId?, limit?: ≤100, offset?, include?: ['context','rationale','decision','alternatives'] })
  brain_decisions_get({ id, include?: [...] })
  brain_list_meetings({ status?, limit?: ≤200 })
  brain_get_meeting({ meetingId })
  brain_list_tasks({ status?, ownerId?, meetingId?, needsReview?, limit?: ≤200 })
  brain_list_notes(...)  // existing tool; use for "find a note about X"
  brain_topics_list({ tagPrefix?, includeEntityCounts? })
  brain_topics_tree({ includeDescriptions? })
  brain_topics_get({ id })
  brain_topics_entities({ topicId, limit?, offset? })
  brain_dashboard_summary({})  // for "what's on my plate" / "anything stale"
```

### Parallelization

When the question is a "what did we decide AND who attended the meeting AND what tasks were assigned" composite, run the relevant list tools concurrently. Example flow:

1. Classify intent: decision + meeting + task.
2. In parallel:
   - `brain_decisions_list({ topicId, limit: 10 })`
   - `brain_list_meetings({ limit: 5 })`
   - `brain_list_tasks({ status: 'open', limit: 20 })`
3. Synthesize the answer from the union of citations.

### Always cap

- `brain_search` — `limit: 20` default, `limit: 50` max.
- `brain_decisions_list` — `limit: 20` default.
- `brain_list_meetings` — `limit: 10` default.
- `brain_list_tasks` — `limit: 20` default.
- `brain_topics_entities` — `limit: 50` default.

## Citation format

Every answer line MUST end with one or more citation links pointing to the source record's portal URL. Format inline-markdown:

- Decision: `[<title>](https://<portalDomain>/portal/brain/decisions/<id>)`
- Meeting: `[<title>](https://<portalDomain>/portal/brain/meetings/<id>)`
- Note: `[<title>](https://<portalDomain>/portal/brain/notes/<id>)`
- Task: `[<title>](https://<portalDomain>/portal/brain/tasks/<id>)`
- Topic: `[<path>](https://<portalDomain>/portal/brain/topics?selected=<id>)`
- Contact / Company / Deal — fall back to whatever URL `brain_search` returns in `hits[].url` (already absolutized by the MCP layer).

Never cite without a real source record. If a claim is your own synthesis ("there are three accepted decisions about pricing"), cite each underlying source as a comma-separated list at the end of the sentence.

## Output contract

Return a markdown answer with this shape:

```markdown
**Answer:** <1–3 sentence direct response to the question>

<optional bulleted findings, each citing its source(s)>

- <finding 1> [<cite>](<url>)
- <finding 2> [<cite>](<url>), [<cite-2>](<url-2>)

**Searched:** brain_search (text="<q>"), brain_decisions_list (filter=<...>), brain_topics_entities (topic="<path>")
**Results:** N decisions, M meetings, K notes
```

- The `Searched:` and `Results:` footer is non-optional — it lets the user verify which tools ran and how to broaden if needed.
- If the answer is "no results", say so explicitly (see Edge cases).
- Render Material Icons (`gavel` for decisions, `event` for meetings, `note` for notes, `check_circle` for tasks) inline where helpful — never emojis.

## Edge cases

- **Empty results.** Don't fabricate. Say plainly:
  ```
  No matching <decisions|meetings|notes|tasks> found for "<query>" with filters <...>.
  Searched: <tool list>.
  Want me to broaden? — drop the <filter> and re-run.
  ```
- **One source disagrees with another.** Surface both citations and the conflict. Never paper over it. Decision rows are immutable, so a "conflict" usually means one is in a supersedes chain — call `brain_decisions_get({ id })` on each to clarify.
- **Question refers to a superseded decision.** `brain_decisions_list` defaults to all statuses unless filtered. If a hit is `status: 'superseded'`, surface that in the answer and link to the successor via `brain_decisions_get({ id }).descendants[0]`.
- **Question mentions a topic that doesn't exist.** Surface the closest matches from `brain_topics_list` ("you said 'hire' — closest topic is `/operations/hiring`. Use that?") and ask before re-running.
- **Question mentions a person who isn't in CRM.** `brain_search({ types: ['contact'] })` returns nothing. Tell the user the filter can't be applied, run the search without the owner filter, and surface the results.
- **Question is ambiguous on time range.** Don't guess at "recent" / "lately" — ask one short clarifier (last 7d / 30d / 90d?) before running the date filter. If the user explicitly says "skip the date filter," run open-ended.
- **Question is huge / multi-part.** Break into 2–3 separate sub-questions and run each independently with its own intent classification. Aggregate the answers.
- **Token budget.** If the slim default response shapes still produce too much output (e.g. the user asked for 50 decisions with `include: ['rationale']`), drop the `include` field and link out via citation only.

## Failure modes

- **No `.sd/config.json`** → run `sd-init` first.
- **Brain entitlement missing** → "scope not granted".
- **MCP returned an error** (e.g. invalid filter, malformed date) → surface the error message verbatim and re-prompt for the filter.
- **A required entity id couldn't be resolved** (decision-maker, topic, meeting) → either run without that filter, or ask the user to provide the id directly.

## Feedback handoff

At the end of the run, if the user has given concrete feedback (e.g. "next time also pull tasks when I ask about decisions", "always cite the supersede chain head, not the ancestor", "skip the `Searched:` footer when the answer is one line"), invoke `sd-learn`:

```
sd-learn with:
  artifact: ask <yyyy-mm-dd-question-hash>
  feedback: "<verbatim user feedback>"
  skill: sd-brain-ask
```

If the user only confirmed ("yes, that's it"), skip the sd-learn call.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-brain-ask" ~/.claude/skills/sd-brain-ask
```
