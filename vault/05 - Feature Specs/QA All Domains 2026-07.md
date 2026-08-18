---
type: spec
domain: validation
status: in-progress
date: 2026-07-06
sources:
  - vault/06 - Validation/QA Flows.md
  - vault/06 - Validation/Gate Picking.md
  - vault/06 - Validation/Platform E2E Audit 2026-06-17.md
---

# QA All Domains 2026-07

Full-platform QA campaign on `dev` — every feature domain gets an exploratory + interactive `/qa` pass against a local environment, findings fixed at root cause or logged, per-domain gates run.

**Status board:** SimplerDevelopment portal, project **157 "Platform QA 2026-07"** (`kanban_*` MCP tools). One card per domain, SKU `QAD-001…022`, lanes Backlog → Planned → In Progress → Validating → Approved → Shipped.

## Environment (Phase 0, verified 2026-07-06)

- `dev` = superset of `org/main` (merge commit `138f6588`, incl. #37 setup wizard), pushed to origin.
- DB: docker container `simplerdev-qa-db` (pgvector/pgvector:pg16) on `localhost:5544`, db `railway`, trust auth — matches `.env.local`. Schema via `drizzle-kit push`, seeded via `bun run db:seed:dev` (admin `info@simplerdevelopment.com`, demo tenant `demo@simplerdevelopment.com`).
- App: `bun dev` on **:3001** (docker `simplerdev-app` holds :3000; not QA'd — stale image). `NEXT_PUBLIC_SITE_URL=http://localhost:3001` override.
- Docker mailpit (:8025/:1025) and realtime (:3030) reused for email/chat domains.
- Admin login verified via NextAuth credentials flow (session cookie + role admin).

## Domain order (risk-first, QAD-### = card SKU)

QAD-001 Auth & Security → QAD-002 Billing & Stripe → QAD-003 CRM → QAD-004 CMS & Blocks → QAD-005 Visual Editor → QAD-006 Sites, Hosting & Publishing → QAD-007 Company Brain & AI → QAD-008 Projects, Tickets & Kanban → QAD-009 Email & Campaigns → QAD-010 Storefront & Commerce → QAD-011 E-Sign & Approvals → QAD-012 Bookings & Services → QAD-013 Surveys → QAD-014 Automations & Workflows → QAD-015 Integrations → QAD-016 Agency, Onboarding & Branding → QAD-017 Chat, Realtime & Voice → QAD-018 Pitch Decks → QAD-019 Print Designer → QAD-020 Plugins & Extension → QAD-021 Agentic OS → QAD-022 AB Testing

## Method (per domain)

1. Read `vault/03 - Domains/<domain>.md`.
2. `/qa` exploratory across the domain's portal/admin routes, then `/qa` interactive on the 2–4 golden-path flows the map names. Visual editor / blocks / sites also get `/visual-compare` per [[QA Flows]].
3. Gates per [[Gate Picking]]; `bun test:tenancy` after anything data-access-heavy.
4. External-service flows (Stripe, Google OAuth, LinkedIn, live email, deploys) are **not testable locally** — separate count on the card, never failures.
5. Fix root-cause (one `fix(<scope>): … (QAD-###)` commit each, re-verify) or log a Backlog card with repro + file:line + severity.
6. Card records flows tested / pass-fail / commits / untestable list; push to origin when the domain ships.

## Close-out (Phase 2)

`bun test:critical` full-platform gate → refresh [[QA Flows]] / [[Coverage Map]] → write `vault/06 - Validation/Platform QA Audit 2026-07.md` (mirror the 2026-06-17 format) → completion ritual on touched Domain Maps.
