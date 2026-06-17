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

## Active
```dataview
TABLE domain, status, date
FROM "05 - Feature Specs"
WHERE type = "spec" AND status != "shipped"
SORT date DESC
```

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

### Draft / Backlog
- [[Unify AI Tool Surfaces]] — consolidate MCP 431 / Brain 12 / portal tools into one source of truth; `domain: agent-harness`
