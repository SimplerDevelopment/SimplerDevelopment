---
type: blog-outline
phase: 10
post-type: automation-guide
slug: build-automation-rule-plain-language
status: outline
date: 2026-06-27
sources:
  - marketing/feature-pages/automations-workflows.md
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md (domain 14)
  - marketing/seo/seo-plan.md
authoring-constraints: >
  Visual Workflow Builder is available but shipped first to dev branch (as of 2026-06-27);
  it is part of the platform and can be featured, but do not describe it as being on
  the production main branch. Focus the tutorial on Automation Rules (fully shipped).
  Do NOT feature: voice assistant, social/webhook publishing channels, trigger link
  contact-field auto-update (not yet wired), high-throughput scheduled execution.
---

# Outline: Build an Automation Rule in Plain Language

## SEO Metadata

| Field | Value |
|---|---|
| **Title (≤60 chars)** | Build a Client Automation Rule in Plain Language |
| **Meta description (≤155 chars)** | Step-by-step guide to creating event-driven automation rules using natural language — no configuration forms, no code. Covers triggers, conditions, actions, and the log. |
| **URL slug** | `/blog/build-automation-rule-plain-language` |
| **Canonical** | `https://example.com/blog/build-automation-rule-plain-language` |
| **Target audience** | Agency admins and portal clients who want to automate repetitive cross-domain tasks without writing code |
| **Primary keyword** | no-code automation for agencies |
| **Secondary keywords** | NLP automation rule creation, event-driven automation guide, portal workflow automation, automation rule tutorial, no-code rule builder |

---

## H2 / H3 Outline

### Intro (no heading)

- The problem: the same cross-domain task happens manually every day — a client submits a survey, someone manually creates a CRM deal, then sends a confirmation email, then creates a project card
- The automation rule engine is built to collapse these manual sequences into a single configured rule
- What this post covers: how to create an event-driven automation rule using the NLP bar, what the trigger/conditions/actions structure means, three worked examples, and how to read the execution log
- What this post does not cover: the Visual Workflow Builder (covered separately) and the MCP `automations_*` tools

---

### H2: Two Automation Engines — Why This Post Focuses on Rules

- The platform has two complementary automation engines: Automation Rules (stateless, one-shot) and the Visual Workflow Builder (durable, multi-step, Postgres-backed)
- This guide covers Automation Rules — the right tool for: single-trigger → single-action patterns, filtering by condition, and scheduled recurring tasks
- The Visual Workflow Builder handles branching, multi-step, long-running processes; it is covered in a separate guide

---

### H2: How the NLP Bar Works

- **H3: What natural language rule creation means**
  - Instead of filling out a trigger dropdown, a conditions form, and an action selector, you type a description of what you want to happen
  - The platform parses the description, identifies the trigger domain, conditions, and action, and creates the rule definition
  - You review the result in the rule detail view before activating — the parsed rule is always visible and editable
- **H3: What the parser does and does not do**
  - The parser maps trigger language ("when a form is submitted", "when a booking is confirmed") to the actual trigger events in the platform
  - It maps action language ("create a CRM deal", "send an email", "create a project card") to the corresponding action type
  - Conditions ("only if the contact is tagged X", "only when the deal value exceeds Y") are extracted as filters
  - If the description is ambiguous, the parser creates a draft rule that you can manually refine; the review step is always required before activation

**Screenshot requirement:** NLP bar with a description typed in; the resulting rule appearing in the list below

---

### H2: The Trigger → Conditions → Actions Structure

Before working through examples, explain the structure so readers can apply it to their own rules.

- **H3: Trigger — what starts the rule**
  - Triggers fire on domain events across the entire portal: CRM record changes, survey submissions, booking confirmations and cancellations, email engagement events, kanban card moves, Brain note creation, project updates, and more
  - A rule has exactly one trigger
  - Scheduled triggers run on a time-based schedule rather than in response to an event (useful for recurring digest sends or periodic data checks)
- **H3: Conditions — when the rule actually fires**
  - Conditions filter which trigger events cause the rule to execute
  - Example: a booking-confirmed trigger with a condition "only when the service type is consultation" limits the rule to one service, not all bookings
  - Multiple conditions can be applied; all must be true for the rule to fire (AND logic)
- **H3: Actions — what the rule does**
  - Actions are cross-domain: create a CRM record, send an email, move a kanban card, create a project, tag a contact, send a notification, and more
  - A rule can chain multiple actions in sequence

---

### H2: Worked Example 1 — Survey Submission → CRM Deal

Goal: when a prospective client completes the inquiry form (a survey), automatically create a CRM deal and send a confirmation email.

