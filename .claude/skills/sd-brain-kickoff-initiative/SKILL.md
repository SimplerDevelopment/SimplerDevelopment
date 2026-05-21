---
name: sd-brain-kickoff-initiative
description: Kick off a Company Brain initiative — interviews the user for name, owner, target date, 2-5 initial goals, and topic tags, then creates the initiative (brain_initiatives_create), its goals (brain_goals_create), attaches suggested topics (brain_topics_attach), and optionally links existing decisions or meetings (brain_initiatives_link). Returns the portal URL and a structured summary. Use when the user says 'kick off an initiative for X', 'start a new initiative', 'we're launching X — set it up in Brain', 'create the initiative for our Q3 launch', 'new internal effort', 'spin up an initiative'. Requires a sd-init `.sd/config.json`.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# sd-brain-kickoff-initiative

Interview the user → write a Company Brain initiative + its initial goals → optionally tag topics → optionally link related decisions/meetings/deals → return the portal URL the user can share or open.

Initiatives are the multi-quarter umbrella every other brain entity hangs from: goals, tasks, decisions, notes, meetings, topics, CRM deals/companies. They are **internal** — not CRM deals (those are external/revenue). The kickoff conversation is the highest-leverage moment to capture the goals that turn an initiative from "a thing we said we'd do" into "a thing we can track."

## Pre-flight

1. **Read `.sd/config.json`.** If missing or stale (>14 days), tell the user to run `sd-init` first. Don't proceed — every step depends on the client/brand/site already being resolved.
2. **Confirm brain entitlement.** The MCP server only exposes `brain_*` tools when the active client has Brain enabled. If `mcp__simplerdevelopment-postcaptain__brain_dashboard_summary` returns "scope not granted", stop and tell the user to enable Brain in their portal subscription.
3. **Read `.sd/learnings.md`** if it exists — apply its `## Active rules`. Pay particular attention to client-specific rules (e.g. "this client always uses critical priority for revenue initiatives", "always set sponsor to the COO"). Initiative records are mutable except status, so a misapplied rule is cheap to fix later — but goals and links accumulate, so getting them right on kickoff saves cleanup.
4. **Pull the portal domain** from `.sd/config.json` (or `whoami` if not present) so the output URL is correct: `https://<portalDomain>/portal/brain/initiatives/<id>`.
5. **Resolve the actor.** Call `mcp__simplerdevelopment-postcaptain__whoami` once and cache the result — you'll use the user's id as the default owner when the user doesn't name one.

## Decision tree (which mode)

| User intent | Mode | Primary tool |
|---|---|---|
| "Kick off a new initiative" / "start X" / "we're launching Y" | **new** | `brain_initiatives_create` |
| "Spin up the planning shell — we'll fill in goals later" | **shell** | `brain_initiatives_create` with status='planned' and no goals |
| "We're closing the old <foo> and starting <bar>" | **handoff** | `brain_initiatives_close` (old) + `brain_initiatives_create` (new) + `brain_initiatives_link` from new → old via `entityType: 'note'` (the close lessons note) |

If the user's intent is ambiguous, ask one short clarifying question — don't guess.

## Sourcing — ASK if unclear

The initiative may already have context in another brain entity. Confirm:

- **`prompt-only`** — capture only what the user just told you. Most common for net-new initiatives.
- **`meeting`** — derive context/scope from a recent Brain meeting. List recent meetings via `brain_list_meetings({ limit: 10 })` and let the user pick. The meeting becomes one of the initial `brain_initiatives_link` rows (`entityType: 'meeting'`).
- **`note`** — derive from an existing Brain note (a strategy doc, a planning memo). Use `brain_list_notes` to surface candidates; pre-fill description from the note summary and link the note.
- **`mixed`** — combine.

**Do not invent goals or owners the user hasn't given.** Leave a field empty (allowed for description, sponsor, startDate, targetDate) rather than fabricating. An initiative with two real goals is more useful than one with five imagined goals.

## Interview script

Run through these prompts. If the user volunteered something in the original message, skip that prompt and confirm what you captured. Show one prompt at a time on first run — bundling them all up front feels like a form and most users only have answers for half.

1. **Name** (required, ≤255 chars) — short, specific noun phrase. The slug derives from this so make it distinguishable from siblings.
   - Example: "Q3 Enterprise Launch" (not "Enterprise stuff").

