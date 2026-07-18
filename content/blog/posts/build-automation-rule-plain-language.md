---
title: "Build a Client Automation Rule in Plain Language"
slug: build-automation-rule-plain-language
description: "Step-by-step guide to creating event-driven automation rules using natural language — no configuration forms, no code. Covers triggers, conditions, actions, and the log."
date: 2026-06-27
tags:
  - automation
  - no-code
  - workflows
  - agency-workflow
  - tutorial
author: "SimplerDevelopment Team"
draft: true
canonical: "https://example.com/blog/build-automation-rule-plain-language"
---

Every agency has a version of the same problem: a client fills out the inquiry form, someone notices it in their email, manually creates a CRM deal, sends a confirmation reply, and then opens the project board to add a card for the delivery team. All of that happens because four tools do not talk to each other — and because connecting them usually means a separate automation platform, its own login, its own monthly bill, and an afternoon of configuration work.

Automation Rules in the client portal are built to collapse that manual sequence into a single configured rule. You describe what you want to happen in plain language, review the result, activate it, and the platform handles the rest. This post walks through how to create a rule using the NLP bar, explains the trigger → conditions → actions structure, works through three concrete examples, and shows how to read the execution log afterward.

**What this post does not cover:** the Visual Workflow Builder (the multi-step, branching engine — covered separately) and the `automations_*` MCP tools for programmatic rule management.

---

## Two Automation Engines — Why This Post Focuses on Rules

The platform ships two complementary automation engines. **Automation Rules** are stateless and one-shot: a trigger fires, conditions are evaluated, and a sequence of actions runs. They handle the large majority of agency automation patterns — form-to-CRM, booking-to-project-card, scheduled digest sends — and they require no canvas work.

The **Visual Workflow Builder** handles what Rules cannot: multi-step processes that branch on conditions, long-running flows that need durable execution, and workflows where a failure midway should retry automatically rather than silently drop. The builder is part of the platform and covered in a separate guide.

If your use case is "when X happens, do Y (and maybe Z)," Automation Rules are the right tool. That is the scope of this post.

---

## How the NLP Bar Works

### What natural language rule creation means

Instead of navigating a trigger dropdown, filling in a conditions form, and selecting an action type, you type a description of what you want to happen. The platform reads that description, identifies the trigger event, any conditions that narrow which events actually fire the rule, and the action or actions to take — then creates the rule definition from that.

The result is not hidden. After the parser runs, the rule detail view shows the parsed trigger, conditions, and actions as discrete fields you can inspect and edit before activating. The NLP bar removes the configuration form for the common case; the review step is always present.

### What the parser does and does not do

The parser maps trigger language — "when a form is submitted," "when a booking is confirmed," "every Monday at 9am" — to the actual trigger events in the platform. It maps action language — "create a CRM deal," "send a confirmation email," "create a project card" — to the corresponding action type. Conditions expressed in the description ("only if the contact is tagged as a prospect," "only when the deal value exceeds a threshold") are extracted as filters on the trigger.

When a description is ambiguous or contains terms the parser cannot map cleanly, it creates a draft rule rather than silently guessing. The review step is not a formality — it is the point at which you confirm the parser's interpretation matches your intent. The rule does not activate until you do.

*[Screenshot: NLP bar with a description typed in; the resulting rule appearing in the list below]*

---

## The Trigger → Conditions → Actions Structure

Understanding the three-part structure makes it easier to write good descriptions and to edit a rule when the parsed result needs adjustment.

### Trigger — what starts the rule

Triggers fire on domain events across the entire portal. The full list spans CRM record changes, survey submissions, booking confirmations and cancellations, email engagement events, kanban card moves, Brain note creation, project updates, and more. A rule has exactly one trigger.

Scheduled triggers are the exception to the event-driven pattern: instead of firing in response to something that happened, they run on a time-based schedule. Every Monday at 9am is a scheduled trigger. These are the right choice for recurring digest sends or periodic data checks.

