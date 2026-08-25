# Platform Expansion — Architecture

## Principle: SimplerDevelopment stays the core; everything is layered on top

The platform does **not** get a second CRM, a second booking engine, a second
RAG, or a second conversation store. The four new capabilities are adapters,
agents, a portal surface, and a cadence engine that all call the existing
domain services.

```
                              CLIENTES
        WhatsApp  Instagram  Messenger  WebChat  Email
            │          │          │         │       │
            └──────────┴──────────┴────┬────┴───────┘
                                       ▼
                              CHANNEL GATEWAY
                          (normalize · idempotency ·
                           resolve contact · persist ·
                           policy · outbox)
                                       │
                                       ▼
                           UNIFIED CONVERSATIONS
                    (chat_conversations + chat_messages, extended)
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
                  CRM            AGENT LAYER           HUMAN
                             (router → specialized     (take over /
                              agents → tools/MCP →      reply)
                              domain services)
                                       │
                                       ▼
                               COMPANY BRAIN / MCP
                                       │
                 ┌─────────────────────┼─────────────────────┐
                 ▼                     ▼                     ▼
             Bookings                CRM              Automations
                                                         │
                                                         ▼
                                                 SALES SEQUENCES
                                                         │
                              CUSTOMER PORTAL
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
                 Cliente      Presupuestos     Tickets
                 Reservas     Facturas         Pagos
```

## Layering rules (load-bearing)

1. **Upper modules never call Meta/Instagram/Facebook/Resend directly.** They
   call `ChannelGateway`. Provider specifics live inside adapters + policies.
2. **Agents never touch SQL.** They call domain services or MCP tools. Tool
   grants are enforced server-side.
3. **The LLM never decides legality.** `ChannelPolicyEngine` enforces provider
   windows, templates, opt-out, and business hours; the model only chooses
   *content*.
4. **One conversation core.** `chat_conversations`/`chat_messages` (extended)
   are the single store for WebChat, WhatsApp, Instagram, Messenger, and Email.
5. **One CRM identity.** `contact_identities` maps every channel handle to the
   same `crm_contacts` row; merging is manual (weak evidence only suggests).
6. **Tenancy by construction.** Every table is `clientId`/`siteId` keyed; every
   query filters on it; cross-tenant access fails closed.

## Component map

| Layer | Files | Reuses |
|---|---|---|
| Schema | `lib/db/schema/channels.ts`, extended `chat.ts` | `columns.ts` (`encryptedText`), `crm.ts`, `sites.ts` |
| Channel Gateway | `lib/channels/{types,capabilities,policies,gateway,outbox}.ts` | `lib/chat/realtime.ts`, `lib/automation/event-bus.ts`, `lib/jobs/` |
| Adapters | `lib/channels/adapters/{whatsapp,instagram,messenger,webchat,email}.ts` | `lib/oauth/`, `lib/email/`, `lib/ssrf-guard.ts` |
| Agents | `lib/agents/` | `lib/ai/{models,llm,agent-loop}.ts`, `lib/mcp/`, Brain tools |
| Portal | `app/portal-customer/**` + `app/api/portal/customer-portal/**` | `app/proposal`, `app/contract`, `app/book`, `lib/stripe/`, `lib/booking/` |
| Sequences | extend `crm_sequences` + `lib/sequences/` | `lib/automation/`, `lib/jobs/`, channel outbox |
| MCP | `lib/mcp/tools/{channels,agents,sequences,portal}.ts` | `lib/mcp/CLAUDE.md` registrar pattern |

## Data model sketch

```
clients ─┬─ channel_connections (provider, encryptedCredentials, status)
         ├─ chat_conversations  (channel, provider, connectionId, contactId,
         │                        externalConversationId, aiMode, dealId, priority)
         │     └─ chat_messages (channel, direction, externalMessageId,
         │                       messageType, media, status, metadata, timestamps)
         ├─ contact_identities  (contactId, kind, value)  UNIQUE(kind, value)
         ├─ suggested_merges    (contactA, contactB, evidence, status)
         ├─ channel_consent     (channel, optIn/out, source, policyVersion)
         ├─ channel_outbox      (externalMessageId, status, attempts, backoff)
         ├─ ai_agents           (type, model, instructions, autonomy, tools)
         ├─ agent_runs          (agentId, conversationId, status, usage)
         ├─ ai_cost_events      (agent, provider, model, tokens, cost)
         └─ portal_users        (clientId, contactId, auth kind, credentials)
```

`crm_sequences` is extended (channel + step-type + condition + stop-reason +
business-hours) rather than replaced.

## Event vocabulary (reuses `lib/automation/event-bus.ts`)

`channel.message.received`, `channel.message.sent`, `conversation.created`,
`conversation.assigned`, `conversation.closed`, `agent.started`,
`agent.completed`, `agent.failed`, `agent.handoff`, `portal.user.created`,
`portal.quote.accepted`, `portal.ticket.created`, `sequence.enrolled`,
`sequence.step.completed`, `sequence.replied`, `sequence.completed`,
`sequence.stopped`.

## Security invariants

- Never trust `tenantId/contactId/conversationId/agentId/sequenceId/
  portalUserId` from the client — resolve them server-side.
- Webhook signatures verified before any write; every external id has a unique
  constraint for idempotency.
- Credentials stored with `encryptedText`/`lib/crypto/secrets.ts`; never sent to
  the frontend.
- Agent autonomy: `ASSIST` (propose) / `SEMI_AUTONOMOUS` (low-risk) /
  `AUTONOMOUS` (policy). Destructive/money/discount actions require approval.
