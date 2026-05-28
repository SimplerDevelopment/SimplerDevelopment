---
name: sd-brain-add-person
description: Add an internal person to the Company Brain — interviews user for full name, email, title, manager, primary org unit, secondary memberships, and expertise tags. Calls brain_people_create, brain_org_units_add_member, and brain_people_attach_expertise. Returns the portal URL and a summary card. Use when the user says 'add a new hire to brain', 'add Sarah to the team', 'new person Jane Doe', 'log a new advisor', 'add someone to the org chart', 'create a person record'. Requires a sd-init `.sd/config.json`. People are internal (employees / advisors / contractors) — for external customers and prospects, use CRM contacts (different tool surface).
user-invocable: true
allowed-tools: Read, Write, Bash, Glob
---

# sd-brain-add-person

Interview-style skill for adding an internal person to the Company Brain people graph. Captures structured identity (name, email, title, manager, start date), org-unit membership (primary + optional secondary), and expertise tags. Wraps `brain_people_create`, `brain_org_units_add_member`, and `brain_people_attach_expertise` so a single conversation produces a fully-populated person record.

People are **internal** — employees, advisors, contractors, board members. External customers and prospects go through the CRM contacts surface (`brain_list_contacts`), which is a different toolset entirely. If the user describes a customer relationship, redirect them rather than miscategorising the record.

## Pre-flight

1. **Read `.sd/config.json`.** Required — every step needs the resolved `client.id` and the portal domain. If missing or stale (>14 days), tell the user to run `sd-init` first and stop.
2. **Read `.sd/learnings.md`** if it exists. Apply its `## Active rules` to the interview defaults (e.g. a rule like "always set startDate on new hires" should make the skill ask for it instead of skipping).
3. **Verify MCP scope.** Quick `mcp__simplerdevelopment-postcaptain__whoami` if no recent call this session — the skill needs `brain:write` (for people / org-unit / expertise writes) and `brain:read` (to look up managers, units, tags). If `brain:write` is missing, stop and tell the user their API key needs the scope.

## Interview script

Ask only what the user hasn't already volunteered. Keep prompts tight — one question per turn unless the user wants to dump everything at once.

| Field | Required? | Prompt | Lookup hint |
|---|---|---|---|
| `fullName` | yes | "What's the full name?" | — |
| `email` | strongly preferred | "What's their work email? (skip if external advisor without one)" | — |
| `title` | preferred | "What's their title?" | — |
| `managerId` | optional | "Who do they report to?" | If the user gives a name, call `brain_people_list({ search: '<name>' })` and disambiguate by title / org unit before committing. If no match, ask the user to add the manager first or leave null. |
| `startDate` | optional | "When do/did they start? (ISO date or skip)" | — |
| Primary org unit | preferred | "Which team or department? (we can browse the tree)" | Offer `brain_org_units_tree` to render the hierarchy; let the user pick by name or id. If nothing fits, offer to create one via `brain_org_units_create` — but only with explicit confirmation. |
| Secondary org units | optional | "Any other teams they're on?" | Same lookup; cap at ~3 to keep the interview short. |
| Expertise tags | optional | "What's their expertise? (comma-separated topics — kubernetes, fundraising, ASC 606, etc.)" | See **Expertise tags** below. |
| `notes` | optional | "Anything else worth knowing? (bio, role context, focus areas)" | Free text. |
| `profileUrls` | optional | "LinkedIn / GitHub / internal directory URLs?" | Array of `{ label, url }`. Skip if user has nothing. |

**Defaults you can apply without asking** — `status: 'active'`, `source: 'manual'`. Don't ask about `userId` unless the user volunteers "they have a portal login" — it's an edge case.

### Expertise tags

The lookup tool `brain_expertise_tags_list` is **not yet available on this branch** (Wave 2c skipped the read endpoint). Until it lands:

- Treat each tag the user names as a **resolve-or-create** step: substring-match the tag's name against what you've seen in this session (cached from earlier `brain_who_knows` calls), or just call `brain_expertise_tags_create({ name })` — the helper auto-slugs and idempotency relies on slug-collision suffixing, so you may end up with `kubernetes` and `kubernetes-2` if a tag with the same slug already exists.
- **Preferred discovery flow:** before creating a new tag, run `brain_who_knows({ query: '<tag-name>', limit: 1 })` — its response includes a `tagMatches: [{ id, name }]` array. If a tag id comes back, reuse it. If `tagMatches` is empty, fall through to `brain_expertise_tags_create`.
- For each created tag, the response echoes `{ id, slug }`. Hold the id for the subsequent `brain_people_attach_expertise` call.
- Optional `level` (1=novice, 2=working, 3=advanced, 4=expert). Ask only if the user volunteers a level descriptor ("she's an expert in X"); otherwise pass null.

## MCP tool sequence

Run in this order. Each step depends on the id returned by the previous one.

1. **`brain_people_create`**
   ```json
   {
     "fullName": "...",
     "email": "... or null",
     "title": "... or null",
     "managerId": <id> or null,
     "startDate": "YYYY-MM-DD" or null,
     "notes": "... or null",
     "profileUrls": [{ "label": "LinkedIn", "url": "..." }] or []
   }
   ```
   → returns `{ id, status }`. Capture `id` as `personId`. Re-fetch with `brain_people_get` only if you need the full row back; the echo is intentionally slim.

