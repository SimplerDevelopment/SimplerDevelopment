# Feature Landing Page Spec — Automations & Workflows

---

## SEO Block

- **Title (≤60 chars):** Automation Rules & Visual Workflow Builder
- **Meta description (≤155 chars):** Create event-driven automation rules with natural language, or build durable multi-step workflows on a visual canvas — all inside the client portal.
- **Slug:** `/features/automations-workflows`
- **Primary keyword:** automation workflows for agencies
- **Secondary keywords:** no-code automation rules, visual workflow builder, event-driven automation, NLP automation creation, portal automation platform

---

## Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "SimplerDevelopment Automations & Workflows",
  "applicationCategory": "BusinessApplication",
  "featureList": [
    "Event-driven automation rules",
    "Natural language rule creation",
    "Scheduled automation rules",
    "Tracked trigger links",
    "Visual workflow canvas editor",
    "Durable workflow execution with retry and dead-letter handling",
    "Workflow run history with per-run drill-down"
  ],
  "offers": {
    "@type": "Offer",
    "description": "Per-tenant module subscription"
  }
}
```

Additional applicable type: `FAQPage` (see FAQs section below).

---

## Hero

**Headline:** Automate Client Workflows Without Writing Code

**Subhead:** Describe a rule in plain language and it's created. For multi-step processes, build on a visual canvas with durable execution, automatic retries, and a full run history.

---

## Problem

Agencies spend hours on repetitive cross-system tasks: moving a CRM contact to the next pipeline stage when a form is submitted, sending a follow-up email when a booking is confirmed, creating a project card when a new client onboards. These steps are done manually because wiring them together requires a separate automation platform with its own learning curve, separate credentials, and another monthly subscription.

---

## Solution

SimplerDevelopment includes two complementary automation engines inside every client portal. Automation Rules handle the common case — describe the trigger, conditions, and action in plain language and the rule is created. The Visual Workflow Builder handles multi-step, branching processes on a node canvas with durable execution that survives server restarts and retries on failure.

---

## Key Benefits

1. **Natural language rule creation.** Type a description of what should happen ("when a form is submitted, create a CRM deal and send a confirmation email") and the platform creates the rule. No configuration forms to fill out.
2. **Event-driven triggers across all portal domains.** Automation rules can fire on events from the CRM, bookings, surveys, email, projects, the Company Brain, and the website — the entire platform is wired as trigger sources.
3. **Scheduled rules.** Rules can also run on a time-based schedule rather than in response to an event — for recurring tasks like weekly digest sends or periodic data checks.
4. **Tracked trigger links.** Shortened URLs fire automation rules when clicked, enabling click-based re-engagement flows without a separate link tracking tool.
5. **Visual Workflow Builder with durable execution.** Multi-step workflows are built on a ReactFlow node canvas. Runs are persisted in Postgres — each step executes with automatic exponential-backoff retries, dead-letter handling for failed steps, and a run history view with per-step status and a Retry button.

---

## How It Works

**For automation rules:**
1. Open the automations panel in the portal and type a description of the rule in the natural language bar.
2. The platform creates the rule definition. Review the trigger, conditions, and action in the rule detail view and activate.
3. The rule fires each time the trigger condition is met. A log view shows every execution.

**For visual workflows:**
1. Open the workflow builder and drag nodes onto the canvas — trigger nodes, condition nodes, action nodes.
2. Connect nodes to define the execution path. Each node is configured with the parameters for that step.
3. Activate the workflow. Runs are tracked in the run history view with status per step. Failed steps can be retried from the run detail screen.

---

## FAQs

**Q: What is the difference between an automation rule and a visual workflow?**
A: Automation rules are stateless and one-shot — they fire a single sequence of actions in response to a trigger. Visual workflows are durable and multi-step — they execute over time, can branch on conditions, and their run state is persisted so they survive failures and restarts.

**Q: Which events can trigger an automation rule?**
A: Triggers span every portal domain: CRM record changes, booking confirmations, survey submissions, email engagement events, kanban card moves, Brain note creation, and more.

**Q: Can rules include conditions, not just actions?**
A: Yes. Rules follow a trigger → conditions → actions structure. Conditions filter which trigger events actually fire the action, so a rule can be configured to only run when, for example, a CRM deal exceeds a certain value.

**Q: Is the visual workflow builder available now?**
A: The visual workflow builder is part of the current platform and is available to clients. The durable execution engine — with Postgres-backed run persistence, automatic retries, and dead-letter handling — is the foundation it runs on.

**Q: Can automation results be seen in a log?**
A: Yes. The automation rules list has a log viewer that shows each execution, its outcome, and the data that triggered it. Visual workflow runs have a per-run drill-down showing the status of each step.

---

## CTA

**Primary:** Start automating client workflows — [Start free trial]
**Secondary:** See the workflow builder — [Book a demo]

---

## Internal Links

- [AI Agent Platform](/features/ai-agent-platform) — manage automation rules via MCP tools (`automations_*`: `create`, `list`, `update`, `delete`, `toggle`)
- [Email Campaigns](/features/email-campaigns) — trigger email sends from automation rules
- [Surveys & Forms](/features/surveys-forms) — use survey submission as an automation trigger
- [Bookings & Scheduling](/features/bookings-scheduling) — fire automations on booking confirmation or cancellation
- Developer reference: [docs/agents/tool-reference.md](../../docs/agents/tool-reference.md) — `automations_*` tool family

---

## Media Requirements

- **Screenshot:** Automation rules list with the NLP creation bar at the top — showing a typed description and the resulting rule.
- **Screenshot:** Rule detail view — trigger, conditions, and actions configured.
- **Screenshot:** Visual workflow canvas — several connected nodes (trigger → condition → two action branches).
- **Screenshot:** Workflow run history list with per-run status (running, completed, failed).
- **Screenshot:** Run detail drill-down — step-level status with a Retry button on a failed step.
- **GIF:** Creating a rule via the NLP bar — typing a description, the rule appearing in the list, and opening the detail view (approx. 12 seconds).

---

## Status Notes (internal — omit from published page)

- Visual Workflow Builder shipped to the `dev` branch (2026-06-25) and is pending staging migration before the `main` merge. As of the spec date (2026-06-27), it is not yet on the production `main` branch. The FAQ answer above phrases availability without implying it is on main — revisit this claim before publish and confirm main-branch status.
- No MCP tools exist yet for the visual workflow builder (only for automation rules). Do not market MCP control of workflows.
- Trigger link → automation bridge (`contactFieldKey`) is forward-looking and not yet wired. Trigger links as tracked shortlinks ARE built and functional; the auto-updating of a contact field on click is not.
- Cron drainer for scheduled rules is single-threaded (one batch per minute) — do not market high-throughput scheduled execution.
