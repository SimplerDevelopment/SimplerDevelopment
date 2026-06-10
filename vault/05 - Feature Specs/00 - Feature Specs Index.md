---
type: index
date: 2026-06-09
---

# Feature Specs

The planning home — new feature planning starts here (`.planning/` is frozen; see [[09 - Archive/00 - Archive Index|Archive]]). Use [[Feature Spec]]; link the Domain Map; update `status` as it moves draft → accepted → shipped.

**Status is managed on [[Project Board]]** (Obsidian Kanban: Backlog → Planned → In Progress → Validating → Shipped). Every spec gets a card; keep card lane and spec `status` frontmatter in sync.

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
