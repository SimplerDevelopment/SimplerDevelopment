# AI Agents

## Status

**Planned** (Phase 9–16). Agent infrastructure exists in the codebase
(`lib/ai/`, `lib/agentic-os/`, `lib/agent-flows/`, `simplerdevelopment-agents/`),
but there is no server-side conversational agent layer routing against the
inbox yet. The foundation for it is the Channel Gateway + unified conversations
(Phase 2–3, implemented).

## Design

```
Incoming Message (via ChannelGateway)
         │
         ▼
   Agent Router (deterministic rules first, then LLM classify)
         │
         ▼
   Specialized Agent
         │
         ▼
   Tools / MCP (existing 450+ tools, extended)
         │
         ▼
   Domain Services (CRM, Brain, Bookings, Automations)
```

## Agent definitions

Stored in `ai_agents` (to be created):

- `tenantId · name · type · description · enabled`
- `modelProvider · model · instructions · temperature · maxSteps`
- `autonomyLevel` (ASSIST | SEMI_AUTONOMOUS | AUTONOMOUS)
- `availableTools` (the MCP tool subset grant)
- `knowledgeCollections` (Brain collections to consult)
- `allowedChannels · businessHours · handoffPolicy · budget · status`

## The eight agents

1. **Router Agent** — classify intent (FAQ/sales/booking/support/billing/
   complaint/human_request/unknown). Deterministic rules first; cheap model
   fallback.
2. **Reception Agent** — hours, location, services, FAQ, Company Brain lookup,
   initial lead capture. Never invents.
3. **Sales Agent** — detect opportunity, qualify, create/update contacts +
   deals, move pipeline stages, consult products, prepare next steps, assign
   owner. No discounts outside policy.
4. **Booking Agent** — list_services, list_staff, get_availability,
   create/reschedule/cancel bookings using the existing booking engine. Never
   invents availability.
5. **Support Agent** — consult Brain, read customer context, create/classify
   tickets, respond to simple problems, escalate complex ones. Sensitive actions
   require approval.
6. **Follow-up Agent** — identify leads without response, pending quotes,
   stalled deals, contacts without activity. Recommends or activates a
   compatible Sales Sequence. Does not send indiscriminately.
7. **Retention Agent** — detect inactive/dropping-activity/churn-risk contacts,
   create segments, activate allowed flows. Respects consent.
8. **Supervisor Agent** — observes: permissions, sensitive actions, discounts,
   mass cancellations, destructive actions, campaigns, errors, anomalies.
   Can allow / deny / require_human_approval.

## Tool permissions

Each agent has a server-side grant of allowed MCP tools. Example:

- Reception: `READ` services, business, brain, availability; `WRITE` contact,
  conversation. `NO` refund, delete, billing-admin.
- Sales: `READ/WRITE` contacts, deals, pipeline-stages, products; `NO` refund,
  delete, billing-admin.
- Booking: `READ` services, staff, availability; `WRITE` bookings.

## Human handoff

Conversation `aiMode`: `ai | human | paused | hybrid | closed`. When a human
takes over (`aiMode = human`), the AI stops replying immediately. The agent
route is checked per message; if the mode is human, the agent is skipped.

Audit trail: `who, when, why, fromState, toState`.

## AI suggested replies

In `human`/`hybrid` mode, the operator can click "Generate AI Reply": the
system uses conversation + CRM + Brain + booking context + customer history to
produce a draft. The human edits/sends/discards; it is never sent automatically.

## Model routing

Reuses `lib/ai/models.ts` task registry. Cheap model for routing/classification;
standard model for normal conversation; premium model for complex reasoning.
Fallback to an alternate provider. BYOK + platform-key fallback via
`resolve-client-key.ts`.

## Cost tracking

Per-agent, per-tenant: `ai_cost_events` (agent, provider, model, inputTokens,
outputTokens, cachedTokens, cost, requestId, conversation, timestamp). Config:
monthly budget, daily budget, warning threshold, hard limit, fallback model.