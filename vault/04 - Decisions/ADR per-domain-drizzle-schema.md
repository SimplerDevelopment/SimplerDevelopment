---
type: adr
domain: db
status: accepted
date: 2026-06-09
sources:
  - lib/db/CLAUDE.md
  - commit 2a04c49d (refactor(db): split schema.ts into per-domain modules)
---

# ADR: Per-domain Drizzle schema modules instead of a monolithic schema.ts

## Status

Accepted — backfilled 2026-06-09 from `lib/db/CLAUDE.md` and commit `2a04c49d`.

## Context

Before May 2026 the entire database schema lived in a single file: `lib/db/schema.ts`.
That file grew to 3,311 lines covering 166 `pgTable` declarations and 56 type/interface
declarations spanning every product area (auth, CRM, CMS, brain, billing, store, and
more). Reading or editing any one domain required loading the full file, creating a
large context-window tax for agents and humans alike.

## Decision

Split `lib/db/schema.ts` into per-domain modules under `lib/db/schema/`:

- One file per product area: `auth`, `sites`, `cms`, `crm`, `pm`, `brain`, `store`,
  `email`, `surveys`, `tools`, `billing`, `approvals`, `audit`, and others.
- A barrel at `lib/db/schema/index.ts` re-exports every name so all existing consumer
  imports `from "@/lib/db/schema"` resolve unchanged.
- **Import from the barrel only.** Never import from a specific domain module directly
  (`from "@/lib/db/schema/cms"`) — that leaks implementation details and creates
  fragile cross-domain coupling.

## Consequences

- Domain edits (e.g. adding a column to a CRM table) require reading only the relevant
  ~300–500 line domain file, not the 3,311-line monolith.
- Three minor import cycles exist (`auth↔sites`, `sites↔cms`, `sites↔store`) but are
  resolved through Drizzle's lazy FK thunks — module load order is irrelevant.
- `bun run db:generate` and `bun run db:migrate` still work identically; the migration
  toolchain reads the barrel and is unaffected by the file split.
- The `lib/db/schema/index.ts` barrel is the single source of truth for exports.
  Agents must regenerate migrations via `bun run db:generate`; never hand-edit
  `drizzle/*.sql`.

## Alternatives considered

The commit message records that all 222 exported names and 166 SQL table names were
preserved exactly via an export-parity test. No alternative split strategy was
evaluated in writing; the single-barrel re-export approach was chosen to avoid any
consumer import churn.

## Related

- [[Data Model Overview]]
- [[CMS & Blocks]]