### Conditions — when the rule actually fires

A trigger fires on every matching event unless conditions narrow it. Conditions filter which trigger events cause the rule to execute. A booking-confirmed trigger with the condition "only when the booking page is the consultation page" means the rule runs for consultation bookings — not for every booking across every page in the account. Multiple conditions can be applied; all conditions must be true for the rule to fire (AND logic, not OR).

### Actions — what the rule does

Actions are cross-domain. A rule triggered by a survey submission can create a CRM record, send an email, or create a project card — work that would otherwise happen across three separate tools. A rule can chain multiple actions in sequence. Order matters: if your first action creates a CRM deal and your second action sends a notification referencing that deal, those run in the order you defined them.

---

## Worked Example 1 — Survey Submission → CRM Deal

**Goal:** When a prospective client completes an inquiry form, automatically create a CRM deal and send a confirmation email to the respondent. No manual handoff from form submission to the pipeline.

### What to type in the NLP bar

> "When a survey is submitted, create a CRM deal and send a confirmation email to the respondent"

### Reviewing the parsed rule

- **Trigger:** `survey.submitted`
- **Condition:** None by default — the rule fires on every submission. If you run multiple surveys, add a condition filtering to the specific survey name (for example, "only when the survey is 'Inquiry Form'") so discovery surveys or internal forms do not generate deals.
- **Actions:** (1) `crm_deals_create` — the respondent's email is mapped to the deal's contact field; the deal drops into your default pipeline stage. (2) Send a transactional email using your confirmation template — respondent's email address is auto-populated from the submission.

### Activating and verifying

Activate the rule and submit a test entry through the form. Open the rule's log view and confirm the execution fired, both actions completed, and no field mapping errors appear. If the deal creation fails, the most common cause is a missing required field — typically no pipeline selected in the action configuration. Edit the action, set the target pipeline, and resubmit the test entry.

*[Screenshot: Rule detail view — trigger, condition field, and two actions configured]*

---

## Worked Example 2 — Booking Confirmed → Project Card

**Goal:** When a client books a consultation, automatically create a kanban card so the delivery team sees it immediately — no one manually copies booking details into a project board.

### NLP description

> "When a booking is confirmed, create a kanban card in the Client Onboarding board with the booking details"

### Reviewing the parsed rule

- **Trigger:** `booking.confirmed`
- **Condition:** Optional but recommended — filter to a specific booking page by slug. If the account has multiple booking pages (consultations, internal calendar holds, discovery calls), the condition ensures only consultation bookings create onboarding cards. Without it, every confirmed booking generates a card.
- **Action:** `kanban_create_card` — the booking guest name maps to the card title; the booking date and service name map to the card description. Assign the card to a default board column, such as "New."

### A useful condition to add

If staff calendar holds or internal scheduling pages are also on the same account, a condition filtering to the consultation booking page slug keeps the onboarding board clean. Adding "only when the booking page is 'consultation'" takes thirty seconds in the rule editor and prevents the board from filling with cards that should not be there.

---

## Worked Example 3 — Scheduled Weekly Digest

**Goal:** Every Monday morning, fire an action that sends a project status summary email to the team — automatically, without anyone manually triggering it.

### NLP description

> "Every Monday at 9am, send a weekly project summary email to the team"

### Reviewing the parsed rule

- **Trigger type:** `scheduled` — a cron-style trigger that fires on the configured day and time rather than in response to an event. No condition block is needed; the time schedule is the condition.
- **Action:** Send a campaign or notification email using a pre-built weekly digest template. The email goes to the distribution list or team members configured in the action.

### Scope note

The scheduled rule cron drainer processes one batch per minute. That cadence is appropriate for digest-style sends and periodic checks — it is not designed for high-frequency scheduling (sub-minute or exact-second timing). If your use case requires that kind of precision, use an external cron that calls the `automations_create` or `automations_toggle` MCP tools programmatically rather than relying on the built-in scheduler.

