# Platform Expansion — Repository Audit

> Grounded audit of the SimplerDevelopment codebase, produced **before** any
> implementation. Every claim below is verified against the code that exists at
> `main` (commit `6371912`). This is the source-of-truth for the four requested
> capabilities: **Omnichannel**, **AI Agents**, **Customer Portal**, **Sales
> Sequences**.

---

## 1. What the platform already is

SimplerDevelopment is a ~357k-line Next.js 16 (App Router) monorepo. One
multi-tenant codebase serves three audiences through three route trees:

- `app/admin/**` — global internal panel (the SaaS operator)
- `app/portal/**` — per-tenant client UI (the business that rents the platform)
- `app/sites/**` + `app/s/**` — per-tenant public websites

**Tenancy model (reuse this — do not invent another):**

- `clients` (`lib/db/schema/sites.ts`) is the tenant root. Every tenant-scoped
  table keys off `clientId` and/or `siteId`.
- `clientWebsites` — a tenant can own many websites (`siteId`).
- `clientMembers` — many users per tenant with `owner | admin | member | viewer`
  roles; `users` + NextAuth v5 (beta) provide auth.
- White-label already exists on `clients` (`customDomain`, `agencyName`,
  `agencyLogoUrl`, `agencyPrimaryColor`, `whiteLabelEnabled`).
- Billing mode lives on `clients.billingMode` (`agency | saas | byok`).

**Realtime already exists** (do not add polling): `lib/chat/realtime.ts`
(Postgres `LISTEN/NOTIFY` → SSE), `lib/realtime/`, and a dedicated
`packages/realtime-server` (Yjs + y-websocket).

---

## 2. What already exists, domain by domain

### CRM — fully reusable

`lib/db/schema/crm.ts` + `lib/crm/`:

- `crm_companies`, `crm_contacts` (already has `phone`, `email`, `score`,
  `source`, `attribution`), `crm_pipelines`, `crm_pipeline_stages`,
  `crm_deals` (value, status, priority, owner), `crm_activities`,
  `crm_tags`/`crm_contact_tags`, `crm_custom_fields`/`crm_custom_field_values`,
  `crm_scoring_rules` (event→points lead scoring **already exists**),
  `crm_proposals` (draft/sent/viewed/accepted/declined/expired + `clientToken`
  public views + signature), `crm_contracts` + e-sign (DropboxSign + per-signer
  tokens), `crm_notifications`, `crm_saved_views`, enrichment.
- **CRM email threads already exist**: `crm_email_messages`
  (`providerMessageId` unique idempotency, `threadKey`, `direction` inbound/
  outbound, Gmail ingest + Resend outbound).
- **CRM email sequences already exist**: `crm_sequences`, `crm_sequence_steps`
  (`delayHours`, subject, body), `crm_sequence_enrollments`
  (`status`, `currentStep`, `haltedReason`), `crm_sequence_sends`
  (unique `(enrollmentId, stepId)` idempotency). A
  `process-crm-sequences` cron already drains them. **This is the seed of the
  Sales Sequences capability — it is email-only today and must be extended, not
  rebuilt.**

### Contacts / identity

- Contacts exist (`crm_contacts`) but there is **no multi-channel identity
  entity**. `phone`/`email` are single scalar columns. WhatsApp / Instagram /
  Facebook PSID / webVisitorId identities have no home. **Gap → new
  `contact_identities` + `suggested_merges`.**

### Conversations / messages / chat / help desk

`lib/db/schema/chat.ts` + `lib/chat/` + `app/api/portal/chat/` +
`app/portal/inbox/`:

- `chat_widgets` (per-site web widget config), `chat_conversations`
  (widgetId, visitorId, status open/assigned/closed, assignedUserId),
  `chat_messages` (authorKind visitor/agent/system, body, attachments, occurredAt).
- **WebChat widget already exists and is embeddable**: `app/widget/chat/`
  (loader page) with SSE realtime + HMAC visitor tokens.
- **Unified Inbox UI already exists** (`app/portal/inbox` + `[id]`), and chat
  MCP tools exist (`lib/mcp/tools/chat.ts`).
- **These are the unified conversation core** — they must be *extended* (add
  channel/provider/connection/external ids/direction/message-type/status/
  media/metadata/contactId) rather than duplicated. `chat_conversations` is
  currently web-chat-shaped (`widgetId` NOT NULL), which is the key extension.

### Help desk / tickets

`lib/db/schema/pm.ts` + `lib/tickets/` + `app/portal/tickets/`:

- `support_tickets` (status, priority, category, assignedTo, CSAT, SLA due
  dates), `ticket_messages` (authorId, body, isInternal, attachments).
- `lib/tickets/sla.ts` computes SLA targets. Reusable for portal ticket
  creation.

### Bookings — fully reusable, do not rebuild

