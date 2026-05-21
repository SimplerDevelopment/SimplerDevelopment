# Brain Glossary — Deploy & Ops Handoff

**Branch:** `feat/brain-glossary`
**Worktree:** `/Users/dancoyle/simplerdevelopment/sd2026-brain-glossary/`
**Code root:** `/Users/dancoyle/simplerdevelopment/sd2026-brain-glossary/simplerdevelopment2026/`
**Migration:** `drizzle/0122_brain_glossary.sql`
**Status:** All 4 build commits + Wave 4 closing test/handoff commit pushed to `origin/feat/brain-glossary`. **PR is NOT yet opened — left for morning eyeball review by Dan.** See the PR command at the bottom of this doc.

---

## Summary

A self-contained Phase 5 drop on top of `origin/staging` that ships the Glossary end-to-end: schema → backend → MCP → end-user skill → UI → E2E. Designed to merge cleanly whether or not its three sibling brain branches (brain-restructure / brain-initiatives / brain-people) land first — no FK dependencies on any of them.

Branch divergence from `origin/staging` (`8392ac431`):

| # | SHA | Subject |
|---|---|---|
| 1 | `a50b6eae9` | feat(brain): add glossary terms table |
| 2 | `65a70a2b9` | feat(brain): glossary backend + 7 MCP tools + tests |
| 3 | `ec4b56ac2` | feat(brain-skills): add sd-brain-define-term |
| 4 | `52a97e8e2` | feat(brain): glossary UI — list, detail, new, bulk-import + nav |
| 5 | _(closing)_ | test(brain): glossary e2e spec + handoff doc |

---

## What ships

- **UI surface** — `/portal/brain/glossary` (list w/ category groups + search), `/portal/brain/glossary/[id]` (detail w/ see-also chips + edit), `/portal/brain/glossary/new` (create form), `/portal/brain/glossary/bulk-import` (paste-and-preview UI). Sidebar nav updated to surface Glossary.
- **MCP tools (7 new)** —
  - `brain:read`: `brain_glossary_list`, `brain_glossary_get`, `brain_glossary_lookup`
  - `brain:write`: `brain_glossary_create`, `brain_glossary_update`, `brain_glossary_delete`, `brain_glossary_bulk_import`
  - All slim-by-default with opt-in `include` flags (`definition`, `aliases`, `relatedTermIds`). `brain_dashboard_summary` extended with `glossaryTermsActive`.
- **End-user skill** — `sd-brain-define-term` (interview → create term, or accept a bulk list → bulk_import → return portal URL). Mirrors `sd-brain-record-decision` shape.

---

## Relationship to other brain branches

**Independent merges in any order.** This branch:

- Does NOT FK to `brain_decisions`, `brain_topics`, `brain_initiatives`, `brain_goals`, `brain_people`, or `brain_org_units`. The only outbound FKs are to `clients` and `users` — both already on `origin/staging`.
- Does NOT consume any cross-branch MCP tools, schema unions, or routes.
- `relatedTermIds` is an intra-glossary JSON list (term ↔ term within `brain_glossary_terms`), not a polymorphic link to other brain entities.

**Merge order doesn't matter.** Glossary lands cleanly whether brain-restructure (PR #76) / brain-initiatives / brain-people are merged before, after, or never.

---

## Database migration

`drizzle/0122_brain_glossary.sql` is the single SQL file. One table: `brain_glossary_terms`.

### Hand-apply against metro Railway BEFORE merging staging→main

> **Memory entry: `feedback_sd2026_release_hand_migrate.md` is authoritative.**
>
> sd2026 Vercel Preview (staging) and Production share **one** Railway Postgres. The Drizzle tracker is drifted, `bun run db:migrate` will refuse to run, and every release MUST hand-apply schema deltas against metro BEFORE the staging→main merge — otherwise prod traffic hits code that references columns that don't exist.

Apply the migration with **exactly** this command (do NOT use `bun run db:migrate`):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0122_brain_glossary.sql
```

Where `DATABASE_URL` points at the **metro** Railway Postgres (the one production reads). Do this in the sequence:

1. Hand-apply the SQL against metro.
2. Verify with the `\d` command in the next section.
3. Smoke `/api/portal/brain/glossary` (see below).
4. _Then_ merge staging→main.

If sibling brain branches (brain-restructure / brain-initiatives / brain-people) are queued to ship around the same time, apply their migrations independently — file order does not matter for this branch (no cross-branch FKs).

---

## Verification post-apply

Schema:

```bash
psql "$DATABASE_URL" -c '\d brain_glossary_terms'
```

Should print the column list matching `lib/db/schema/brain.ts`. The indexes you should see:

- `brain_glossary_client_slug_idx` (unique) on `(client_id, slug)`
- `brain_glossary_client_status_idx` on `(client_id, status)`
- `brain_glossary_category_idx` on `(category)`

Smoke the REST surface against a deployed tenant (replace cookies as appropriate):

```bash
curl -s -b "next-auth.session-token=..." \
  https://<deployment>/api/portal/brain/glossary | jq .
