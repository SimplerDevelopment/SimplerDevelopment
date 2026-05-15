---
name: sd-create-survey
description: Draft a survey, form, intake questionnaire, or feedback poll in the SimplerDevelopment portal via the postcaptain MCP. Supports custom branching logic (showIf rules, page-jump branching, conditional options), per-field scoring (option_map / numeric / NPS), auto-route-to-CRM, recommendation engines, and brand-aware styling. Produces a `draft`-status survey, mints a shareable approval URL (approving flips status to `active` so the public /s/<slug> route accepts responses), and returns the survey id + public URL. Use when the user says 'create a survey about X', 'build an intake form for Y', 'set up a feedback poll', 'NPS survey', 'qualification questionnaire', 'lead-capture form', 'quiz-style assessment', 'multi-step form with branching'. Default mode publishes a DRAFT; requires a sd-init `.sd/config.json`.
user-invocable: true
allowed-tools: Read, Write, Bash, WebFetch, Glob, Grep
---

# sd-create-survey

Draft a survey in the portal. The survey is created with `status='draft'`, the approval link is minted, and the URL is handed back so the author can share it for stakeholder review BEFORE it goes live. **Approving the link flips status to `active`** — only then does the public `/s/<slug>` URL accept responses.

## Pre-flight

1. **Read `.sd/config.json`** — confirm `client.id`, `defaultSiteId`, `brand`. Run `sd-init` first if missing.
2. **Read `.sd/learnings.md`** if present — apply any `Active rules` to the authoring decisions.
3. **Read `SD_DESIGN_PRINCIPLES.md`** before authoring — the survey title screen + form fields follow the same a11y/contrast rules as a CMS page.
4. **Decide the survey shape.** Common patterns:
   - **NPS:** 1 rating field (`type: 'rating'`, scale 0–10) + 1 optional `textarea` follow-up.
   - **Intake / lead-capture:** multi-page (name + email + qualifier questions + thank-you), `requireEmail: true`.
   - **Quiz / assessment:** numeric or option-map scoring → recommendation page.
   - **Feedback poll:** 3–7 fields, mostly radio / rating, optional final textarea.

## Sourcing

Same options as `sd-create-page`:

