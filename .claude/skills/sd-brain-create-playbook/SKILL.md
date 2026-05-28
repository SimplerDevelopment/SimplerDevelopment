---
name: sd-brain-create-playbook
description: Author a Company Brain playbook — interviews the user for the use case (onboarding, renewal, incident response, weekly review, etc.), suggests an initial step sequence based on the kind of process, creates the playbook draft via brain_playbooks_create, adds each step via brain_playbooks_add_step, validates the DAG, and activates it. Returns the portal URL and a summary. Use when the user says 'create a playbook for X', 'set up our onboarding flow', 'define the renewal process', 'we need a repeatable Y workflow', 'build a playbook'. Requires a sd-init `.sd/config.json`.
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# sd-brain-create-playbook

Interview the user → propose a step sequence for the use case they describe → write a Company Brain playbook (draft) → add each step → run DAG validation by activating → return the portal URL.

Playbooks are different from `automation_rules`. Automations are single-shot ("when X happens, do Y"). Playbooks are multi-step, human-paced processes with state per run — onboarding, renewals, incident response, weekly review, etc. The kickoff conversation is the highest-leverage moment to model the right step graph; reshuffling after live runs exist is expensive.

## Pre-flight

1. **Read `.sd/config.json`.** If missing or stale (>14 days), tell the user to run `sd-init` first. Don't proceed — every step depends on the client/brand/site already being resolved.
2. **Confirm brain entitlement.** The MCP server only exposes `brain_*` tools when the active client has Brain enabled. If `mcp__simplerdevelopment-postcaptain__brain_dashboard_summary` returns "scope not granted", stop and tell the user to enable Brain in their portal subscription.
3. **Read `.sd/learnings.md`** if it exists — apply its `## Active rules`. Pay particular attention to client-specific rules (e.g. "this client's onboarding playbook always ends with a 90-day decision step", "always set ownerId to the COO for ops playbooks"). The playbook row itself is mutable, but a run that gets started against a wrong-shaped graph can't be edited mid-flight — so getting the steps right on kickoff matters.
4. **Pull the portal domain** from `.sd/config.json` (or `whoami` if not present) so the output URL is correct: `https://<portalDomain>/portal/brain/playbooks/<id>`.
5. **Resolve the actor.** Call `mcp__simplerdevelopment-postcaptain__whoami` once and cache the result — you'll use the user's id as the default owner when the user doesn't name one.

## Decision tree (which mode)

| User intent | Mode | Primary tool |
|---|---|---|
| "Create a playbook for new-hire onboarding" / "build a renewal playbook" | **template-suggest** | propose 3-7 starter steps from a known shape, then `brain_playbooks_create` + `brain_playbooks_add_step` per step |
| "Set up a playbook from scratch, I'll dictate the steps" | **bespoke** | `brain_playbooks_create` + one `brain_playbooks_add_step` per user-supplied step |
| "Just create the shell — I'll add steps in the UI" | **shell** | `brain_playbooks_create` only (leaves status='draft'; do NOT call `brain_playbooks_activate`) |

If the user's intent is ambiguous, ask one short clarifying question — don't guess.

## Use-case discovery

Ask these four prompts. If the user volunteered something in the original message, skip that prompt and confirm what you captured.

1. **Use case** (required) — "What process are we automating?" Examples to seed the user's thinking: new-hire onboarding, contract renewal, incident response, weekly review, customer onboarding, quarterly business review. The answer drives the step-suggestion templates below.

2. **Trigger kind** (required, default `manual`) — "What kicks this off? Manual / an event / a schedule?" Sets `triggerKind`.
   - **manual** — a human starts a run via `brain_playbook_runs_start`. Most common; the only kind that actually fires runs today.
   - **event** — ask which event name (e.g. `'hire.created'`, `'deal.closed_won'`, `'incident.opened'`). Stored in `triggerConfig.event`. NOTE: event-triggered firing from the automation engine is OUT OF SCOPE this branch — surface this honestly: "event triggers are stored but not yet wired to the automation engine; the playbook will still be runnable manually."
   - **scheduled** — ask for a cron expression. Stored in `triggerConfig.cron`. Same caveat as event triggers — the scheduler hook is future work.