---

## Reading the Execution Log

Every rule has a log view accessible from the rule detail screen. After a rule fires — or fails to fire — the log records what happened.

Each log entry shows:

- **Timestamp** — when the trigger event occurred
- **Trigger event data** — the payload that matched the trigger (the survey submission record, the booking confirmation, and so on)
- **Conditions evaluated** — each condition with a passed or failed result
- **Actions executed** — each action in sequence with its outcome
- **Overall result** — success or error, with an error message if applicable

**Common patterns to know:**

- *"Action failed"* — the destination domain is missing a required field. The most frequent example is a CRM deal action with no pipeline selected. Edit the action configuration to supply the missing value.
- *"Condition not met"* — the trigger fired, but the condition filtered it out. This is expected behavior, not an error. If you see more condition-not-met entries than expected, review whether the condition matches the events you actually want to capture.
- *"Rule inactive"* — the rule was toggled off. Activate it from the rule list.

*[Screenshot: Log view — 3–4 entries with mixed success and condition-not-met outcomes; generic data, no client names]*

---

## Managing Rules Over Time

Rules can be toggled on and off without deleting them. This is useful for seasonal rules — a holiday promotion follow-up, a pre-launch onboarding sequence, a survey campaign that runs once per quarter — that should be dormant the rest of the year.

When rule volume grows, the `automations_list` MCP tool returns all rules for a tenant with their current active/inactive state. That makes it straightforward to audit automation coverage across the account from an AI agent or script without opening the portal. The `automations_update` tool can patch rule configuration programmatically, and `automations_toggle` handles activation state — both are documented in the [tool reference](/docs/agents/tool-reference).

---

## What Comes Next

Three things to remember from this guide: the NLP bar removes the configuration form for common cases, but the review step before activation is always there. The trigger → conditions → actions structure is the same across every rule regardless of how it was created. And the log view is the fastest way to confirm a rule is working as intended or to diagnose why it is not.

For processes that go beyond a single trigger and a linear action sequence — multi-step flows, branching on outcomes, long-running processes that need retry handling — the Visual Workflow Builder is the next surface to learn.

---

## Keep reading

- [Automations & Workflows — feature overview](/solutions/automations)
- [Email Campaigns — trigger email sends from a rule](/solutions/email-marketing)
- [Surveys & Forms — use a survey submission as a trigger](/solutions/surveys)
- [Bookings & Scheduling — fire automations on booking confirmation](/solutions/booking)
- [AI Agent Platform — manage rules via the `automations_*` MCP tools](/solutions/ai-connect)
- [Tool reference: automations_* family](/docs/agents/tool-reference)

---

**Ready to build your first automation rule?** Open the automations panel in your portal and type a description of what you want to happen. → [Go to Automations](/portal/automations)

Not using the platform yet? [See everything automations can do](/solutions/automations) and start a free trial.

---

*<!-- SEO structured data — include in page <head> via post template -->*

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Build a Client Automation Rule in Plain Language",
  "description": "How to create event-driven automation rules using natural language in the client portal — no code required.",
  "step": [
    {
      "@type": "HowToStep",
      "name": "Open the automations panel and type a rule description",
      "text": "Navigate to the automations panel in the portal and type a plain-language description of the rule you want to create in the NLP bar."
    },
    {
      "@type": "HowToStep",
      "name": "Review the parsed trigger, conditions, and actions",
      "text": "The platform creates the rule definition from your description. Inspect the parsed trigger, conditions, and actions in the rule detail view and adjust any fields that need refinement."
    },
    {
      "@type": "HowToStep",
      "name": "Activate the rule",
      "text": "Toggle the rule to active. It will fire each time the trigger condition is met."
    },
    {
      "@type": "HowToStep",
      "name": "Verify execution in the log",
      "text": "Open the rule's log view to confirm the rule fired correctly and all actions completed successfully."
    }
  ]
}
```