`lib/db/schema/tools.ts` (`booking_pages`, `bookings`, `booking_page_members`,
`booking_add_ons`, `booking_waivers`, `booking_quotes`,
`booking_date_overrides`, `gift_certificates`) + `lib/booking/`
(`availability.ts`, `capacity.ts`, `assign.ts`, `timezone.ts`) +
`lib/google-calendar.ts`:

- Availability, staff selection, round-robin/fewest-upcoming assignment,
  reschedule (tokens + count), group capacity, exclusive-slot concurrency guard
  (`bookings_exclusive_slot_idx`), Google Calendar sync, Zoom, gift certificates,
  waivers, quotes. All exists. Agents + portal must call these services.

### Company Brain / RAG — fully reusable

`lib/db/schema/brain.ts` + `lib/brain/` (60+ files): embeddings (pgvector),
`search.ts`, `rerank.ts`, notes, meetings, playbooks, profiles, topics,
glossary, goals. The `mcp-sdk-adapter.ts` exposes Brain tools to agents.

### Automations / workflows

- `lib/automation/` — `event-bus.ts` (`emitEvent`, durable `automation_jobs`
  journal, `AUTOMATION_EVENTS` catalog), `engine.ts` (rules engine),
  `nlp-parser.ts`, `schedule.ts`, `delayed-action-job.ts`.
- `lib/db/schema/workflows.ts` + `lib/workflows/` — visual workflow builder
  (trigger → graph of nodes), `workflow_run_steps` queue drained by
  `process-workflow-runs` cron.
- `lib/db/schema/brain.ts` also holds `automation_rules`.

### MCP — 450+ tools already exist, extend only

`lib/mcp/server.ts` + `lib/mcp/tools/*` (46 files incl. `crm.ts`, `chat.ts`,
`bookings.ts`, `tickets.ts`, `automations.ts`, `workflows.ts`, `brain.ts`,
`email.ts`, `integrations.ts`, `agent-flows.ts`). Every tool carries a scope
guard (`requireScope`). The new omnichannel/agent/sequence/portal tools must
follow `lib/mcp/CLAUDE.md` (handler + schema + scope guard in lockstep).

### Agents — infrastructure exists, no conversational-agent layer yet

- `lib/ai/` — provider-agnostic seam: `models.ts` (task→model registry + env
  override + BYOK), `llm.ts` (`complete`/`completeObject`/`streamComplete`),
  `agent-loop.ts` (`completeAgentLoop` non-streaming tool loop),
  `resolve-client-key.ts` (BYOK + platform fallback).
- `lib/agentic-os/` — admin-triggered headless Claude Code skill runs
  (`executor.ts`, `registry.ts`, `rules.ts`, `types.ts`).
- `lib/agent-flows/` + `lib/db/schema/agentFlows.ts` — visual agent-flow
  designer (nodes/edges), executed *by a Claude Code runner*, not the server.
- `simplerdevelopment-agents/` — separate Mastra service (deterministic brain
  workflow + dynamic portal assistant) that **connects to the portal MCP as a
  client** with short-lived single-tenant tokens. The correct pattern for the
  new agents: **they are MCP clients, never SQL**.
- **Gap → a server-side conversational Agent layer** (Router / Reception /
  Sales / Booking / Support / Follow-up / Retention / Supervisor) driven off the
  unified inbox, operating through domain services + the existing MCP tools.

### Email — reusable

`lib/db/schema/email.ts` + `lib/email/` + Resend + Gmail inbound (Google
Workspace connections in `tools.ts`): lists, subscribers, campaigns, templates,
segments, journeys (`email_journeys` — a full branching drip engine),
transactional templates, A/B.

### Stripe / billing — reusable

`lib/db/schema/billing.ts` + `lib/billing/` + `lib/stripe/`: AI credit ledger,
usage metering, invoices (`invoices`, `invoice_items`), Stripe subscriptions,
metered items, usage thresholds/alerts, `client_api_keys` (BYOK encrypted).
Portal payments must reuse `lib/stripe/` (Checkout/Elements), never raw cards.

### Jobs / cron / outbox

- `lib/jobs/` + `lib/db/schema/jobs.ts` (`internal_jobs`) + 50+ `app/api/cron/*`
  routes. The `automation_jobs` journal + `workflow_run_steps` queue are the
  existing durable-job patterns to reuse for the channel outbox.
- **Gap → a channel outbox** (queued/processing/sent/delivered/read/retrying/
  failed with exponential backoff + `externalMessageId` idempotency).

### Auth / portal / consent

- `lib/auth.ts`, `lib/portal-client.ts`, `lib/active-client.ts` (site resolver),
  `lib/portal-auth.ts`, `lib/mcp-auth.ts` (scope guards + OAuth).