3. **Owner** (required-ish) — the person on the hook for this process living and breathing.
   - If the user gives a name, look it up via `brain_search({ query: "<name>", types: ["contact"] })`. If no match, fall back to `null` and surface the gap.
   - If the user doesn't name one, default to themselves (the `whoami` user id) and confirm: "defaulting owner to you — say `owner: <name>` to change."

4. **Category** (optional but recommended) — free-form for UI grouping. Common values: `hr`, `sales`, `ops`, `compliance`, `incident`, `cs` (customer success). The portal groups playbook list rows by `category` — leaving it blank dumps the playbook into a generic bucket.

## Step suggestion templates

When the use case matches a known shape, propose a starter step sequence. The user confirms / edits each step before the skill calls `brain_playbooks_add_step`. **Do not invent step content the user hasn't approved.** If they want a step you didn't propose, add it. If they want to drop one you proposed, drop it.

Step `kind` enum: `task | note | meeting | decision | review_item | wait | branch`.

### New-hire onboarding 30-60-90

```
key: provision         kind: task     name: "Provision accounts"
  config: { title: "Provision accounts for {{person.fullName}}", ownerHint: "manager", dueOffsetDays: 1 }
  nextStepKeys: ["welcome_meeting"]

key: welcome_meeting   kind: meeting  name: "Welcome 1:1 with manager"
  config: { title: "{{person.fullName}} ↔ {{manager.fullName}} welcome 1:1", startOffsetDays: 3, durationMin: 30 }
  nextStepKeys: ["first_ticket"]

key: first_ticket      kind: task     name: "Assign first ticket"
  config: { title: "Pair {{person.fullName}} on a starter ticket", ownerHint: "manager", dueOffsetDays: 7 }
  nextStepKeys: ["thirty_day_checkin"]

key: thirty_day_checkin kind: meeting name: "30-day check-in"
  config: { title: "{{person.fullName}} 30-day check-in", startOffsetDays: 30, durationMin: 30 }
  nextStepKeys: ["ninety_day_decision"]

key: ninety_day_decision kind: decision name: "Retain / coach / PIP"
  config: { title: "90-day decision for {{person.fullName}}" }
  nextStepKeys: []
```

### Contract renewal

```
key: t_minus_90 kind: task    name: "CSM notified of upcoming renewal"
  config: { title: "Renewal kickoff for {{company.name}}", ownerHint: "csm", dueOffsetDays: -90 }
  nextStepKeys: ["pricing_review"]

key: pricing_review kind: review_item name: "Pricing & uplift review"
  config: { title: "Renewal pricing review — {{company.name}}", dueOffsetDays: -60 }
  nextStepKeys: ["renewal_call"]

key: renewal_call kind: meeting name: "Renewal call"
  config: { title: "{{company.name}} renewal call", startOffsetDays: -30, durationMin: 45 }
  nextStepKeys: ["signed_branch"]

key: signed_branch kind: branch name: "Signed?"
  condition: { field: "signed", op: "eq", value: true }
  nextStepKeys: ["close_won", "escalate"]

key: close_won kind: note name: "Renewal closed-won note"
  config: { title: "{{company.name}} renewed", template: "Closed {{renewalDate}} for {{renewalValue}}." }
  nextStepKeys: []

key: escalate kind: task name: "Escalate to VP CS"
  config: { title: "Escalate {{company.name}} renewal — not signed at T-7", ownerHint: "vp_cs", dueOffsetDays: -7 }
  nextStepKeys: []
```

### Incident response

```
key: open_channel kind: task name: "Open incident channel"
  config: { title: "Open #inc-{{incident.id}} channel", dueOffsetDays: 0 }
  nextStepKeys: ["notify_customer_branch"]

key: notify_customer_branch kind: branch name: "Customer-facing?"
  condition: { field: "customerFacing", op: "eq", value: true }
  nextStepKeys: ["notify_customer", "internal_only"]

key: notify_customer kind: task name: "Notify affected customers"
  config: { title: "Send status update for incident {{incident.id}}", ownerHint: "csm", dueOffsetDays: 0 }
  nextStepKeys: ["wait_48h"]

key: internal_only kind: task name: "Log internal incident note"
  config: { title: "Internal-only incident note for {{incident.id}}", dueOffsetDays: 0 }
  nextStepKeys: ["wait_48h"]

key: wait_48h kind: wait name: "Wait for 48h post-mortem window"
  config: { untilOffsetDays: 2 }
  nextStepKeys: ["postmortem"]

key: postmortem kind: note name: "Post-mortem note"
  config: { title: "Post-mortem: {{incident.title}}", template: "Timeline, root cause, lessons learned." }
  nextStepKeys: ["lessons_learned"]

key: lessons_learned kind: decision name: "Promote lessons to a decision record"
  config: { title: "Lessons learned: {{incident.title}}" }
  nextStepKeys: []
```

