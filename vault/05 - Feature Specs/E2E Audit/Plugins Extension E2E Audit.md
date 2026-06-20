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

- [ ] Plugin install / uninstall lifecycle — needs spec
- [ ] Plugin sandboxing (tenant isolation) — needs spec
- [ ] Extension marketplace browse + install — needs spec
- [ ] Plugin with status=draft or status=disabled returns 404 at /portal/apps/<slug> — needs spec
- [ ] Plugin callback endpoint rejects replay: second request with same JTI gets 409 — needs spec
- [ ] Cron plugin-runs-drain transitions queued run to succeeded and persists resultId — needs spec
- [ ] Cron plugin-jobs-tick fires due job and bumps nextRunAt to next slot — needs spec
- [ ] draft-blog-post run kind produces a postcaptain_drafts row visible in /drafts UI — needs spec
- [ ] Extension API auth probe (/api/extension/v1/auth/test) returns session identity for authenticated portal user — needs spec
- [ ] Extension AI page extraction (/api/extension/v1/extract) returns structured entity from page content — needs spec
- [ ] Extension CRM contact creation from captured page context creates contact scoped to correct client — needs spec
- [ ] Extension Brain note creation (/api/extension/v1/notes) creates note scoped to correct client — needs spec
- [ ] Manifest scope-superset rejection: manifest requesting uncovered scope causes portal to refuse plugin load — needs spec

## Testing


## Blocked


## Passed

- [ ] Plugin schema + entitlement infrastructure ✓
- [ ] ✓ verified 2026-06-20 — Plugin entitlement gating (plugin-postcaptain-tools.spec.ts)
- [ ] ✓ verified 2026-06-20 — Installed apps gallery (/portal/apps) lists active plugins for entitled client (plugin-postcaptain-tools.spec.ts)

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] Domain was not audited in Phase 3 competitive pass — gap data incomplete — see [[Competitive Gap Analysis 2026-06]]
- [ ] No e2e coverage for signing key rotation (retiring → revoked) — key rotation UX and verify-only mode for retiring keys is untested end-to-end
- [ ] Browser extension (Vite MV3) has zero e2e coverage — popup, side panel, and content-script flows require a separate Playwright extension test harness not yet set up


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
