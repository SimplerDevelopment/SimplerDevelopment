---
name: sd-brain-run-playbook
description: Start a Company Brain playbook run — picks the right playbook for the user's intent, gathers the context variables (person, company, deal, target date), creates the run via brain_playbook_runs_start, and returns the run URL. Use when the user says 'kick off the onboarding for Jane', 'start the renewal process for Acme', 'run the incident playbook', 'spin up the weekly review', 'execute playbook X for Y'. Requires a sd-init `.sd/config.json`.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# sd-brain-run-playbook

Resolve the right playbook → gather context variables its steps template against → optionally anchor the run to subject entities → call `brain_playbook_runs_start` → return the run URL.

Runs are the per-instance state of a playbook. Multiple runs of the same playbook coexist (one per new hire, one per renewing company, etc.). The skill's job is to model the "subject" of this run (the person being onboarded, the company being renewed) into the run's `context` and `links` so step templates resolve correctly when they fire.

## Pre-flight

1. **Read `.sd/config.json`.** If missing or stale (>14 days), tell the user to run `sd-init` first. Don't proceed.
2. **Confirm brain entitlement.** The MCP server only exposes `brain_*` tools when the active client has Brain enabled. If `mcp__simplerdevelopment-postcaptain__brain_dashboard_summary` returns "scope not granted", stop and tell the user to enable Brain in their portal subscription.
3. **Read `.sd/learnings.md`** if it exists — apply its `## Active rules`. Pay particular attention to client-specific rules around default context defaults (e.g. "always link the run to the CRM company, not just the deal", "auto-fill the `manager` context from the person's managerId field").
4. **Pull the portal domain** from `.sd/config.json` (or `whoami` if not present) so the output URL is correct: `https://<portalDomain>/portal/brain/playbook-runs/<runId>`.

## Playbook resolution

The user names a target playbook. Resolve it by name, slug, or use-case description.

1. Call `brain_playbooks_list({ status: 'active' })` to surface the candidate set.
2. Substring-match against `name` and `slug`. If exactly one match → confirm and proceed. If zero matches → ask the user to clarify, or offer to create one via `sd-brain-create-playbook`. If 2+ matches → list them and ask "Did you mean X or Y?".
3. If the user named a playbook in `status: 'draft'` (try a second `brain_playbooks_list({ status: 'draft' })` only if the active list missed) → tell them it must be activated first. Offer to call `brain_playbooks_activate({ id })` for them.
4. Once resolved, call `brain_playbooks_get({ id, include: ['stepConfigs'] })` to read the step templates — you need them to detect which context variables the templates reference.

## Context gathering

Read the playbook's step `config` blobs for `{{variable.path}}` placeholders. For each unique placeholder root (`person`, `company`, `deal`, `manager`, etc.), build out the matching context object so templates resolve at run time.

Common context shapes:

- `{{person.fullName}}`, `{{person.email}}`, `{{person.title}}` → ask "Which person?" and search via `brain_people_list({ search: '<name>' })`. Resolve to the full person record so every `person.*` path the template uses works. Persist the full row in `context.person`.
- `{{company.name}}`, `{{company.domain}}` → search CRM companies via `brain_search({ query: '<name>', types: ['company'] })`. Persist `{ id, name, domain }` in `context.company`.
- `{{deal.title}}`, `{{deal.amount}}` → `brain_search({ query: '<name>', types: ['deal'] })`. Persist the slim deal record in `context.deal`.
- `{{manager.fullName}}` → if the resolved person has `managerId` set, auto-fill from `brain_people_list({ ids: [<managerId>] })` (or `brain_people_get`); else ask the user. Persist in `context.manager`.
- `{{renewalDate}}`, `{{startDate}}`, `{{targetDate}}` → ask for an ISO date (YYYY-MM-DD). Used by `wait` steps and `task`/`meeting` offset calculations.
- `{{incident.title}}`, `{{incident.id}}` → ask for free-text fields; no CRM lookup. Persist in `context.incident`.

**Do not invent context values the user hasn't given.** If a template references `{{csm.fullName}}` and the user doesn't name one, ask explicitly. If the field is optional (i.e. the template can tolerate a missing path — e.g. used only in a tooltip), surface that and offer to skip; otherwise block. A run with half-rendered titles is worse than a paused interview.

## Links (anchors)

Ask whether the run should be anchored to specific entities for navigation. Default: auto-link the primary subject (e.g. an onboarding run for Jane auto-links to her person record; a renewal run for Acme auto-links to the CRM company).

`brain_playbook_runs_start` accepts `links: [{ entityType, entityId }]` where `entityType ∈ { 'initiative', 'person', 'crm_company', 'crm_deal', 'meeting', 'decision' }`. Multiple links are fine; the run detail page shows them as cross-references.

Patterns to wire automatically:

- Onboarding playbook + a resolved `context.person.id` → auto-link `{ entityType: 'person', entityId: context.person.id }`.
- Renewal playbook + a resolved `context.company.id` → auto-link `{ entityType: 'crm_company', entityId: context.company.id }`. If a `context.deal.id` is also present, link the deal too.
- User says "this is part of the Q3 enterprise launch initiative" → `brain_search({ query: 'Q3 enterprise', types: ['initiative'] })` and add `{ entityType: 'initiative', entityId }`.
- Incident playbook + a meeting that scoped the incident → link the meeting.

## MCP tool sequence

The ordered calls a model running this skill should make. Skip any call whose inputs the user didn't provide.

