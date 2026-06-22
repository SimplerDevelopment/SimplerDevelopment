---
kanban-plugin: board
type: spec
domain: integrations
status: active
date: 2026-06-17
sources: []
---

## To Test

- [ ] BYOK integrations API keys: POST creates encrypted key (keyPreview only returned, raw key never), GET lists with masked preview, DELETE removes — needs spec
- [ ] BYOK API key label PATCH updates label; PATCH returns 404 for unknown id; DELETE returns 404 for unknown id; both require auth — needs spec

## Testing


## Blocked


## Passed

- [ ] Google OAuth connect flow ✓
- [ ] Microsoft OAuth connect flow ✓
- [ ] ✓ verified 2026-06-20 — Google OAuth token refresh + revocation (upstream) (spec: cov-u53.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /api/portal/integrations/google/status returns tier + connection shape and 401 when unauthenticated (spec: cov-u54.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/integrations/google/disconnect scrubs tokens locally and is idempotent on second call (spec: cov-u54.spec.ts)
- [ ] ✓ verified 2026-06-20 — GET /api/portal/integrations/microsoft/status returns configured flag + connection row and 401 when unauthenticated (spec: cov-u54.spec.ts)
- [ ] ✓ verified 2026-06-20 — POST /api/portal/integrations/microsoft/disconnect marks connection revoked locally and returns alreadyDisconnected on repeat (spec: cov-u55.spec.ts)
- [ ] ✓ verified 2026-06-20 — BYOK API key: POST rejects unsupported provider, wrong-prefix Anthropic key, and short key; POST gates AI providers behind Scale entitlement (403 on lower tier) (spec: cov-u55.spec.ts)
- [ ] ✓ verified 2026-06-20 — OAuth tokens: GET /api/portal/oauth-tokens lists tokens scoped to active client with clientName join; DELETE revokes a token and reflects revokedAt (spec: cov-u56.spec.ts)
- [ ] ✓ verified 2026-06-20 — Unified webhooks console: GET /api/portal/settings/webhooks aggregates project + survey webhooks for the active client and returns 401 unauthenticated (spec: cov-u56.spec.ts)
- [ ] ✓ verified 2026-06-20 — SD OAuth 2.1 discovery: GET /.well-known/oauth-authorization-server and /.well-known/oauth-protected-resource return valid JSON documents with required RFC fields (spec: cov-u56.spec.ts)

## Gaps Found

- [ ] Google/Microsoft refresh tokens not encrypted at rest — see [[Project Board]]
- [ ] Microsoft token revocation is local-only no-op — upstream revoke missing — see [[Project Board]]
- [ ] No public outbound webhooks / developer API — cross-cutting gap — see [[Competitive Gap Analysis 2026-06]]
- [ ] Domain was not audited in Phase 3 competitive pass — gap data incomplete — see [[Competitive Gap Analysis 2026-06]]
- [ ] GAP (no implementation): Microsoft OAuth token refresh + revocation (upstream)
- [ ] GAP (no implementation): Encrypt refresh tokens at rest
- [x] RESOLVED 2026-06-22: Public outbound webhook delivery — site_webhooks + HMAC-signed dispatcher wired to the automation event-bus; CRUD + rotate + delivery log in the unified console (gap-site-webhooks-coverage.spec.ts, live-fire verified) — d90587fd
- [ ] GAP (no implementation): Developer / headless content-delivery API (+ optional API-key auth) — still open; "headless content API" target needs pinning down


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
