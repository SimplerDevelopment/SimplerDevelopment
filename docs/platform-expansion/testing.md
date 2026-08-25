# Testing

Test layers follow `tests/CLAUDE.md` and `tests/TESTING_PLAN.md`. The platform
expansion adds coverage at every layer.

## Unit (Vitest, `tests/unit/`)

- **Channel Gateway** — `tests/unit/channels.test.ts` (already added): message
  normalization, idempotency (duplicate → no writes), contact resolution,
  conversation resolution, event dispatch, policy deny/send/error.
- Message normalization & identity normalization (E.164, email).
- Channel policies (opt-out, window, business hours, media capability).
- Contact resolution & merge suggestions.
- Agent Router classification + tool-permission grants.
- Handoff state transitions.
- Sequence scheduler + stop conditions.
- Portal authorization.
- AI budgets.

## Integration (needs DB, `tests/integration/`)

WhatsApp → Conversation · Instagram → Conversation · Messenger → Conversation ·
WebChat → Conversation · Conversation → Agent · Agent → MCP · Agent → Booking ·
Agent → CRM · Sequence → Channel · Portal → CRM · Portal → Booking · Portal →
Ticket.

## E2E (Playwright, `tests/e2e/`)

Seven golden paths: Omnichannel · Sales Agent · Booking · Human handoff ·
Customer Portal · Sales Sequence · Cross-tenant.

## Tenancy (`bun test:tenancy`)

Explicit fail-closed tests: Tenant A cannot read Tenant B's messages, send
through Tenant B's channel, use Tenant B's agent, view Tenant B's portal, enroll
Tenant B's contacts, access Tenant B's sequences, or use Tenant B's credentials.

## Mocks (no real external accounts)

Meta / WhatsApp / Instagram / Messenger / Email / AI providers / Stripe /
webhooks are mocked. No production credentials in tests.

## Gates

After each phase: `bun run typecheck` (or `NODE_OPTIONS=--max-old-space-size=8192
bunx tsc --noEmit`), `bun run lint`, `bun test` (unit), `bun test:tenancy`
(after any data-access change), `bun test:critical` before declaring done.
