---
name: sd-brain-find-expert
description: Find an internal expert on a topic by searching the Company Brain people graph. Wraps brain_who_knows with conversational refinement — narrows by org unit, seniority, or expertise level. Returns ranked candidates with their relevant tags, primary org unit, and a short rationale per match. Use when the user says 'who knows about X', 'find an expert on Y', 'who should I ask about Z', 'who owns W', 'expertise for compliance review', 'pull someone qualified for X'. Requires a sd-init `.sd/config.json`. Read-only — does not create or modify any records.
user-invocable: true
allowed-tools: Read, Bash, Glob
---

# sd-brain-find-expert

Read-only lookup skill. Resolves a free-text expertise question to a ranked list of internal people, with rationale per match, and offers conversational refinement (filter by org unit, manager, level). Wraps `brain_who_knows` as the primary tool and falls back to `brain_people_list` for structured filters.

This skill never writes — no creates, no updates, no deletes. If the user wants to add a new person or attach expertise, hand off to `sd-brain-add-person`.

## Pre-flight

1. **Read `.sd/config.json`.** Needs `client.id` and the portal domain for the citation links. If missing, tell the user to run `sd-init` and stop.
2. **Read `.sd/learnings.md`** if present. Apply `## Active rules` — e.g. a rule like "always include direct reports of the matched expert" should expand the output.
3. **Verify scope.** `brain:read` is enough. No `brain:write` needed.

## Intent classification

Parse the user's question against this table before deciding tool order:

| Question shape | Primary tool | Refinement |
|---|---|---|
| "Who knows about X?" | `brain_who_knows({ query: 'X' })` | Filter by `orgUnitId` post-hoc if user adds "on the engineering team". |
| "Best person for an X review?" | `brain_who_knows` + post-filter by level | Filter `matchedTags[].level >= 3` (advanced/expert). |
| "Find experts in <unit>." | `brain_people_list({ orgUnitId: <id> })` | Cross-reference: hydrate each result's expertise via `brain_people_get` for top 5. |
| "Who reports to Alice on X?" | `brain_people_list({ managerId: <aliceId>, expertiseTagId: <tagId> })` | Resolve aliceId via `brain_people_list({ search: 'Alice' })` first. |
| "Who leads the <unit> team?" | `brain_org_units_get({ id })` | Return `unit.leadPersonId` resolved via `brain_people_get`. |

If the user's question doesn't cleanly fit a row, default to `brain_who_knows` — it's the marquee tool and it's always cheap.

## MCP tool sequence

Standard flow ("who knows X"):

1. **`brain_who_knows({ query: '<X>', limit: 10 })`** → returns:
   ```ts
   {
     tagMatches: [{ id, name }, ...],         // tags whose name/description substring-matched the query
     people: [{
       personId,
       fullName,
       title,
       primaryOrgUnit: { id, name } | null,
       matchedTags: [{ id, name, level }, ...],
       score,                                 // ranking score (matched-tag count + level bonus + primary-unit bonus)
     }, ...]
   }
   ```

2. **Refinement (only if the user added a constraint)** — call `brain_people_list` with the structured filters:
   - "...on the engineering team" → `{ orgUnitId: <eng-unit-id> }`. Resolve the unit id via `brain_org_units_list` (substring-match `name` against "engineering"). If multiple match, ask which one.
   - "...who reports to Alice" → resolve Alice via `brain_people_list({ search: 'Alice' })`, then `{ managerId: <aliceId> }`.
   - "...senior people only" → keep only candidates whose top `matchedTags[].level >= 3`.
   - Intersect the refinement set with the `brain_who_knows` candidates by `personId`; keep ranking order.

3. **Top-5 hydration (optional).** For each of the top 5 candidates, optionally call `brain_people_get({ id: <personId>, include: ['notes'] })` to surface a one-line bio. Only do this if the user asked "tell me more" or the results are sparse — otherwise it burns tokens for no gain.

4. **Tie-breaking.** When scores tie:
   1. Primary org unit match against the user's stated team (if any) → wins.
   2. Higher max expertise `level` across matched tags → wins.
   3. Alphabetical by `fullName` → final fallback.

## Output format

Markdown ranked list, capped at 5 unless the user explicitly asked for more. Each row:

```
1. [Sarah Chen](<portalDomain>/portal/brain/people/<id>) — **Eng Manager**, Platform team
   - **Tags:** [kubernetes (expert)](<portalDomain>/portal/brain/people?expertiseTagId=<tagId>), [terraform (advanced)](...), [observability](...)
   - **Score:** 8.2 — strong direct expertise match (3 tags hit), primary on Platform.
```