2. **Org-unit memberships** — one call per unit:
   ```json
   {
     "orgUnitId": <id>,
     "personId": <personId>,
     "primary": true | false,
     "roleInUnit": "... or null"
   }
   ```
   Use `primary: true` for exactly one membership (the primary team). Mark every other secondary membership with `primary: false`. The helper auto-flips other primaries off if you set a new one — safe to re-run idempotently.

3. **Expertise attachments** — for each tag, two-step resolve-or-create:
   - If the tag id is unknown: `brain_expertise_tags_create({ name })` → returns `{ id, slug }`.
   - Then: `brain_people_attach_expertise({ personId, expertiseTagId, level? })` → returns `{ alreadyAttached, level }`. Idempotent — safe to re-run.

4. **Optional — lead promotion.** If the user said "make Alice the new manager of engineering" (i.e. the person should also lead an org unit they just joined), follow up with:
   ```json
   { "id": <orgUnitId>, "patch": { "leadPersonId": <personId> } }
   ```
   via `brain_org_units_update`. Don't do this implicitly — only when the user explicitly designated them as the lead.

## Output contract

Return ALL of:

- **Portal URL** — `https://<portalDomain>/portal/brain/people/<personId>` (portalDomain from `.sd/config.json`; fall back to the SD default if absent).
- **Summary card** — one-line markdown:
  > Added: **Jane Doe** — Engineering Manager · reports to Sarah Chen · 1 primary unit, 2 secondary · 3 expertise tags
- **Material Icon hint** — when the summary appears in any rendered UI (portal toast, deck slide), prefix with `person_add` Material Icon, never an emoji.
- **Next-step nudges** if anything was sparse: "no manager set — fix via `brain_people_update`", "no expertise tags — `brain_who_knows` won't surface this person until tags are attached".

## Edge cases

- **Name only, nothing else.** Create a minimal `brain_people_create({ fullName })` row. Then surface the gap: "Added Jane Doe with no title, manager, or org unit. Reply with details when you have them and I'll patch via `brain_people_update`."
- **"Add Bob as a direct report of Alice."** Resolve Alice via `brain_people_list({ search: 'Alice' })`, take her id as Bob's `managerId`, and create. If Alice doesn't exist, ask whether to create Alice first or skip the link.
- **"Make Alice the new manager of the engineering team."** After `brain_people_create` returns Alice's id, look up the engineering unit via `brain_org_units_tree` (or `brain_org_units_list({ search: 'engineering' })` if the user gave a slug). Run `brain_org_units_update({ id: <eng-unit-id>, patch: { leadPersonId: <aliceId> } })`. Also offer to add Alice as a member of the unit with `primary: true` (a lead almost always is also a member).
- **Manager cycle.** `brain_people_update` returns `{ error: 'manager_cycle' }` if you'd set someone as their own ancestor's manager. Surface verbatim; do not retry.
- **Duplicate by name.** Before creating, run `brain_people_list({ search: '<fullName>' })`. If a row already exists with the same name in the same client, surface it and ask: "There's already a Jane Doe — patch her record, or create a new one?" Don't silently dedupe; people legitimately share names.
- **CRM contact confusion.** If the user describes a customer relationship ("add our customer Maria at AcmeCo"), STOP. Tell them: "That sounds like a CRM contact, not an internal person. Use the CRM contacts surface — different tool, different table." Don't create it under brain_people.
- **Cross-branch dependencies** (initiatives, decisions, topics) — those tables / tools live on sibling branches (`feat/brain-initiatives`, `feat/brain-restructure`). Linking a new person to an initiative or a decision is **not yet available on this branch**. If the user asks ("add Alice and link her to the H2 fundraising initiative"), create Alice but tell them the initiative-link step needs the other branch merged first.

## Feedback handoff

If the user gives concrete feedback during the run ("don't auto-assume status=active for advisors", "always ask for startDate", "we never have profileUrls — stop asking"), invoke `sd-learn` at the end with:

- artifact ref: `person <personId>`
- skill name: `sd-brain-add-person`
- feedback verbatim

This appends to `.sd/learnings.md` so the next run of this skill picks up the rule before the first prompt.

## Failure modes

- **No `.sd/config.json`** → tell user to run `sd-init`. Don't proceed.
- **`brain:write` scope missing** → surface explicitly. The user's API key needs the scope added in the portal.
- **`brain_people_create` returns an error** → surface verbatim. Common causes: invalid email format, manager id doesn't exist on this client, startDate not parseable as an ISO date.
- **Org unit not found** → ask the user for the right slug / id, or offer to create the unit. Don't fall back to "no org unit" silently — a primary org unit is the single most useful field for the downstream "who knows X" search.
- **Partial-write failure.** If `brain_people_create` succeeds but a subsequent org-unit or expertise call fails, DO NOT roll back the person. Return what was created with a clear "succeeded so far, X failed — re-run with `brain_people_update` / `brain_org_units_add_member` to complete" note.

## What this skill does NOT do

- Does not link the new person to initiatives, decisions, or topics (those tables are on sibling branches — not yet available here).
- Does not auto-suggest expertise tags from notes / title via LLM inference; everything is user-supplied.
- Does not touch CRM contacts. Internal-only.
- Does not edit `.sd/config.json`. That's `sd-init`'s job.

## Install

This skill ships as part of the SimplerDevelopment client skills bundle. Install all sibling skills in one step from the portal:

**https://simplerdevelopment.com/install**

See `CLIENT_QUICKSTART.md` (installed alongside this file) for the full setup walkthrough, including the MCP-server config Claude Desktop needs and the one-time `sd-init` bootstrap.
