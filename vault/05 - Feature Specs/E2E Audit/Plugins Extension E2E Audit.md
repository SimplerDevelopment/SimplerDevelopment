---
kanban-plugin: board
type: spec
domain: plugins-extension
status: active
date: 2026-06-17
sources:
  - lib/db/schema/plugins.ts
  - lib/plugins/entitlement.ts
---

## To Test

- [ ] Plugin sandboxing (tenant isolation) — needs spec
- [ ] Plugin callback endpoint rejects replay: second request with same JTI gets 409 — needs spec
- [ ] draft-blog-post run kind produces a content_drafts row visible in /drafts UI — needs spec
- [ ] Manifest scope-superset rejection: manifest requesting uncovered scope causes portal to refuse plugin load — needs spec

## Testing


## Blocked


## Passed

- [ ] Plugin schema + entitlement infrastructure ✓
- [ ] ✓ verified 2026-06-20 — Plugin entitlement gating (plugin-content-tools.spec.ts)
- [ ] ✓ verified 2026-06-20 — Installed apps gallery (/portal/apps) lists active plugins for entitled client (plugin-content-tools.spec.ts)
- [ ] ✓ verified 2026-06-20 — Plugin with status=draft or status=disabled returns 404 at /portal/apps/<slug> (cov-u57.spec.ts)
- [ ] ✓ verified 2026-06-20 — Cron plugin-runs-drain transitions queued run to succeeded and persists resultId (cov-u58.spec.ts)
- [ ] ✓ verified 2026-06-21 — Cron plugin-jobs-tick fires due job, bumps nextRunAt to next slot, and is idempotent on second tick (cron-plugin-jobs-tick.spec.ts) — BUG FIXED: `timestamp without time zone` TZ mismatch in fireDueJobs CAS UPDATE; fix uses `::timestamptz AT TIME ZONE 'UTC'` predicate in both SELECT and UPDATE (fire-due-jobs.ts)
- [ ] ✓ verified 2026-06-20 — Extension API auth probe (/api/extension/v1/auth/test) returns session identity for authenticated portal user (cov-u59.spec.ts)
- [ ] ✓ verified 2026-06-20 — Extension AI page extraction (/api/extension/v1/extract) returns structured entity from page content (cov-u59.spec.ts)
- [ ] ✓ verified 2026-06-20 — Extension CRM contact creation from captured page context creates contact scoped to correct client (cov-u59.spec.ts)
- [ ] ✓ verified 2026-06-20 — Extension Brain note creation (/api/extension/v1/notes) creates note scoped to correct client (cov-u59.spec.ts)

## Gaps Found

- [ ] Domain was not audited in Phase 3 competitive pass — gap data incomplete — see [[Competitive Gap Analysis 2026-06]]
- [ ] No e2e coverage for signing key rotation (retiring → revoked) — key rotation UX and verify-only mode for retiring keys is untested end-to-end — PARTIAL: no HTTP API for key-status rotation; lifecycle unit-tested (tests/unit/plugins-jwt.test.ts); plugin-callback auth-guards added in gap-surveys-plugins-coverage.spec.ts
- [ ] Browser extension (Vite MV3) has zero e2e coverage — popup, side panel, and content-script flows require a separate Playwright extension test harness not yet set up
- [ ] GAP (no implementation): Plugin install / uninstall lifecycle
- [ ] GAP (no implementation): Extension marketplace browse + install


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
