# Platform Expansion

Four new capabilities layered on top of the existing SimplerDevelopment core:

1. **Omnichannel** — WhatsApp, Instagram, Messenger, WebChat, and Email unified
   behind one Channel Gateway and one conversation model.
2. **AI Agents** — Router, Reception, Sales, Booking, Support, Follow-up,
   Retention, and Supervisor agents that operate through domain services and the
   MCP tool surface (never SQL).
3. **Customer Portal** — a login for a tenant's *end customers* (distinct from
   the tenant admin `app/portal`), surfacing bookings, tickets, quotes, invoices,
   documents, payments, and messaging.
4. **Sales Sequences** — omnichannel sales cadences extending the existing
   email-only `crm_sequences` engine.

## Documents

| Doc | Purpose |
|---|---|
| [`audit.md`](./audit.md) | Grounded inventory of what exists, what to reuse, extend, and build |
| [`architecture.md`](./architecture.md) | Target architecture and the reuse-everything principle |
| `omnichannel.md` | Channel Gateway, adapters, policies, idempotency (Phase 2–8) |
| `agents.md` | Agent layer, definitions, tool permissions, handoff |
| `customer-portal.md` | Portal auth, dashboard, and per-module screens |
| `sales-sequences.md` | Sequence model, step types, stop conditions, builder |
| `security.md` | Tenancy, signatures, encryption, tool grants, audit |
| `testing.md` | Unit/integration/E2E/tenancy strategy and mocks |
| `troubleshooting.md` | Operational runbook |

## Status

- **Phase 1 — audit**: complete (`audit.md`).
- **Phase 2/3 — unified conversation model + Channel Gateway**: code-complete
  (`lib/db/schema/channels.ts`, extended `lib/db/schema/chat.ts`, `lib/channels/`,
  `tests/unit/channels.test.ts`).
  - Typecheck + unit tests pass.
  - ⚠️ **Migration not yet generated** — run `bun run db:generate` (with a DB
    context) and hand-apply to metro before merge, per `lib/db/CLAUDE.md`.
- **Phases 4–25**: not started (Meta/email adapters, agents, portal, sequences).

See `architecture.md` for the canonical diagram and layering rules.