### Weekly review (scheduled)

```
key: pull_metrics kind: task    name: "Pull weekly metrics dashboard"
key: review_notes kind: note    name: "Capture weekly review notes"
key: decisions    kind: decision name: "Decisions made this week"
```

If the use case doesn't match any of the above, ask the user to name 3-7 steps freehand. For each step, capture: `key` (snake_case, unique within the playbook), `name`, `kind`, kind-specific `config`, and `nextStepKeys` (which other step keys does this advance to — empty array = terminal).

## Per-step config guidance

For each step the skill should ask for confirmation on these fields based on `kind`:

- **task** — `title` (template-aware, e.g. `"Send welcome packet to {{person.fullName}}"`), `ownerHint` (`'manager'` | `'csm'` | `'self'` | a person key from context), `dueOffsetDays` (relative to run start; negative for "T-N days").
- **meeting** — `title`, `startOffsetDays`, `durationMin` (default 30).
- **note** — `title`, optional `template` (markdown body with `{{var}}` placeholders).
- **decision** — `title` (the question being decided); the run-time step prompts the operator to actually record the decision via `sd-brain-record-decision`.
- **review_item** — `title`, `dueOffsetDays`.
- **wait** — `untilOffsetDays` (relative to run start) OR `untilField` (a context var with a date — e.g. `"{{renewalDate}}"`).
- **branch** — no config; uses `condition` + `nextStepKeys`. Condition shape: `{ field, op, value? }` where `op ∈ { eq, neq, in, not_in, exists, not_exists, gt, lt }`. The branch's `nextStepKeys` are evaluated in order; the first matching step is taken.

`nextStepKeys` MUST reference step keys that exist in this playbook. If you propose steps in order, default each step's `nextStepKeys` to `[<next-step-key>]` and the last step to `[]`. Branches fan out to 2+.

## MCP tool sequence

The ordered calls a model running this skill should make. Skip any call whose inputs the user didn't provide.

```
1. brain_playbooks_create({
     name,                       // required, ≤200 chars
     description?,
     triggerKind?,               // 'manual' | 'event' | 'scheduled' — default 'manual'
     triggerConfig?,             // { event?, filters?, cron? }
     category?,                  // free-form, ≤100 chars
     ownerId?,
     defaultTopicIds?            // number[]
   })
     → returns { id, slug, status: 'draft' }

2. for each step (in order, respecting nextStepKeys references):
     brain_playbooks_add_step({
       playbookId: <id from step 1>,
       step: {
         key,                    // required, snake_case, ≤100 chars
         name,                   // required, ≤200 chars
         description?,
         kind,                   // 'task'|'note'|'meeting'|'decision'|'review_item'|'wait'|'branch'
         config?,                // kind-specific (see above)
         condition?,             // { field, op, value? } | null
         nextStepKeys?,          // string[]
         sortOrder?              // omit — server auto-appends
       }
     })
     → returns { id, key }

3. brain_playbooks_activate({ id: <id from step 1> })
     → on success: { id, status: 'active' }
     → on DAG failure: { error: 'dag_invalid', errors: string[] }

   If DAG validation fails (cycles, missing next-step refs, no entry point, zero steps), surface
   each error verbatim and ask the user how to fix. Common fixes:
     - "next step key 'foo' not found" → either add the missing step or remove the reference via brain_playbooks_update_step.
     - "cycle detected: a → b → a" → break the cycle by editing nextStepKeys on one of the steps.
     - "no entry point" → at least one step must have no other step pointing to its key.
   Loop back to step 2 (add) or call brain_playbooks_update_step / brain_playbooks_remove_step to repair, then retry brain_playbooks_activate.

4. brain_playbooks_get({ id, include: ['stepConfigs'] })
     → confirm final shape; pull the formatted summary for the user
```

## Output contract

Return to the user:

