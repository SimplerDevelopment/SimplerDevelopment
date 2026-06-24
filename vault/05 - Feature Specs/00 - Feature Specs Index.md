---
type: index
date: 2026-06-09
---

# Feature Specs

The planning home — new feature planning starts here (`.planning/` is frozen; see [[09 - Archive/00 - Archive Index|Archive]]). Use [[Feature Spec]]; link the Domain Map; update `status` as it moves draft → accepted → shipped.

**Status is managed on [[Project Board]]** (Obsidian Kanban: Backlog → Planned → In Progress → Validating → Shipped). Every spec gets a card; keep card lane and spec `status` frontmatter in sync.

## Static index

- [[Per-Domain SaaS Billing & BYOK]] — domain: billing, status: in-progress, 2026-06-10
- [[Go-To-Market — Self-Serve SaaS]] — domain: go-to-market, status: proposed, 2026-06-11
- [[Self-Serve Signup Funnel & Module Onboarding]] — domain: billing, status: planned, 2026-06-11
- [[Admin Billing Parity — Full Management]] — domain: billing, status: planned, 2026-06-16
- [[Platform E2E + Competitive Audit]] — full platform E2E + competitive audit initiative — shipped (2026-06-17)
- [[00 - E2E Audit Index]] — 21 per-domain E2E audit boards (2026-06-17)
- [[Competitive Gap Analysis 2026-06]] — 21-domain adversarially verified competitive gap report — active (2026-06-17)
- [[Spec - Billing Dunning + Self-Serve Portal]] — failed-payment dunning + Stripe self-serve portal — shipped/found-shipped (2026-06-17)
- [[Spec - Durable Automation Runtime]] — durable, retrying, branching journey engine — proposed (2026-06-17)
- [[Spec - Auth MFA + Audit Log + Rate Limiting]] — TOTP MFA + audit log + rate limiting (rate-limit quick-win shipped) — proposed (2026-06-17)
- [[Spec - White-Label SaaS Resell]] — agency cloneable onboarding + tiered entitlements + Stripe rebilling — proposed (2026-06-17)
- [[Spec - Predictive Scoring Layer]] — shared ML/predictive service for CRM + email + commerce — proposed (2026-06-17)

## Active
```dataview
TABLE domain, status, date
FROM "05 - Feature Specs"
WHERE type = "spec" AND status != "shipped"
SORT date DESC
```

Static list (agent-accessible mirror of the Dataview above):
- [[sd-create-short]] — branded feature shorts (MP4) for LinkedIn + blog — accepted, in progress (2026-06-10)
- [[Scribble Site Migration]] — goscribble.ai client site migration (clientId 4, websiteId 3) — validating, awaiting go-live (2026-06-12)
- [[Multi-Agent Security Hardening (kagenti-inspired)]] — automation scope gate + unified audit log (Phase 1); OBO seam (Phase 2) — planned, backlog (2026-06-17)

## Shipped
```dataview
TABLE domain, date
FROM "05 - Feature Specs"
WHERE type = "spec" AND status = "shipped"
SORT date DESC
```

## Static index (agent-readable)

### Planned
- [[Visual-Editor Agent]] — first domain-specialist sub-agent under the hub-and-spoke topology; block authoring via natural-language in the portal chatbot; `domain: visual-editor`
- [[Spec - MCP Parity]] — chat/notifications/surveys-submit/analytics MCP tools (four build groups); tickets_* already existed — corrected 2026-06-23; closes API+UI-vs-MCP layers gap; `domain: mcp`; board [[MCP Parity Board]]

### Shipped (2026-06-24)
- [[Spec - Guardrail Distillation Loop]] — nightly multi-agent distillation loop for harness guardrails; `domain: agent-harness`; status: shipped (integration gates pending on worktree/study-guide)

### Draft / Backlog
- [[Unify AI Tool Surfaces]] — consolidate MCP 431 / Brain 12 / portal tools into one source of truth; `domain: agent-harness`
