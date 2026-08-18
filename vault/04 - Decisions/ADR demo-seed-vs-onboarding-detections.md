---
type: adr
domain: onboarding
status: accepted
date: 2026-07-09
decided: 2026-07-09
sku: OBQA-003
supersedes_partial:
  - vault/05 - Feature Specs/GTM Launch Board.md (Activation — demo-seeder SHIPPED 2026-06-11)
sources:
  - lib/signup/service.ts
  - lib/onboarding/demo-seed.ts
  - lib/onboarding/detections.ts
  - vault/05 - Feature Specs/Go-To-Market — Self-Serve SaaS.md
  - vault/05 - Feature Specs/Market-Ready Product — PRD.md
---

# ADR: Demo-seed workspace vs. accurate onboarding detections

**Status: accepted** 2026-07-09 (owner chose option **A** — remove the seeder). Shipped in PR #70 (`fix/obqa-003-demo-seed`). The GTM specs below are updated to drop the demo-seed activation strategy.

## Context

Two shipped features collide:

1. **Demo-seeder** (`lib/onboarding/demo-seed.ts`, shipped 2026-06-11, GTM Launch Board): every new signup is seeded with a sample CRM company/contacts/deals + a "Onboarding Checklist (sample)" project. Rationale (Go-To-Market — Self-Serve SaaS §6): *"Every signup lands in a pre-seeded demo workspace so the agent's power is visible in the first message — zero cold-start."*
2. **Per-domain onboarding detections** (`lib/onboarding/detections.ts`): the quick-setup wizard auto-detects completion with bare tenant-scoped `EXISTS` queries — `crm.hasContact`, `crm.hasPipeline`, `crm.hasDeal`, `projects.hasProject`.

**The bug:** the seeded sample rows falsely pre-satisfy those detections, so a brand-new user sees "add your first contact / deal / project" already ticked green — the onboarding checklist is complete before they've done anything.

## Options

- **(A) Remove the demo-seeder** — signups start empty; detections become truthful. Reverses the GTM "pre-seeded demo" activation strategy. (This is what OBQA-003 codes.)
- **(B) Keep the demo-seeder, exclude sample rows from detections** — tag seeded rows (e.g. `metadata.sample = true`) and add `AND NOT sample` to each detection query. Preserves the demo-workspace GTM strategy; larger, per-detection change.

## Decision — (A), accepted 2026-07-09

Chose **(A)** per OBQA-003: remove the seeder. The onboarding checklist reading "done" on an untouched account is a worse first-run signal than an empty workspace, and the agent-led *"set up YOUR business"* flow works from empty. This reverses the shipped "populated workspace on first message" activation bet; the GTM specs are updated accordingly. If activation metrics later show the empty-workspace cold-start hurts, revisit with option (B) (tag sample rows `metadata.sample=true` and exclude from detections) rather than re-adding the untagged seeder.

## Consequences / out of scope

- Existing already-seeded clients keep their `(sample)` rows and stay falsely pre-satisfied — a backfill delete is a separate product call, not done here.
- `crm.hasPipeline` still auto-satisfies the moment a user opens the CRM pipelines page (GET lazily calls `ensureDefaultPipeline`) — pre-existing, separate ticket.
- If (A) is accepted: update `Go-To-Market — Self-Serve SaaS.md` §6, `Market-Ready Product — PRD.md`, and the GTM Launch Board activation line to drop the demo-seed strategy. Left unedited until sign-off.
