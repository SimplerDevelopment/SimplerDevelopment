---
type: domain-map
domain:
status: active
date: {{date:YYYY-MM-DD}}
sources: []
---

# Domain: {{title}}

## Purpose
One paragraph: what this domain does, for whom (admin / portal tenant / public site visitor), and why it exists.

## Key entry points

| Path | Role |
|---|---|
| `lib/<domain>/...` | Core business logic |
| `app/api/portal/<domain>/...` | Tenant API routes |
| `app/portal/<domain>/...` | Portal UI |

## Data model
Tables (from `lib/db/schema/<module>.ts`) with the columns that matter for planning. Note tenancy keys (`clientId` / `siteId`).

## API surface
Route groups and their envelope behavior. Note anything that deviates from the standard `{ success, data | error }` pattern.

## MCP tools
Tools in `lib/mcp/tools/<domain>.ts` — name, what it does, scope guard.

## UI surfaces
Portal pages, admin pages, public-site renderings.

## Tests & gates
Existing specs/units covering this domain; which gates to run for which change (`bun test:tenancy` after data-access changes, `bun test:critical` before done).

## Cross-domain dependencies
What this domain imports/feeds (e.g. CRM ← surveys auto-routing).

## Invariants & gotchas
The things that bite. Link nested `CLAUDE.md` rules rather than restating them.

## Planning notes
What to read / verify before building a feature here. Open questions.

## Related
- ADRs: 
- Specs: 