2. **Description** (optional but recommended) — one-paragraph elevator pitch. What is this initiative trying to accomplish and why now?
   - Example: "Stand up the enterprise tier (SSO, audit logs, contract red-lining) so we can quote 5- and 6-figure deals by end of Q3."
   - If the user has none, leave blank; do NOT fabricate.

3. **Owner** (required-ish) — the person on the hook for delivery.
   - If the user gives a name, look it up via `brain_search({ query: "<name>", types: ["contact"] })`. If no match, fall back to `null` and surface the gap.
   - If the user doesn't name one, default to themselves (the `whoami` user id) and confirm: "defaulting owner to you — say `owner: <name>` to change."

4. **Sponsor** (optional) — typically an executive who clears blockers but doesn't run the work day-to-day. Same resolution path as owner. Leave `null` if not given.

5. **Priority** (default `medium`) — `low | medium | high | critical`. Critical is rare — reserve for "the company stops if this slips."

6. **Start date** (optional) — defaults to today if status is `active`, omit if `planned`.

7. **Target date** (optional but recommended) — the deadline by which "done" is judged. Without a target date, the initiative drifts off the dashboard at-risk filter and stops earning attention. Format as ISO date (YYYY-MM-DD).

8. **Status** (default `planned`) — `planned | active | paused | completed | cancelled`.
   - Default to `planned` if the user is "setting up" the initiative for a future quarter.
   - Use `active` if they say "we've already started" / "kickoff is today."
   - Never default to `completed` / `cancelled` from a kickoff skill — those are close-time states (the future `sd-brain-close-initiative` skill handles those).

9. **Initial goals** (2–5 recommended) — for each goal, capture:
   - `title` (required) — outcome-shaped, not task-shaped. "Sign 3 enterprise pilots" ✓ — "Build SSO" ✗ (that's a task).
   - `unit` (optional) — `percent | usd_cents | count | boolean`.
   - `targetMetric` (optional) — the number that defines "done." For `usd_cents`, multiply dollars by 100 (e.g. $5M → 500_000_000).
   - `currentMetric` (optional) — defaults to 0.
   - `targetDate` (optional) — the goal's own deadline (defaults to the initiative's targetDate).
   - **Push back gently if the user gives < 2 goals:** "Initiatives without measurable goals tend to drift. Add at least 2 — even rough ones. ('Sign 3 customers' and 'Reach $1M committed ARR' are fine starting points; you can refine the metrics later.)" If the user insists on 0 goals, accept it — but switch status to `planned` and surface that the initiative will not appear on the at-risk dashboard until goals are added.
   - Cap at 5. If the user proposes 6+, suggest collapsing related ones or pushing some to a follow-up initiative.

10. **Topic tags** (optional) — only attempt if `brain_topics_tree` is exposed on the MCP server (the sibling brain-restructure branch ships it; on this branch it is not yet available — see Edge cases). Call `brain_topics_tree({ includeDescriptions: false })` to list available topics. Suggest 1–3 based on the initiative name + description. Multi-select.

11. **Confidentiality** (default `standard`) — `standard | restricted | confidential`. Ask only when the initiative is obviously sensitive (M&A, layoffs, compensation, named-customer disputes).

12. **Anchors / related entities** (optional) — meeting that scoped this, decision that authorized this, deal this unblocks, company this is for. For each, run a search to resolve the id, then plan a `brain_initiatives_link` call.

## Optional: link related existing records

After the initiative is created and you have its `id`, look back over the conversation for proper-noun references that can be wired automatically.

Patterns to watch for:

- "This builds on the Q1 decision to focus on enterprise." → `brain_search({ query: "Q1 enterprise focus", types: ["note"] })` (decisions surface through search once brain-restructure lands; until then, search returns notes that paraphrase the decision). If a hit lands, call `brain_initiatives_link({ initiativeId, entityType: 'decision', entityId, note: 'authorizing decision', pinned: true })`.
- "Carried over from last quarter's <initiative name>." → `brain_initiatives_list` (filter by name fragment) and link via `entityType: 'note'` to the close-time lessons-learned note (`brain_initiatives_close` auto-creates one).
- "This is the Acme deal play." → `brain_search({ query: "Acme", types: ["company", "deal"] })` and link via `entityType: 'crm_company'` or `entityType: 'crm_deal'`.
- "Pulled out of yesterday's strategy meeting." → `brain_list_meetings({ limit: 10 })`, pick the match, link via `entityType: 'meeting'`.