```
1. brain_playbooks_list({ status: 'active' })
     → resolve target playbook by name / slug substring match

2. brain_playbooks_get({ id: <resolved>, include: ['stepConfigs'] })
     → read step configs; scan for {{var.path}} placeholders to know
       which context variables to gather

3. (optional, per context variable)
   brain_people_list({ search: '<name>' })       // for person/manager
   brain_search({ query, types: ['company'] })   // for company
   brain_search({ query, types: ['deal'] })      // for deal
   brain_search({ query, types: ['initiative'] }) // for initiative anchor

4. brain_playbook_runs_start({
     playbookId,
     label,                       // required, ≤255 chars — "New hire: Jane Doe", "Renewal: Acme Corp"
     context?,                    // Record<string, unknown> — the resolved variable bag
     triggerPayload?,             // for event-triggered manual replays; usually omit
     links?                       // [{ entityType, entityId }]
   })
     → returns { runId, status: 'active', firstStepKeys: string[] }

5. (optional) brain_playbook_runs_get({ id: runId, include: ['context'] })
     → surface the first active step in the response (name + kind + which entity it created if any)
```

## Output contract

Return to the user:

- The run id and the resolved playbook name.
- The portal URL: `https://<portalDomain>/portal/brain/playbook-runs/<runId>`.
- A one-line summary in this exact format (Material Icons over emojis):
  - `Started: <playbookName> for <label> [<status> · step 1 of <total>: <firstStepName>]`
  - Example: `Started: New Hire Onboarding 30-60-90 for Jane Doe [active · step 1 of 5: Provision accounts]`
- If the first step has a `resultEntityType` / `resultEntityId` (e.g. `task` id 142), surface it as a follow-up line so the user can jump straight to it.
- A bullet list of links that were created, one per line:
  - `- <entityType> #<entityId>` (resolved title in parens if available from search)
- One-line next-step suggestion:
  - If the first step is a `task` / `decision` / `review_item` / `meeting` → "Complete via the portal or call `brain_playbook_run_steps_complete` once done — the run will auto-advance to the next step."
  - If the first step is a `wait` → "First step is a wait — the cron at `/api/cron/process-playbook-waits` will advance it when the timer fires."
  - If the first step is a `branch` → "First step is a branch — call `brain_playbook_runs_advance` to evaluate the condition and route forward."

## Edge cases

- **No matching playbook** → list the closest substring matches; if none exist, suggest creating one via `sd-brain-create-playbook`. Do NOT silently pick a random playbook.
- **Playbook in `draft` status** → `brain_playbook_runs_start` will reject with `"playbook is draft, must be 'active' to start a run"`. Tell the user explicitly; offer to call `brain_playbooks_activate({ id })` first.
- **Playbook in `archived` status** → same as draft — start will reject. Tell the user the playbook is archived; if they really want to restart it, they'll need to clone it.
- **Context variable can't be resolved** (e.g. user names a person not in `brain_people`) → ask for clarification (full name, email, or "skip — use this string verbatim"). If the user says skip, store the literal string in context (e.g. `context.person = { fullName: 'Jane Doe' }`) and surface the limitation: "stored as a string; downstream automations expecting a person id won't fire."
- **Multiple subjects in one ask** ("kick off onboarding for Jane and Mike") → do NOT batch into one run. One subject = one run. Offer to loop: "I'll create two runs — one for Jane, one for Mike. ok?" Then call `brain_playbook_runs_start` twice with distinct labels and link sets.
- **Label not given** → derive a sensible default from the primary subject: `<playbookName>: <person.fullName | company.name | "untitled">`. Confirm with the user before submitting.
- **Anchoring to an initiative** but `entityType: 'initiative'` is supported only after Phase F's link-type expansion lands → if `brain_playbook_runs_start` rejects with an `entityType` error, surface "linking to initiative requires a future schema update — skipped this link" and continue with the remaining links.
- **User wants to start a run from a triggered event payload** (e.g. replaying a webhook) → pass the payload as `triggerPayload` so audit log shows what fired it. Unrelated to `context` — `context` is what step templates read; `triggerPayload` is metadata.

## Failure modes

- **No `.sd/config.json`** → tell user to run `sd-init`. Don't proceed.
- **Brain entitlement missing** → `brain_*` tools return "scope not granted". Tell the user to enable Brain in their portal subscription.
- **`brain_playbook_runs_start` rejects missing `playbookId` / `label`** → re-prompt for whichever is missing. Label is hard-required (≤255 chars).
- **`brain_playbook_runs_start` rejects with `"playbook is draft"` or `"playbook is archived"`** → surface verbatim; offer the activate path described above.
- **First step fails to spawn** (e.g. a `task` kind step but the brain_tasks table is unreachable) → the run will exist in `status: 'active'` but the first run-step row will be `'failed'`. Surface this honestly; suggest aborting via `brain_playbook_runs_abort` if the failure is unrecoverable.

## Feedback handoff

At the very end of the run, if the user has given concrete feedback during the conversation (e.g. "always auto-link to the CRM company when running renewal playbooks", "next time default the manager to the person's managerId without asking", "skip the meeting step when running the onboarding for contractors"), invoke `sd-learn`:

```
sd-learn with:
  artifact: playbook_run <runId>
  feedback: "<verbatim user feedback>"
  skill: sd-brain-run-playbook
```

Match how `sd-brain-kickoff-initiative` calls `sd-learn` — pass the artifact ref + verbatim feedback, let `sd-learn` derive the rule and update `.sd/learnings.md`'s `## Active rules` section. Future runs of this skill will read that file and apply the rules.

If the user only confirmed without editing ("looks good, kick it off"), don't pollute the log — skip the sd-learn call.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-brain-run-playbook" ~/.claude/skills/sd-brain-run-playbook
```
