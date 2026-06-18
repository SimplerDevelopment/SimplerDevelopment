---
type: index
date: 2026-06-09
---

# Domain Maps

One map per feature domain. **Read the relevant map before planning a feature there; update it after shipping one.** Repo paths are drift-checked by `scripts/check-doc-drift.ts`.

Static list (agents: maintain this when adding maps — Dataview below only renders in Obsidian):

- [[AB Testing]] · [[Agentic OS]] · [[Agency, Onboarding & Branding]]
- [[Auth & Security]] · [[Automations & Workflows]] · [[Billing & Stripe]]
- [[Bookings & Services]] · [[Chat, Realtime & Voice]] · [[CMS & Blocks]]
- [[Company Brain & AI]] · [[CRM]] · [[E-Sign & Approvals]]
- [[Email & Campaigns]] · [[Integrations - Google, Microsoft & OAuth]] · [[Pitch Decks & Product Designer]]
- [[Plugins & Extension]] · [[Projects, Tickets & Kanban]] · [[Sites, Hosting & Publishing]]
- [[Storefront & Commerce]] · [[Surveys]] · [[Visual Editor]]

```dataview
TABLE domain, status, date
FROM "03 - Domains"
WHERE type = "domain-map"
SORT file.name ASC
```
