---
type: index
date: 2026-06-09
---

# Validation

Playbooks for proving work correct. Core set:

- [[Gate Picking]] — which gate for which kind of change
- [[E2E Patterns]] — Playwright conventions, fixtures, idempotency
- [[Tenancy Regression]] — multi-tenant leak testing
- [[Coverage Map]] — floors per domain, where coverage actually is
- [[QA Flows]] — interactive/exploratory/video QA via /qa

Ad-hoc validation results use [[Validation Report]].

## Audit results (static)

- [[Platform E2E Audit 2026-06-17]] — full platform E2E audit: 862 pass / 340 fail / coverage OOM, real bugs, Phase 2 MCP browser pass (2026-06-17)

```dataview
TABLE status, date
FROM "06 - Validation"
WHERE type = "playbook" OR type = "validation"
SORT file.name ASC
```