- **H3: What to type in the NLP bar**
  - "When a survey is submitted, create a CRM deal and send a confirmation email to the respondent"
- **H3: Reviewing the parsed rule**
  - Trigger: `survey.submitted`
  - Condition: (none — fires on every submission; add "when the survey is 'Inquiry Form'" if you have multiple surveys)
  - Actions: (1) `crm_deals_create` — map survey respondent email to the deal's contact; (2) send a transactional email using the confirmation template
- **H3: Activating and verifying**
  - Activate the rule; submit a test survey entry
  - Check the rule's log view to confirm the execution fired and both actions completed

**Screenshot requirement:** Rule detail view — trigger, condition (optional), and two actions configured

---

### H2: Worked Example 2 — Booking Confirmed → Project Card

Goal: when a client books a consultation, automatically create a kanban project card so the delivery team sees it without anyone manually copying the booking details.

- **H3: NLP description**
  - "When a booking is confirmed, create a kanban card in the Client Onboarding board with the booking details"
- **H3: Reviewing the parsed rule**
  - Trigger: `booking.confirmed`
  - Condition: optionally filter by booking page slug to target only consultation bookings
  - Action: `kanban_create_card` — map the booking guest name and date to the card title and description
- **H3: Useful condition to add**
  - If the agency runs multiple booking pages, add a condition filtering to a specific booking page name so only consultation bookings create cards (not, for example, internal staff calendar holds)

---

### H2: Worked Example 3 — Scheduled Weekly Digest

Goal: every Monday morning, trigger an action that compiles a status summary and sends it to the team.

- **H3: NLP description**
  - "Every Monday at 9am, send a weekly project summary email to the team"
- **H3: Reviewing the parsed rule**
  - Trigger type: `scheduled` (cron-style) — fires on Monday at the configured time
  - Action: send a campaign or notification email using a digest template
- **H3: Scope note**
  - The scheduled rule cron drainer runs one batch per minute — suitable for digest-style sends, not for high-frequency per-second scheduling
  - If exact-second timing is critical, use an external cron that calls the `automations_*` MCP tools instead

---

### H2: Reading the Execution Log

- Every rule has a log view accessible from the rule detail screen
- Each log entry shows: timestamp, trigger event data, conditions evaluated (passed/failed), actions executed, outcome (success/error)
- Common error patterns:
  - "Action failed": the destination domain may not have a required field filled in (e.g., CRM deal with no pipeline selected)
  - "Condition not met": the rule fired the trigger but the condition filtered it out — this is expected behavior, not an error; confirm the condition is what you intend
  - "Rule inactive": the rule was toggled off; activate it in the rule list

**Screenshot requirement:** Log view with 3–4 entries; one showing success, one showing condition-not-met

---

### H2: Managing Rules Over Time

- Toggle rules on/off without deleting them — useful for seasonal rules (e.g., a holiday promotion follow-up)
- Update rules via the rule detail editor or via the `automations_update` MCP tool if managing a large number of rules programmatically
- The `automations_list` MCP tool returns all rules with their current active/inactive state — useful for auditing automation coverage across a tenant

---

### Conclusion

- The NLP bar removes the configuration form entirely for common cases; review always comes before activation
- Three structures to remember: trigger (what event), conditions (which subset), actions (what happens)
- For multi-step branching processes, the Visual Workflow Builder is the next step

---

## Internal Links

- [Automations & Workflows feature page](/solutions/automations)
- [Email Campaigns — trigger email from rule](/solutions/email-marketing)
- [Surveys & Forms — use submission as trigger](/solutions/surveys)
- [Bookings & Scheduling — fire automations on confirmation](/solutions/booking)
- [AI Agent Platform — automations_* MCP tools](/solutions/ai-connect)
- [Tool reference: automations_* family](/docs/agents/tool-reference)

---

## CTA

**Primary:** "Build your first automation rule" → `[portal URL]/automations`

**Secondary:** "See all automation triggers and actions" → `/solutions/automations`

---

## Screenshot / GIF Requirements Summary

| Asset | Description | Notes |
|---|---|---|
| Screenshot | Automations rules list with NLP bar at top — a description typed in | Show the rule appearing in the list below |
| Screenshot | Rule detail view — trigger, condition, and two actions configured | Use Example 1 or 2 layout |
| Screenshot | Log view — 3–4 entries with mixed success/condition-not-met outcomes | Use generic names; no real client data |
| GIF | Creating a rule via the NLP bar — typing, rule appearing, opening detail view | ~12 sec; per feature page spec |
