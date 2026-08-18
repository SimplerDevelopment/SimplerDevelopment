---
type: index
date: 2026-08-18
---

# Domain Maps

> **Mostly retired.** Per-domain maps were removed on 2026-08-05 and their
> durable content migrated into the code they described — see the routing rule
> in the root `CLAUDE.md`. How a module behaves is documented in the module.
> Three maps survive because they describe cross-cutting concerns that span
> too many files to live in any one of them.

The surviving maps:

- [Auth & Security](<Auth & Security.md>)
- [Billing & Stripe](<Billing & Stripe.md>)
- [Integrations - Google, Microsoft & OAuth](<Integrations - Google, Microsoft & OAuth.md>)

Repo paths cited in these maps are drift-checked by `scripts/check-doc-drift.ts`.

**Don't add a new domain map here.** If it describes how the code behaves, it
belongs in the code; if it explains a decision, it belongs in `04 - Decisions`
as an ADR.

<!-- Renders only in Obsidian; GitHub shows this as an inert code block. -->
```dataview
TABLE domain, status, date
FROM "03 - Domains"
WHERE type = "domain-map"
SORT file.name ASC
```
