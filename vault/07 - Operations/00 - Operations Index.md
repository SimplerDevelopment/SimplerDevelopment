---
type: index
date: 2026-06-09
---

# Operations

Runbooks. Core set:

- [[Deployment]] — Vercel deploy flow, staging vs production
- [[Environment & Secrets]] — env vars, where they're consumed, key generation
- [[Cron Jobs & Workers]] — vercel.json crons, Cloudflare email worker, realtime server
- [[Database Migrations]] — generate/apply flow, verify-target safety, rollback

```dataview
TABLE status, date
FROM "07 - Operations"
WHERE type = "runbook"
SORT file.name ASC
```
