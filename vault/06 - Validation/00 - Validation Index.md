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

```dataview
TABLE status, date
FROM "06 - Validation"
WHERE type = "playbook" OR type = "validation"
SORT file.name ASC
```
