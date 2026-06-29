---
type: spec
domain: validation
status: shipped
date: 2026-06-17
sources:
  - scripts/seed-admin-e2e.ts
  - scripts/verify-db-target.ts
  - scripts/reset-e2e-db.ts
  - scripts/convert-client-coverage.ts
  - lib/brain/entitlement.ts
  - lib/portal-auth.ts
  - lib/mcp/types.ts
  - app/approve/[token]/page.tsx
  - lib/preview-token.ts
---

# Platform E2E + Competitive Audit (2026-06-17)

## Overview

A three-phase platform-wide audit run on branch `dev` (commit `4a5cd978`) against an isolated seeded Postgres instance (`simplerdev_e2e_audit`). Covered: environment provisioning integrity, full 146-spec e2e suite under V8 coverage, Playwright MCP browser pass over the zero-coverage UI gaps, and a 21-domain competitive gap analysis (2M-token adversarially verified workflow). Initiative is complete; findings have been triaged into per-domain boards and backlog items.

## Scope

- All 21 canonical platform domains (see [[00 - E2E Audit Index]])
- 146 e2e spec files / 1,701 tests (Playwright)
- Server-side V8 coverage (blocked by c8 OOM — see [[Platform E2E Audit 2026-06-17]])
- Competitive landscape: HubSpot, Pipedrive, Webflow, Clerk, Klaviyo, Pitch, Shopify, Cal.com, GoHighLevel, Zapier, n8n, PostHog, Sanity, WorkOS, Stripe Billing, Orb

## Method

**Phase 0 — Environment provisioning.** Isolated fresh Postgres (`simplerdev_e2e_audit`). Required `pgvector`, `pgcrypto`, `uuid-ossp` extensions pre-created manually. `drizzle-kit push` used (migrate fails on a fresh DB). Resend neutralized (test-mode sandbox). Stripe test-mode.

**Phase 1 — Full E2E suite.** `scripts/test.sh --layer=e2e` against `next dev` on `:3100` under server-side V8 instrumentation. 862 pass / 340 fail / 8 flaky / 75 skip / 416 did-not-run (59 min). Coverage collection OOM'd; sharding required to get a real number. See [[Platform E2E Audit 2026-06-17]] for full failure categorization.

**Phase 2 — MCP browser pass.** Playwright MCP exercised the zero-browser-coverage surfaces with entitlements granted (bundle service seeded). Screenshots saved at `vault/05 - Feature Specs/E2E Audit/screenshots/`. Key flows: login, CRM, pitch decks, booking, Brain /ask, public approval UI, public booking form.

**Phase 3 — Competitive gap analysis.** 21-domain research + adversarial-verification workflow (~2M tokens). Per-domain verdicts, top-10 platform-wide gaps, six cross-cutting themes, five strategic opportunities. See [[Competitive Gap Analysis 2026-06]].

## Key findings

- ~250/340 failures are the entitlement-seed gap (402/403), not product bugs. Fix: seed a `category='bundle'` service + active `client_services` row.
- Coverage pipeline blocked: c8 OOM at 8 GB heap. Server-side line coverage unobtainable for a full run.
- Genuine bugs to triage: 500s on orphaned approval dependencies, `clientApi.postText is not a function`, project-bootstrap failures.
- Competitive: "we have the primitives, not the product." Top gaps: dunning + self-serve billing portal, durable automation runtime, MFA + audit log, SaaS-resell layer.

## Recommended follow-up

Seven custom agents/workflows justified by these findings — see [[ADR proposed-audit-agents-and-workflows]].

Domain-map updates for all 21 domains are a follow-up pass (deferred to avoid doc-drift risk during this run).

## Links

- Findings: [[Platform E2E Audit 2026-06-17]]
- Competitive analysis: [[Competitive Gap Analysis 2026-06]]
- Per-domain boards: [[00 - E2E Audit Index]]
- Agent/workflow recommendations: [[ADR proposed-audit-agents-and-workflows]]
- Screenshots: `vault/05 - Feature Specs/E2E Audit/screenshots/`
