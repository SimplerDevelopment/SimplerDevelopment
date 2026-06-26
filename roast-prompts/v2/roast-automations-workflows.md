# Roast V2: Automations & Workflows — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

**V2 pivot summary:** Prior council ruled that the "no integration tax / Zapier killer" pitch overclaims and the in-process fire-and-forget runtime is a silent-failure liability that kills trust on first real drop. V2 re-headlines around the two genuinely defensible assets — the playbook bridge and NLP authoring — scopes the honest automation wedge to the ~30% of agency workflows that are internal events SD already owns, and kills the standalone framing entirely. The durable execution substrate is a committed GO-LIVE BLOCKER (real code, not done yet — see Constraints).

---

## The idea

SimplerDevelopment ships an Automation Rules engine (`lib/automation/`) inside the same portal as its CRM, Brain playbooks, email, bookings, and surveys. The engine is event-driven: when a CRM deal is won, a survey response submitted, a booking created, or a subscriber added, a flat rule fires a list of actions — send an email, start a playbook, run a plugin script, or invoke any in-scope MCP tool. Rules can also be time-triggered (cron). The **headlining authoring path is NLP-first**: describe an automation in plain English and Claude generates the structured trigger/condition/action JSON — not an AI-suggestions sidebar, but the primary creation interface for simpler rules. Every action dispatch is scope-gated: rules can only execute actions within explicitly granted MCP scopes, logged and auditable.

The critical differentiator is the **playbook bridge**: a rule action can launch a Brain playbook, coupling light-weight event-triggering to SD's structured multi-step playbook runtime. No point-tool competitor ships this pattern because they have no opinionated playbook system to bridge to.

A ReactFlow **visual workflow builder** (`lib/workflows/`) also exists but is **deferred from the marketing surface**: its runtime is currently manual-fire-only with no wired trigger execution. It will graduate from internal tooling to a marketed feature once the durable execution layer (see Constraints) is live and it can execute triggered runs reliably.

Trigger links (`/go/<slug>`) round out the domain as tracked shortlinks with click analytics and a CRM-field-write hook.

---

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies running SD as their business OS — they want to automate the operational glue between their internal CRM, email, bookings, surveys, and Brain playbooks without configuring external Zapier/Make webhooks for every event SD already owns.
- **Honest scope:** This automates the ~30% of agency workflows that are SD-internal events (deal won → playbook start, survey submitted → email + CRM tag, booking created → onboarding sequence). It does NOT replace the ~70% of cross-boundary zaps that route between SD and external tools the agency will keep — those stay on Zapier, and we say so.
- **End user:** Agency team members setting up rules; their clients and contacts triggering events (booking, survey, subscribe) that rules respond to.
- **Monetization:** Rules engine bundled in the SD subscription. NLP parse calls consume AI credits billed via the tenant's Claude API key. Higher-tier plans unlock longer execution history or more active rules. **No standalone ambition — bundled retention layer.**

---

## The edge

**1. Playbook bridge — the only cross-module compound no point tool can replicate.**
A CRM deal closed → rule fires → Brain playbook "Client Onboarding" starts: the deal record, client contact, signed contract, and playbook are all visible in one SD session with no token handoffs. Zapier, Make, and n8n have no playbook system to bridge to; this compound only exists because the automation engine and the playbook runtime are co-located in the same product.

**2. NLP-first authoring.**
Describe an automation in plain English; Claude generates the trigger/condition/action JSON. This is the primary creation interface for simpler rules, not an AI-suggestions sidebar. Other in-app automation tools have begun shipping AI hints; SD leads with NLP as the default, not a beta add-on.

**3. Zero integration tax on the internal-event half.**
Automations fire from the same in-process events as the rest of SD without external webhooks, OAuth credentials, or integration maintenance. Zapier and Make require agencies to configure trigger URLs and authenticate; SD events just fire because the engine shares the data layer. This advantage is real and load-bearing — but only for events SD owns. We do not claim it for external tools the agency also uses.

**4. Scope gate as a real audit trail.**
Every action dispatch checks the rule's granted MCP scopes before executing. Rules without a matching scope are skipped and logged. This is a genuine access-control and auditability primitive that generic webhook platforms do not offer.

**5. Same login, same bill.**
Agencies eliminate Zapier for their internal workflows — the onboarding sequences, deal-won triggers, and survey routing — not because SD is cheaper in isolation, but because they already pay for it and internal events just work.

---

## Constraints

- **Solo founder / tiny team.** SD is a ~357k-line shipping monorepo; automation engine competes for focus with every other domain.
- **GO-LIVE BLOCKER — durable execution substrate (real code, not done).**
  The current runtime executes rules on the request thread with no queue, no retries, and no persistent run log. A serverless cold-start (Vercel scale-to-zero) silently drops events. This is the primary trust-killer: a first "your automation lost my deal" ticket from a real agency sends them permanently back to Zapier.
  **Committed scope before first-dollar:** Move execution off the request thread into a durable at-least-once queue with retries and a persistent `automation_runs` log (event-received → action-attempted → succeeded/failed/dropped). Cheapest viable path: Postgres job table + polling worker, or adopt Inngest/Trigger.dev. **No reliability claim ships until this passes a load test (scale-to-zero → fire 100 events → zero silent drops).** The cheapest first increment — adding the persistent run log and wiring it to the existing event bus — also doubles as the test instrument that either confirms or de-risks the cold-start failure mode.
- **Visual workflow builder stays off the marketing surface** until the durable execution layer is live and wired triggers actually execute. Shipping a manual-test-only canvas under the label "builder" dilutes trust in the rules engine.
- **Automation reduces Zapier for internal events; it does not replace Zapier for cross-boundary integrations** SD does not own. Pitching it as a full Zapier killer is an overclaim that guarantees a failed evaluation.

---

## Roast it on two lenses

**Lens A — Earns its place in the suite?**
Does the playbook bridge + NLP authoring + scoped internal-event automation create real retention value and operational compound — or is it a shallow rules engine that agencies configure once and forget while still maintaining their Zapier account for the 70% of integrations SD doesn't touch?

**Lens B — Could it stand alone as its own product?**
No standalone ambition. The edge (zero integration tax, playbook bridge, NLP authoring) is entirely derivative of co-location with SD's CRM, Brain, email, and bookings. Outside the suite there is no wedge: NLP automation is table stakes for standalone tools (Zapier has AI, n8n has AI), the event bus has no events to fire from, and the playbook bridge connects to nothing. This lens is answered: bundled retention layer only. Pressure the council to confirm or deny whether the bundle value is strong enough to displace the internal-automation portion of the agency's existing Zapier account.

---

## Riskiest assumption to pressure-test

**That the playbook bridge + NLP authoring create enough "reduce Zapier" value to actually stick once the durable execution substrate is live.**

The durable execution blocker is known and being closed. Assuming it ships, the next open question is: do agencies actually migrate their internal-event workflows (deal-won sequences, onboarding triggers, survey routing) off Zapier once SD's engine is reliable, or do they keep one Zapier account for everything because cognitive overhead of two automation systems outweighs the cost savings? NLP authoring reduces setup friction, but if agencies have already built and forgotten Zapier zaps for these flows, the switching inertia may be stronger than the feature quality. The cheapest test is the run-log instrument itself: once the `automation_runs` log is live, measure whether activated rules are actually firing and completing versus sitting configured-but-idle — idle rules reveal that agencies set them up once and don't trust or use them.