Rules:
- Each person's name is a markdown link to their portal profile.
- Each matched tag is a markdown link to the people-list filtered by that tag (`?expertiseTagId=<id>`).
- Show `level` in parentheses when set (`novice` / `working` / `advanced` / `expert`); omit the parentheses when null.
- The rationale string is ONE sentence — what makes this person rank above the next. Lead with the strongest signal (direct expertise match > primary org match > seniority level > general listing).
- When rendering in a UI (Material Icons over emojis): prefix candidate names with `person`; prefix the ranked list header with `psychology_alt`.

If only one strong match exists, return just that one and skip the ranked list.

If `brain_who_knows` returns `people: []` but `tagMatches: [...]` is non-empty, surface: "Tag '<tagName>' exists in your brain but nobody is attached to it yet. Attach via `sd-brain-add-person` or run `brain_people_attach_expertise` against an existing person."

## Citation format

- Person link: `https://<portalDomain>/portal/brain/people/<personId>`
- Tag-filter link: `https://<portalDomain>/portal/brain/people?expertiseTagId=<tagId>`
- Org-unit link: `https://<portalDomain>/portal/brain/org-chart?unit=<orgUnitId>` (the page lives on Wave 3b — until that merges, the link may 404. Acceptable to link anyway; pages get filled in as branches merge.)

Falls back to `simplerdevelopment.com` if the portal domain isn't in `.sd/config.json`.

## Edge cases

- **Empty results.** Tell the user the exact query string passed to `brain_who_knows`. Suggest 2–3 broader synonyms ("you searched 'k8s' — try 'kubernetes', 'orchestration', or 'cloud-native'"). Offer: "Want me to register a new expertise tag for this topic so future searches can find them once people are attached?" — but the *creation* is a write, so the user has to confirm and the actual create call is delegated to `sd-brain-add-person` (or a direct `brain_expertise_tags_create` call).
- **Stale tag matches.** If `tagMatches` returns a tag but `people: []` is empty, mention the tag so the user can decide whether to delete it (`brain_expertise_tags_delete`) or attach someone to it. Don't auto-clean.
- **Sensitive queries.** If the user asks "who's underperforming?", "who should I fire?", "who's a flight risk?", or anything similar that infers performance / loyalty / personnel judgments — REFUSE politely. The expertise graph captures what people know, not how they perform. Suggested response: "This skill surfaces expertise, not performance. For people-management questions, use direct manager conversations or HR tools." Do not run the query. Do not pattern-match against notes for negative signals.
- **Privacy-bound notes.** `brain_people_get({ include: ['notes'] })` returns the free-text notes field, which can contain sensitive context. Surface only what's relevant to the expertise question — never paste the full notes blob into the output.
- **Cross-branch dependencies** — initiatives, decisions, topics are on sibling branches (`feat/brain-initiatives`, `feat/brain-restructure`). Showing "who's working on what initiative" or "who owns this decision" is **not yet available on this branch**. If the user asks, return the expertise-based answer and note the gap: "Once initiatives ship I can also surface who's currently assigned — for now the answer is based on tagged expertise only."

## Feedback handoff

If the user gives signal during the run ("Sarah's not actually the kubernetes expert anymore, drop her level", "promote Bob to expert on terraform", "this list is missing the platform team"), invoke `sd-learn` at the end with:

- artifact ref: `who-knows query "<original query>"`
- skill name: `sd-brain-find-expert`
- feedback verbatim

The rule that lands in `.sd/learnings.md` typically applies to the *data quality* (a hint to run `sd-brain-add-person` to fix levels or add missing people) — surface that follow-up explicitly to the user, since this skill can't fix data itself.

## Failure modes

- **No `.sd/config.json`** → tell user to run `sd-init`. Don't proceed.
- **`brain:read` scope missing** → surface verbatim; the API key needs the scope.
- **`brain_who_knows` returns an error** → surface verbatim. Most common: query too short (the helper enforces min length 1) or too long (max 200 chars).
- **Portal domain missing from config** → fall back to `simplerdevelopment.com`. Don't fail the response.

## What this skill does NOT do

- Does not write — no person creates, no tag attach/detach. Hand off to `sd-brain-add-person`.
- Does not infer expertise from notes / titles / LinkedIn. Only structured `brain_person_expertise` rows count.
- Does not surface CRM contacts. Internal-only people graph.
- Does not answer performance / personnel-judgment questions. Refuses politely.

## Install

This skill ships as part of the SimplerDevelopment client skills bundle. Install all sibling skills in one step from the portal:

**https://simplerdevelopment.com/install**

See `CLIENT_QUICKSTART.md` (installed alongside this file) for the full setup walkthrough, including the MCP-server config Claude Desktop needs and the one-time `sd-init` bootstrap.