- The playbook id and slug.
- The portal URL: `https://<portalDomain>/portal/brain/playbooks/<id>`.
- A one-line summary in this exact format (Material Icons over emojis):
  - `Created: <name> [<status> · <n> steps · <triggerKind> trigger · <category | "uncategorized">]`
  - Example: `Created: New Hire Onboarding 30-60-90 [active · 5 steps · manual trigger · hr]`
- A bullet list of steps in order, one per line:
  - `- <key> [<kind>] <name> → <nextStepKeys | "(terminal)">`
  - Example: `- provision [task] Provision accounts → welcome_meeting`
- One-line next-step suggestion:
  - If status='active' → "Start a run via `sd-brain-run-playbook` (or `brain_playbook_runs_start` directly)."
  - If status='draft' (DAG failed and user opted to fix later) → "Playbook left in draft. Fix the DAG errors above via `brain_playbooks_update_step` / `brain_playbooks_remove_step`, then call `brain_playbooks_activate` to publish."

## Edge cases

- **Vague use case** ("we need a playbook for stuff that happens after a sale") → propose 2-3 starter templates and ask which feels closest. Don't invent a freeform graph; nudge them toward a known shape (customer onboarding / contract renewal / handoff).
- **User wants conditional branching** ("only notify the customer if it's customer-facing") → use a `branch` kind step with a `condition`. The branch's `nextStepKeys` lists the candidate next steps; the first matching one is taken. Make sure both candidate steps exist before adding the branch.
- **User wants multi-day delays** ("wait 30 days before the check-in") → use a `wait` step with `config.untilOffsetDays` (relative to run start). For "wait until a specific date supplied at run-time", point at a context variable via `config.untilField: "{{renewalDate}}"`.
- **User wants the playbook to start as `draft` and not be activated yet** → skip step 3 (don't call `brain_playbooks_activate`). Surface: "Playbook left in draft. Activate via `brain_playbooks_activate` when you're ready."
- **DAG validation fails** (`brain_playbooks_activate` returns `{ error: 'dag_invalid', errors }`) → walk the user through each error verbatim. Do NOT auto-fix — the user owns the graph shape. Offer surgical `brain_playbooks_update_step` / `brain_playbooks_remove_step` calls; retry activate after each fix.
- **User proposes 8+ steps** → suggest collapsing related ones or splitting into two playbooks. Long graphs are hard to operate; the run UI's stepper gets unwieldy past ~10 steps.
- **User says "use my existing template for X"** → no built-in template packs ship in v1 (per the PLAN's out-of-scope list). Offer the suggestion templates above as the closest equivalent.
- **Trigger kind = event or scheduled** → store the config but tell the user the automation/scheduler hook isn't wired yet ("the playbook will be runnable manually via `brain_playbook_runs_start` regardless").

## Failure modes

- **No `.sd/config.json`** → tell user to run `sd-init`. Don't proceed.
- **Brain entitlement missing** → `brain_*` tools return "scope not granted". Tell the user to enable Brain in their portal subscription.
- **`brain_playbooks_create` rejects missing `name`** → re-prompt; name is the only hard-required field.
- **`brain_playbooks_add_step` rejects a step** → surface the specific field name (key / name / kind / nextStepKeys), re-prompt for that step, then resume adding the rest. Do NOT roll back the playbook — partial state is recoverable via the portal.
- **`brain_playbooks_activate` returns `{ error: 'dag_invalid' }`** → loop into the repair flow above. Do NOT silently mutate steps to "fix" the DAG.
- **`whoami` returns 401** → MCP server isn't connected. Stop. Don't fall back to a placeholder owner id.

## Feedback handoff

At the very end of the run, if the user has given concrete feedback during the conversation (e.g. "next time always include a `kickoff_note` step as step 1", "stop suggesting the 90-day decision step for contractor onboardings", "default `triggerKind` to `event` for incident playbooks"), invoke `sd-learn`:

```
sd-learn with:
  artifact: playbook <id>
  feedback: "<verbatim user feedback>"
  skill: sd-brain-create-playbook
```

Match how `sd-brain-kickoff-initiative` calls `sd-learn` — pass the artifact ref + verbatim feedback, let `sd-learn` derive the rule and update `.sd/learnings.md`'s `## Active rules` section. Future runs of this skill will read that file and apply the rules.

If the user only confirmed without editing ("looks good, ship it"), don't pollute the log — skip the sd-learn call.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-brain-create-playbook" ~/.claude/skills/sd-brain-create-playbook
```