- `app/portal/` is the tenant admin UI. `app/proposal`, `app/contract`,
  `app/book`, `app/pitch-deck`, `app/widget` are the existing **public
  customer-facing** surfaces (token-based, no login).
- **Gap → a unified Customer Portal with login** (email/password / magic link /
  OAuth) bound 1:1 to a tenant + a CRM contact, showing bookings, tickets,
  quotes, invoices, documents, payments, messaging.

### GDPR / consent

- No dedicated consent ledger found (channel-level opt-in/opt-out with
  `policyVersion` is a gap). Data export/delete exist only partially.

---

## 3. What can be reused vs. what must be extended vs. what is missing

| Capability | Reuse as-is | Extend | Build new |
|---|---|---|---|
| CRM identity | `crm_contacts`, `crm_companies`, `crm_deals` | — | `contact_identities`, `suggested_merges` |
| Unified conversations | `chat_conversations`, `chat_messages`, inbox UI, realtime | add channel/provider/external-id/direction/status/media/contactId | — |
| WebChat | widget, SSE, HMAC tokens | config surface (theme, AI toggle, branding) | — |
| WhatsApp / Instagram / Messenger | Meta OAuth patterns in `lib/oauth`, `lib/google*` | — | Meta adapters + webhook verify + `channel_connections` |
| Email channel | `crm_email_messages`, Resend, Gmail ingest | — | wire as a gateway adapter |
| Channel gateway | — | — | `lib/channels/` (adapter interface, capabilities, policies, idempotency, outbox) |
| AI agents | `lib/ai/models.ts`, `llm.ts`, `agent-loop.ts`, Brain tools, MCP client pattern | — | agent definitions + router + 8 agent personalities + tool-permission gate |
| Customer Portal | `app/proposal`, `app/contract`, `app/book`, invoices, Stripe | — | portal login + `portal_users` + dashboard/profile/bookings/tickets/messaging |
| Sales Sequences | `crm_sequences`/steps/enrollments/sends + cron | add step types (whatsapp/instagram/messenger/task/condition/agent/webhook), stop conditions, reply detection, business hours | visual builder, analytics |
| Analytics / cost | `mcp_tool_calls`, `agent_action_logs`, `usage_*`, AI credit ledger | — | AI cost ledger + omnichannel/agent/sequence dashboards |

---

## 4. Tables affected and new tables needed

### New tables (proposed)

- `channel_connections` — tenant + provider + externalAccountId + displayName +
  status + `encryptedCredentials` + metadata + last webhook/inbound/outbound/error.
- `contact_identities` — `(contactId, kind, value)` unique; kinds:
  `phone | email | whatsapp | instagram | facebook | webchat`.
- `suggested_merges` — weak-evidence contact merge proposals + manual
  accept/reject.
- `channel_consent` — `(contactId | identity, channel, optIn/optOut, source,
  policyVersion, timestamp)`.
- `channel_outbox` — queued outbound messages with provider message id
  idempotency, retry count, backoff, dead-letter.
- `portal_users` — end-customer logins bound to `(clientId, contactId)` +
  `portal_sessions`/magic-link tokens.
- `ai_agents` + `agent_tool_grants` + `agent_runs` + `agent_messages` +
  `ai_cost_events` (per-tenant token/cost ledger).
- `sequence_steps`/`sequence_enrollments` are **extensions of the existing
  `crm_sequence_*` tables** (or migration of those), adding channel/agent/
  condition/stop-reason columns + `sequence_reply_events` + analytics rollups.

### Tables extended (existing, add columns — additive migrations only)

- `chat_conversations` — `channel`, `provider`, `connectionId`, `contactId`,
  `externalConversationId`, `aiMode` (ai/human/paused/hybrid/closed), `labels`,
  `dealId`, `priority`.
- `chat_messages` — `channel`, `direction`, `externalMessageId`,
  `senderIdentity`/`recipientIdentity`, `messageType`, `media`, `status`,
  `metadata`, `replyToExternalMessageId`, `sentAt`/`receivedAt`/`deliveredAt`/
  `readAt`/`failedAt`.
- `crm_contacts` — nothing required (identities move to `contact_identities`).
- `crm_sequences` / `crm_sequence_steps` / `crm_sequence_enrollments` — channel,
  step type, conditions, stop-reason, agent id, business-hours.

> All schema changes are **additive** and follow `lib/db/CLAUDE.md`: edit
> `lib/db/schema/<domain>.ts`, `bun run db:generate`, never hand-edit
> `drizzle/*.sql`, hand-apply to metro before merging to `main`.

---

## 5. APIs / MCP / security / tenancy

### New API surface (portal + public)

- `app/api/portal/channels/*` — connection CRUD (never return secrets).
- `app/api/webhooks/meta/*`, `app/api/webhooks/whatsapp`, `.../instagram`,
  `.../messenger` — signature-verified, idempotent inbound webhooks.
