# Migration baseline reset — 2026-06-25

The `drizzle/` migration history was squashed to a single clean baseline. This
note explains what changed, why, and the **one-time ops step each existing
environment needs** so a later `drizzle-kit migrate` doesn't try to recreate
tables that already exist.

## Why

The drizzle meta journal had become corrupt and desynced: **132 `.sql` files on
disk but only 10 entries in `drizzle/meta/_journal.json`** (snapshots existed
for just 0000–0004, 0070, 0072–0075, with a parent-snapshot collision). As a
result:

- `drizzle-kit generate` failed outright (snapshot collision).
- The TS schema had drifted ahead of the migrations — e.g. `users.email_verified_at`,
  `email_verification_token`, `email_verification_expires`, `google_id` existed
  in `lib/db/schema/auth.ts` but in **no** migration (they only reached real DBs
  via `drizzle-kit push`). A from-scratch `reset-e2e-db` therefore built a DB
  missing those columns, and the e2e seed failed.

The journal could not be surgically rebuilt from 10 snapshots covering 132
files, so the baseline was regenerated.

## What changed

- All prior `drizzle/*.sql` + `drizzle/meta/*` were replaced by a single
  generated baseline **`0000_baseline_2026_06_25.sql`** (286 tables) + a fresh
  consistent meta journal. `drizzle-kit generate` now reports "No schema
  changes" against the current TS schema (verified).
- Three runtime-DDL migrations drizzle-kit cannot express were preserved
  verbatim, renumbered to run after the baseline:
  - `9001_brain_embedding_triggers.sql`
  - `9002_brain_embedding_trigger_fix.sql`
  - `9003_brain_trigram_indexes.sql`
- One-time **data backfills were intentionally dropped** (no-ops on a fresh DB;
  existing environments already ran them): e.g. `0099_backfill_project_members`,
  `10008_api_keys_hash`, the brain data-seed migrations, and the client-specific
  `0118_postcaptain_tools_bot_user`.
- **Extensions are now provisioned in `scripts/reset-e2e-db.ts`** (`vector`,
  `pg_trgm`, `pgcrypto`) before migrations replay — the baseline's `vector(1536)`
  column and `gin_trgm_ops` indexes require them, and drizzle-kit never emits
  `CREATE EXTENSION`. These remain a **per-DB prerequisite** for prod/dev (see
  the pgvector note in CLAUDE.md).
- `reset-e2e-db.ts`'s migration filter was widened from `^\d{4}_` to `^\d{4,}_`
  so 5-digit manual migrations (e.g. the old `10008_*`) are no longer silently
  skipped.

The full pre-squash `drizzle/` tree remains recoverable from git history (and
was archived during the operation).

## ⚠️ One-time ops step per existing environment (prod / staging / dev)

Existing databases already have the full schema. Do **NOT** run the baseline
against them — it would `CREATE TABLE` over existing tables and fail. Instead,
**baseline** each environment: record the new migration as already applied
without executing it.

1. Ensure extensions exist (they already do on any DB built before this):
   `CREATE EXTENSION IF NOT EXISTS vector; pg_trgm; pgcrypto;`
2. Mark the baseline applied in drizzle's tracking table (do NOT run its SQL).
   Confirm the tracking table name/shape for this drizzle-kit version
   (`__drizzle_migrations` in the `drizzle` schema) before inserting, then
   insert a row whose hash matches `drizzle/meta/0000_snapshot.json`.
3. Verify: `drizzle-kit generate` against that environment's schema reports
   "No schema changes".

New/throwaway databases (CI, local e2e) need nothing special — `reset-e2e-db`
provisions extensions and replays the baseline + preserved DDL from empty.

## Verified locally (2026-06-25)

- `reset-e2e-db` → baseline + 9001/9002/9003 replay clean, **seed succeeds**.
- 286 tables; `users` has all 17 columns; 24 triggers + 16 `gin_trgm_ops`
  indexes + pgvector present.
- `drizzle-kit generate` → "No schema changes, nothing to migrate".
- `@content-api-authz` e2e regression spec green on the rebuilt DB.