**Don't link aggressively.** A pinned link should mean "this is the canonical source for understanding why this initiative exists" — typically 1–3 per kickoff. The detail-page tabs become noisy with 20+ links.

## MCP tool sequence

The ordered calls a model running this skill should make. Skip any call whose inputs the user didn't provide.

```
1. brain_initiatives_create({
     name, description?, status?, priority?,
     ownerId?, sponsorId?,
     startDate?, targetDate?,
     confidentialityLevel?
   })
     → returns { id, slug, status }

2. for each goal (in user-provided order):
     brain_goals_create({
       initiativeId: <id from step 1>,
       title,
       unit?, targetMetric?,
       currentMetric: 0,
       targetDate?,
       status?               // omit — let the helper default to 'open'
     })

3. (optional, ONLY if brain_topics_tree is exposed on this MCP build)
     brain_topics_tree({ includeDescriptions: false })
     brain_topics_attach({
       targetEntityType: 'initiative',
       targetEntityId: <id from step 1>,
       topicIds: [...]
     })

   NOTE: This branch (feat/brain-initiatives) does NOT ship the
   brain_topics_* tools — they arrive when feat/brain-restructure
   merges. Additionally, even after brain-restructure lands, the
   BrainTopicEntityType union may not include 'initiative' until a
   follow-up schema PR. If brain_topics_attach rejects 'initiative'
   as an entityType, surface ONE line and continue:
     "(Topic attach for initiatives requires a future schema update — skipped.)"
   Do NOT block the kickoff on topic attach.

4. (optional) for each related record the user named:
     brain_search({ query, types })   ← resolve names to ids
     brain_initiatives_link({
       initiativeId: <id from step 1>,
       entityType: 'decision' | 'meeting' | 'task' | 'note' | 'crm_deal' | 'crm_company' | 'topic',
       entityId,
       note?,        // free text — why this is linked
       pinned?       // default false; true for the canonical-source link
     })

5. brain_initiatives_get({ id, include: ['links'] })
     → confirm the row landed and pull the formatted summary for the user
```

## Output contract

Return to the user:

- The initiative id and slug.
- The portal URL: `https://<portalDomain>/portal/brain/initiatives/<id>`.
- A one-line summary in this exact format (Material Icons over emojis):
  - `Kicked off: <name> [<status> · <owner-name | "unassigned"> · target <targetDate YYYY-MM-DD | "no target">  · <n> goals]`
  - Example: `Kicked off: Q3 Enterprise Launch [active · Sarah Lee · target 2026-09-30 · 4 goals]`
- A bullet list of goals beneath the summary, one per line:
  - `- <goal title> [<status>] (<current>/<target> <unit | "no metric">, due <YYYY-MM-DD | "no date">)`
  - Example: `- Sign 3 enterprise pilots [open] (0/3 count, due 2026-09-30)`
- A bullet list of any topic tags that were attached (with their `path`), OR the one-line "skipped" note if topic attach was unavailable on this branch.
- A bullet list of any links created (`entityType` + resolved title + pinned flag).
- One-line next-step suggestion tied to the resulting state:
  - If status='planned' and goals=0 → "Add goals via `sd-edit` or the `/portal/brain/initiatives/<id>` detail page before promoting to active."
  - If status='active' → "Check in on goals weekly via `brain_goals_checkin` — the at-risk dashboard surfaces stale ones."
  - If a sibling old initiative was just closed → "Old initiative is now in `status: 'completed'` (or `'cancelled'`); its lessons-learned note is back-linked to the new one."

## Edge cases