- **`prompt-only`** — write the question set from the user's brief + brand voice.
- **`url`** — fetch one or more URLs (a competitor's onboarding flow, a research paper). Use for "build a form like X's signup."
- **`brief`** — read a local markdown / txt file the user points at.

## Authoring

### 1. Field shapes (`SurveyFieldDef`)

```json
{
  "id": "q-1",
  "type": "text" | "textarea" | "email" | "phone" | "select" | "radio" | "checkbox" | "toggle" | "date" | "rating" | "number" | "url" | "heading" | "slider" | "page_break",
  "label": "What's your role?",
  "required": true,
  "order": 1,
  "options": [{ "id": "founder", "label": "Founder", "value": "founder" }],
  "page": 0,
  "showIf": { "fieldId": "q-0", "values": ["yes"] },
  "scoring": { "type": "option_map", "weights": { "founder": 10, "ic": 1 } }
}
```

### 2. Custom logic — three knobs

**`showIf` (simple form):** show this field only if another field's answer is in `values`.

```json
"showIf": { "fieldId": "q-role", "values": ["founder", "exec"] }
```

**`showIf` (complex AND combinator):**

```json
"showIf": {
  "combinator": "AND",
  "rules": [
    { "fieldId": "q-role", "operator": "equals", "values": ["founder"] },
    { "fieldId": "q-headcount", "operator": "greater_than", "values": ["10"] }
  ]
}
```

`operator` ∈ `equals | not_equals | contains | not_contains | greater_than | less_than | is_empty | is_not_empty`.

**Page-jump branching (`goToPage`):** when this field is answered with value X, jump to a different page.

```json
{ "id": "q-trial", "type": "radio", "options": [...],
  "goToPage": { "yes": 2, "no": 5 } }
```

**Page boundaries:** insert a `{ "type": "page_break" }` field to split the survey into pages. Title each page via the survey-level `pages: [{title, description}]` array.

### 3. Scoring + recommendations

`FieldScoring`:
- `option_map` — weights per option id.
- `numeric` — multiply the user's numeric answer by a weight.
- `nps` — auto-bucket 0–6 detractor / 7–8 passive / 9–10 promoter.

If the survey has a recommendation engine, set after creation via `surveys_update`:

```json
"recommendation": {
  "offerings": [{ "key": "starter", "title": "Starter Plan", ... }],
  "questions": [{ "fieldId": "q-need", "optionToOffering": { "lite": "starter", "pro": "growth" } }],
  "overrides": [{ "if": { "fieldId": "q-team", "values": ["50+"] }, "offeringKey": "enterprise" }],
  "narrativeTemplate": "Based on your answers, we'd recommend {{primary}}.",
  "bookUrl": "/book/<your-booking-slug>"
}
```

If the survey has a CRM auto-route:

```json
"scoringConfig": {
  "autoRouteToCrm": {
    "enabled": true,
    "minScore": 50,
    "pipelineId": <id>,
    "stageId": <id>,
    "dealTitleTemplate": "Inbound: {{q-company}}"
  }
}
```

### 4. Brand-aware styling

Apply via `surveys_update`:

```json
"brandingProfileId": <from .sd/config.json>,
"styling": {
  "showLogo": true,
  "primaryColor": "<brand.primaryColor>",
  "backgroundColor": "<brand.backgroundColor>",
  "textColor": "<brand.textColor>",
  "headingFont": "<brand.headingFont>"
}
```

**Run a contrast check** on `textColor` vs `backgroundColor` before returning — call `branding_check_contrast`. If the ratio is < 4.5, fall back to slate-900 on white.

## MCP calls

**Step 1 — create the draft:**

```
mcp__simplerdevelopment-postcaptain__surveys_create {
  title: "Q2 customer-fit intake",
  description: "Pre-discovery qualification form. 4 pages, branching by role + headcount.",
  fields: [ ...SurveyFieldDef[] ],
  thankYouTitle: "Thanks — we'll be in touch in one business day.",
  thankYouMessage: "Want to jump the queue? <a href='/book'>Book a slot directly</a>.",
  requireEmail: true,
  allowMultiple: false
}
```

Returns `{ id, slug, ..., approval: { url, token, ... } }`.

**Step 2 — patch in styling, scoring, recommendations, branding** (these fields aren't in the `surveys_create` input schema — they require a follow-up update):

```
mcp__simplerdevelopment-postcaptain__surveys_update {
  id: <from step 1>,
  brandingProfileId: <from .sd/config.json>,
  styling: { ... },
  pages: [{ title: "About you" }, { title: "Your team" }, ...],
  publishResults: false
}
```

**Note:** the recommendation engine, scoring config, and CRM auto-route currently need direct DB writes — they're not exposed in the `surveys_update` MCP signature today. Flag this gap in the response: "scoring/recommendation/auto-route weren't set via MCP; please configure in the portal `/portal/tools/surveys/<id>/scoring` before going live."

## Output

Return to the user:
- Survey id + portal edit URL: `/portal/tools/surveys/<id>`
- Public URL (draft is not yet accepting responses): `/s/<slug>`
- Aggregated-results URL (only once publishResults=true): `/s/<slug>/results`
- **Approval URL** — share for review; approving flips status to `active`.
- One-line summary of the survey spine (e.g. "4 pages, 12 fields, NPS scoring on q-7, CRM auto-route for score ≥ 50, recommendation engine off").
- 5-dimension self-review (per `SD_DESIGN_PRINCIPLES.md`).

## Linking from other artifacts

After publishing, the survey can be embedded in a page / deck via the `survey` block:

```json
{ "id": "embed-1", "type": "survey", "slug": "<survey-slug>",
  "showLogo": true, "showPageTitle": false }
```

Or its aggregated results displayed via `survey-results` (only useful once responses exist).

## Iteration

- Edit fields → call `surveys_update` with the new `fields` array. **Each `surveys_update` mints a fresh approval URL.**
- Flip status manually (skip approval) → `surveys_update { status: 'active' }`. Rarely the right call; prefer the approval flow.
- Major rework / variant test → call `surveys_fork(id)` to clone the source into a new draft row with `parent_survey_id` set. Slug auto-bumps; response counters reset; status resets to draft. Approve the fork to flip it `active` without touching the parent.

## Failure modes

- **No `.sd/config.json`** → run `sd-init`.
- **Subscription not active** → `surveys_create` returns "This feature requires an active surveys subscription." Tell the user to subscribe via `/portal/services`.
- **Field validation error** → most often a malformed `showIf` (operator typo) or a `goToPage` referencing a page index that doesn't exist. Read the error, fix.
- **Scoring/recommendation didn't apply** → these aren't in the MCP update signature yet; either edit in the portal or update the DB directly.

## Install

```bash
ln -s "$(pwd)/.claude/skills/sd-create-survey" ~/.claude/skills/sd-create-survey
```
