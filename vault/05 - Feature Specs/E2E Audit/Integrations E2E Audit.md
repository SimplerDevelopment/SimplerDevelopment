---
kanban-plugin: board
type: spec
domain: integrations
status: active
date: 2026-06-17
sources: []
---

## To Test

- [ ] Google OAuth token refresh + revocation (upstream)
- [ ] Microsoft OAuth token refresh + revocation (upstream)
- [ ] Encrypt refresh tokens at rest
- [ ] Public outbound webhook delivery
- [ ] Developer / headless content-delivery API

## Testing


## Blocked


## Passed

- [ ] Google OAuth connect flow ✓
- [ ] Microsoft OAuth connect flow ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] Google/Microsoft refresh tokens not encrypted at rest — see [[Project Board]]
- [ ] Microsoft token revocation is local-only no-op — upstream revoke missing — see [[Project Board]]
- [ ] No public outbound webhooks / developer API — cross-cutting gap — see [[Competitive Gap Analysis 2026-06]]
- [ ] Domain was not audited in Phase 3 competitive pass — gap data incomplete — see [[Competitive Gap Analysis 2026-06]]


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