- **User gives only the initiative name and no other details** → create with status='planned' (NOT 'active') and no goals. Surface explicitly: "shell only — added with status='planned' and 0 goals. Run me again once you have 2–5 outcome-shaped goals and I'll wire them in." Do not invent goals to fill the gap.
- **User wants a quarterly OKR-style structure** ("set up our Q3 OKRs as an initiative") → guide them to 1–3 outcome goals, not 5+ tasks. Phrase the push-back as: "OKRs work best as 1–3 outcomes per initiative — more than that and the team stops tracking them. The implementation tasks belong under each goal as `brain_tasks` rows (linked, not nested), not as goals themselves."
- **User says "this is a follow-up to last quarter's <X>"** → run `brain_initiatives_list` filtered by name fragment, confirm the match with the user, then call `brain_initiatives_link({ entityType: 'note', entityId: <closeLessonsNoteId from the old initiative>, pinned: true, note: 'predecessor initiative' })`. The lessons-learned note from the old close is the right back-pointer because it's the durable artifact; the old initiative row itself is not linkable through the current schema (entityType has no 'initiative' option in `BrainInitiativeLinkType`).
- **User is closing an old initiative + starting a new one in the same turn** → mention the future `sd-brain-close-initiative` skill, but offer to call `brain_initiatives_close({ id: <oldId>, outcome, reason, lessonsLearned })` directly in the same run if the user provides an outcome (`completed` | `cancelled`) and at least one of `reason` / `lessonsLearned`. After close, link the new initiative back as described above.
- **User names an owner / sponsor who can't be resolved** → `brain_search` returns no contact id. Don't block — leave the id `null` and surface the gap ("couldn't resolve 'Sarah Lee' to a CRM contact; leaving owner unset. You can patch it later via `brain_initiatives_update`"). For owner specifically, fall back to the actor (the `whoami` user id) only if the user didn't name anyone — if they NAMED a person we couldn't resolve, leave it null rather than silently re-assigning.
- **User gives a target date in the past** → push back once ("target date is in the past — initiative will land in `off_track` territory on day one. Did you mean a future date?"). If they confirm, accept the date as given.
- **User gives 6+ goals** → suggest consolidating: "More than 5 goals per initiative usually means the initiative is too broad. Want to split this into two initiatives, or collapse related goals into umbrella ones?" Accept their answer either way — do not silently drop goals.
- **Goal with unit='boolean'** → ignore `targetMetric` / `currentMetric` (the helper accepts them but they're not meaningful for boolean goals). The "done" signal for boolean is a status flip to `achieved`.
- **Goal with unit='usd_cents'** → confirm the dollar→cents conversion explicitly in the summary so the user catches a 100x error: "Setting goal target to $5,000,000 (= 500_000_000 cents)."
- **brain_topics_tree returns empty / topics tool missing** → skip step 3 with the one-line "(Topic attach for initiatives requires a future schema update — skipped.)" message. Do NOT block the kickoff.
- **brain_initiatives_link rejects an entityType** (e.g. `'decision'` before brain-restructure lands) → catch the error and surface: "linking decisions requires the brain-restructure branch — skipped this link." Continue with the remaining links.

## Failure modes

- **No `.sd/config.json`** → tell user to run `sd-init`. Don't proceed.
- **Brain entitlement missing** → `brain_*` tools return "scope not granted". Tell the user to enable Brain in their portal subscription.
- **`brain_initiatives_create` rejects missing `name`** → re-prompt; name is the only hard-required field.
- **`brain_goals_create` rejects on a goal** → surface the specific field name, re-prompt for that goal, then resume creating the remaining goals. Do NOT roll back the initiative — partial state is recoverable; missing the initiative entirely is not.
- **`brain_initiatives_link` returns `alreadyLinked: true`** → idempotent re-run. Treat as success, not failure; surface "(already linked)" so the user knows nothing was duplicated.
- **`whoami` returns 401** → MCP server isn't connected. Stop. Don't fall back to a placeholder owner id.

## Feedback handoff

At the very end of the run, if the user has given concrete feedback during the conversation (e.g. "next time default to status='active' not 'planned'", "always set sponsor to the CEO when I don't name one", "stop pushing back on 1-goal initiatives — sometimes that's intentional"), invoke `sd-learn`:

```
sd-learn with:
  artifact: initiative <id>
  feedback: "<verbatim user feedback>"
  skill: sd-brain-kickoff-initiative
```

Match how `sd-brain-record-decision` calls `sd-learn` — pass the artifact ref + verbatim feedback, let `sd-learn` derive the rule and update `.sd/learnings.md`'s `## Active rules` section. Future runs of this skill will read that file and apply the rules.

If the user only confirmed without editing ("looks good, ship it"), don't pollute the log — skip the sd-learn call.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-brain-kickoff-initiative" ~/.claude/skills/sd-brain-kickoff-initiative
```
