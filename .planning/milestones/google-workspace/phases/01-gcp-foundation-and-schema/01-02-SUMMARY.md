---
phase: 01-gcp-foundation-and-schema
plan: 02
status: complete
completed: 2026-04-28
---

# Plan 01-02 Summary — Schema Migration

## What was applied

Migration: `drizzle/0052_google_workspace_connections.sql`

- `google_workspace_client_connections` table created (per-client shared connection)
- `google_workspace_user_connections` table created (per-user personal connection within a client)
- `crm_activities.via_user_id` column added (nullable, FK to users)
- 4 indexes created (account_email lookups, user lookup on user_connections, via_user lookup on activities)
- 1 unique constraint: `(client_id, user_id)` on user_connections

## Where applied

| Environment | DB Host | Method | Status |
|---|---|---|---|
| staging | `nozomi.proxy.rlwy.net:16666` | `psql -f drizzle/0052_*.sql` | ✓ applied 2026-04-28 |
| production | `tramway.proxy.rlwy.net:43167` | `psql -f drizzle/0052_*.sql` | ✓ applied 2026-04-28 |

Verified with `information_schema.tables` and `information_schema.columns` queries on both.

## Drizzle schema additions in lib/db/schema.ts

- `googleWorkspaceClientConnections` (line ~1177)
- `googleWorkspaceUserConnections` (line ~1205)
- 4 inferred type exports
- `crmActivities.viaUserId` column added inline (around line 1996)

## Deviation from plan

The plan called for `npx drizzle-kit push`, but that tool diffs the entire schema.ts against the live DB and would have applied **pre-existing schema drift** (e.g., a pending `brain_profiles_client_id_unique` constraint on a populated table, plus possibly more) along with our changes. That was outside the authorized scope.

Switched to `psql -f drizzle/0052_*.sql` which applies only this migration's statements. This matches the repo's pattern of `scripts/run-latest-migration.ts`.

## Surfaced concern (not addressed in this plan)

`schema.ts` has drifted from the live DB on at least one item (`brain_profiles` lacks the unique constraint defined in `lib/db/schema.ts:brainProfiles.clientId.unique()`). This is unrelated to the Google Workspace work but should be tracked separately — running `drizzle-kit push` will cascade into these changes whenever someone tries to use it. Recommend a sweep PR that reconciles the drift, OR a decision to abandon `drizzle-kit push` and use SQL files exclusively (the repo's existing pattern under `scripts/migrations/`).

## Follow-ups

- Local `.env` `DATABASE_URL` points at staging — confirmed working. No `.env.local` exists; if other devs work on this repo they may need one.
- The connection tables are empty. Phase 2 will populate via OAuth flow.
