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
- [ ] GET /api/portal/integrations/google/status returns tier + connection shape and 401 when unauthenticated
- [ ] POST /api/portal/integrations/google/disconnect scrubs tokens locally and is idempotent on second call
- [ ] GET /api/portal/integrations/microsoft/status returns configured flag + connection row and 401 when unauthenticated
- [ ] POST /api/portal/integrations/microsoft/disconnect marks connection revoked locally and returns alreadyDisconnected on repeat
- [ ] BYOK integrations API keys: POST creates encrypted key (keyPreview only returned, raw key never), GET lists with masked preview, DELETE removes
- [ ] BYOK API key: POST rejects unsupported provider, wrong-prefix Anthropic key, and short key; POST gates AI providers behind Scale entitlement (403 on lower tier)
- [ ] BYOK API key label PATCH updates label; PATCH returns 404 for unknown id; DELETE returns 404 for unknown id; both require auth
- [ ] OAuth tokens: GET /api/portal/oauth-tokens lists tokens scoped to active client with clientName join; DELETE revokes a token and reflects revokedAt
- [ ] Unified webhooks console: GET /api/portal/settings/webhooks aggregates project + survey webhooks for the active client and returns 401 unauthenticated
- [ ] SD OAuth 2.1 discovery: GET /.well-known/oauth-authorization-server and /.well-known/oauth-protected-resource return valid JSON documents with required RFC fields

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