- `app/api/public/widget/*` — widget embed + visitor auth.
- `app/api/portal/agents/*` — agent config, runs, usage.
- `app/api/portal/sequences/*` — sequence CRUD + enrollment.
- `app/api/portal/customer-portal/*` + `app/portal-customer/**` (public,
  token/session-scoped) — dashboard, bookings, tickets, quotes, invoices,
  documents, payments, messaging.
- `app/api/cron/process-channel-outbox`, `.../process-agent-queue`,
  `.../process-sequences` (extend existing `process-crm-sequences`).

### MCP additions (tenant-scoped, scope-guarded)

- Omnichannel: `list_channels`, `get_channel`, `list_conversations`,
  `get_conversation`, `list_messages`, `send_message`, `send_media`,
  `assign_conversation`, `take_over_conversation`, `return_to_ai`, `pause_ai`,
  `close_conversation`.
- Agents: `list_agents`, `get_agent`, `enable_agent`, `disable_agent`,
  `run_agent`, `get_agent_activity`, `get_agent_usage`.
- Sequences: `list_sequences`, `get_sequence`, `enroll_contact`,
  `pause_enrollment`, `resume_enrollment`, `cancel_enrollment`,
  `get_sequence_performance`.
- Portal: `get_customer_portal`, `get_customer_documents`,
  `get_customer_bookings`, `get_customer_tickets`, `get_customer_payments`.

### Security controls required (and where the pattern already exists)

- Tenant isolation: every query filters `clientId`; IDOR guards exist in chat
  MCP tools — replicate everywhere. `bun test:tenancy` after any data change.
- Webhook signatures: Meta `X-Hub-Signature-256` — mirror the Google Drive
  `driveChannelToken` / Microsoft `subscriptionClientState` verification
  pattern.
- Encrypted credentials: `encryptedText` column type (`lib/db/schema/columns.ts`)
  and `lib/crypto/secrets.ts` (AES-256-GCM, already used for LinkedIn tokens).
- Tool permissions: server-side authorization per agent (scope-style grants).
- SSRF: `lib/ssrf-guard.ts` exists — reuse for any outbound URL fetch.
- Rate limits: `@upstash/ratelimit` + `lib/chat/rate-limit.ts`.
- Audit: `agent_action_logs`, `crm_contract_signing_events` patterns; add
  `actorType (human|agent|automation|system)` audit log for handoffs + portal
  logins.

---

## 6. Risks

1. **Prod schema drift (sharpest edge in the repo)** — Vercel deploys do not run
   migrations; metro must be hand-migrated. Every additive column the code reads
   must be applied to metro before merge or the whole route 500s.
2. **Conversation core is web-chat-shaped** — `chat_conversations.widgetId` is
   NOT NULL. The unified model must make it nullable or introduce a channel
   variant without breaking the existing widget + inbox + realtime.
3. **Meta API drift** — Cloud API / Messenger / Instagram APIs change; adapters
   must be isolated behind the gateway so policy/version differences don't leak.
4. **Agent safety** — agents must never reach SQL; only domain services / MCP
   tools with server-side tool grants + approval for destructive/money actions.
5. **Sales-sequence spam** — consent + business-hours + reply-detection stop
   conditions must be enforced in the scheduler (not the LLM).
6. **Cross-tenant leak** — the single highest-regression-risk change; tenancy
   tests must fail closed.
7. **Scope** — this is a 25-phase, multi-month build. It must be landed in
   small, reviewable commits (Phase 2/3 foundation first), not one monolith.

---

## 7. Implementation order

1. **Phase 1** — this audit (done).
2. **Phase 2** — unified message/conversation model + contact identities
   (extend `chat_*`, add `contact_identities`, `suggested_merges`).
3. **Phase 3** — Channel Gateway (`lib/channels/`: adapter interface,
   capabilities, policy engine, idempotency, outbox) + WebChat adapter.
4. **Phase 4–8** — WebChat extension, Unified Inbox filters, WhatsApp,
   Instagram, Messenger (Meta OAuth + webhooks + adapters).
5. **Phase 9–16** — Agent infrastructure (definitions, tool grants, router,
   reception/sales/booking/support/follow-up/retention/supervisor).
6. **Phase 17** — Customer Portal (login, dashboard, profile, bookings, quotes,
   invoices, payments, tickets, documents, messaging).
7. **Phase 18–19** — Sales Sequences (extend `crm_sequences` to omnichannel +
   new step types + stop conditions + reply detection + builder + analytics).
8. **Phase 20–22** — MCP extensions, analytics/AI cost, security hardening.
9. **Phase 23–25** — full test suite (unit/integration/E2E/tenancy), docs,
   production readiness.