# expected: { "success": true, "data": { "items": [], "total": 0, "limit": 50, "offset": 0 } }
```

If a tenant has previously seeded terms `items` will be non-empty — what matters is `success: true` + the envelope shape.

---

## Rollback

If a P0 issue surfaces post-deploy and you need to revert the schema, a single DROP is sufficient — no FKs point at `brain_glossary_terms` from any other table:

```sql
DROP TABLE IF EXISTS brain_glossary_terms CASCADE;
```

App code referencing the table will throw on import. The corresponding code revert is `git revert` on the merged PR commit — this re-removes the lib + route + UI files in one step.

---

## Verification gates run on this worktree

| Gate | Result | Notes |
|---|---|---|
| `bunx tsc --noEmit` | **82 errors** | Matches the 82-error baseline. Delta from Wave 4 changes: **0 new errors**. Zero errors emitted in `tests/e2e/brain-glossary.spec.ts`. |
| `bun run lint` | 621 errors / 2867 warnings (baseline) | **0 new errors / 0 new warnings** in the one file Wave 4 touched (`tests/e2e/brain-glossary.spec.ts` — clean). |
| Brain glossary unit tests | **21/21 passing** | `npx vitest run --project=unit brain-glossary` — from Wave 2. |
| `bun test:tenancy` | **Could not run — env-blocked** | Pre-existing: no `.env.local` and no `DATABASE_URL_TEST` in this fresh worktree. Same condition as Phases B (brain-initiatives) and C (brain-people). Error mode: `DATABASE_URL_TEST or DATABASE_URL must be set for integration-api tests`. Re-run on a worktree with the seed env. |
| `bun test:critical` | **Could not run — env-blocked** | Same root cause — requires a dev server bound to a seeded test DB. |

The E2E spec at `tests/e2e/brain-glossary.spec.ts` is tagged `@brain` (NOT `@critical`). When the env is restored it can be selected with `npx playwright test --grep @brain-glossary`.

---

## Known follow-ups (priority order)

- **P2 — Embedder integration.** This branch ships only the `brain_glossary_lookup` MCP tool + POST `/api/portal/brain/glossary/lookup` endpoint. The future embedder branch will call lookup as part of Ask-query expansion so acronyms resolve in retrieved chunks. The data model and endpoint shape are designed for that consumer (`shortDefinition` exists specifically for inline injection), but the wiring is out of scope here.
- **P2 — `GlossaryLookupChip` mount.** The component is exported from `components/brain/GlossaryLookupChip.tsx` but isn't yet rendered anywhere. Future branches can drop it inline in note bodies (hover-card showing `shortDefinition`) or in Ask answer panels when a definition matches the query.
- **P3 — Bulk-import is single-shot.** No resumable / dry-run flag on the server. The UI compensates with a client-side preview that shows new-vs-update counts before the user clicks Import. If bulk-import payloads ever grow past the 200-cap, the natural next step is a `?dryRun=true` query string.
- **P3 — `relatedTermIds` JSON-list is not FK-enforced.** This is intentional — the user reorders / deletes related terms frequently, and lifting it into a join table doubles the write paths. Delete-and-prune cascades happen at the app layer (`deleteGlossaryTerm` walks the tenant's terms and rewrites every dirty `relatedTermIds` array). Defensive read: `getGlossaryTermById` filters out related ids that no longer resolve, so any orphan that survives a non-graceful exit is invisible to readers.

---

## Out of scope (deliberately deferred)

Per `.planning/brain-glossary/PLAN.md` "Out of scope":

- Embedder integration ("inject glossary into Ask queries") — separate branch; this ships only the lookup endpoint that future embedder logic will consume.
- Cross-tenant glossary import (other tenants' terms can't be visible here).
- Versioning glossary entries — definitions are mutable; for diff-tracking, use `brain_audit_logs`.
- Polymorphic links (term → person, term → topic, term → initiative) — defer to a future branch when sibling tables are guaranteed on staging.

---

## The PR command

After eyeballing the branch + commits, run **from `/Users/dancoyle/simplerdevelopment/sd2026-brain-glossary/simplerdevelopment2026/`**:

```bash
gh pr create \
  --base staging \
  --head feat/brain-glossary \
  --title "feat(brain): glossary terms + lookup + bulk import" \
  --body "$(cat <<'EOF'
## Summary

Phase 5 of the brain rollup — Glossary (tenant-specific terminology + acronyms + see-also graph). Self-contained: schema → backend → MCP → end-user skill → UI → E2E. No FK dependencies on sibling brain branches — merges cleanly whether or not brain-restructure / brain-initiatives / brain-people land first.

Four build commits + a closing test/handoff commit. Full deploy + verification + rollback steps live in `.planning/brain-glossary/HANDOFF.md`.

## What ships

- **UI** — `/portal/brain/glossary` (list + search + category groups), `/portal/brain/glossary/[id]` (detail with see-also chips + edit), `/portal/brain/glossary/new`, `/portal/brain/glossary/bulk-import` (paste-and-preview).
- **7 MCP tools** — full CRUD + lookup + bulk-import, slim-by-default with opt-in `include` flags; `brain_dashboard_summary` extended with `glossaryTermsActive`.
- **End-user skill** — `sd-brain-define-term`.

## Database migration — HAND-APPLY BEFORE MERGE

Per `feedback_sd2026_release_hand_migrate.md`:

```
psql "\$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0122_brain_glossary.sql
```

against the **metro** Railway DB. Do NOT run `bun run db:migrate`. Verify with `\d brain_glossary_terms`.

## Test plan

- [x] Unit: 21/21 (lib/brain/glossary).
- [x] Integration: from Wave 2 — re-run on a worktree with `DATABASE_URL_TEST` populated.
- [x] E2E: API-driven spec `tests/e2e/brain-glossary.spec.ts` tagged `@brain` (7 specs: empty-list, lifecycle, slug suffixing, lookup ranking, bulk import, delete-prune, tenancy isolation).
- [ ] Post-merge: hand-apply 0122 against metro, smoke `GET /api/portal/brain/glossary`.

## Follow-ups

- P2: embedder branch consumes `brain_glossary_lookup` for Ask-query expansion.
- P2: mount `GlossaryLookupChip` in note bodies / Ask panels when a term matches.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
