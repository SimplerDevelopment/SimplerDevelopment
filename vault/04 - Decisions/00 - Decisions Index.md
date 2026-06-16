---
type: index
date: 2026-06-09
---

# Decisions (ADRs)

Write an ADR whenever a non-obvious choice is made — the test: "would the next agent need to know *why* it's this way?" Use [[Architecture Decision]].

Static list (agents: maintain this when adding ADRs — Dataview below only renders in Obsidian):

- [[ADR blocks-are-universal]] · [[ADR three-route-trees]] · [[ADR per-domain-drizzle-schema]]
- [[ADR bun-as-sole-package-manager]] · [[ADR local-ci-over-github-actions]] · [[ADR typecheck-committed-head]]
- [[ADR lint-staged-only]] · [[ADR file-size-budget-ratchet]] · [[ADR coverage-floors-tiered-by-domain]]
- [[ADR nested-claude-md-context-discipline]] · [[ADR mcp-registry-baseline-unit-gate]] · [[ADR dev-block-routes-off-github-issues]]
- [[ADR site-migration-qa-via-local-dryrun]] · [[ADR migration-glass-btn-style]] · [[ADR migration-roi-calculator-static-snapshot]] · [[ADR migration-store-settings-preflight]] · [[ADR migration-target-staging-vs-metro]]
- [[ADR approval-preview-page-scoped-token]]

```dataview
TABLE domain, status, date
FROM "04 - Decisions"
WHERE type = "adr"
SORT date DESC
```
