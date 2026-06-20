---
kanban-plugin: board
type: spec
domain: auth-security
status: active
date: 2026-06-17
sources:
  - lib/auth.ts
  - lib/portal-auth.ts
---

## To Test

- [ ] MFA enrollment + TOTP login flow
- [ ] Platform-wide audit log writes on auth events
- [ ] Rate limiting on /api/auth/reset and login endpoints
- [ ] OAuth 2.1 server scoped sd_mcp_* token issuance
- [ ] Self-serve signup flow — POST /api/auth/signup with valid inputs creates inactive user and triggers verification email
- [ ] Email verification token — GET /api/auth/verify-email?token=<valid> activates user and allows login
- [ ] Resend verification — POST /api/auth/resend-verification sends new token for unverified user
- [ ] Google OAuth sign-in — provider callback creates or links user, session established
- [ ] Admin deactivates user (active=false) — that user's next authenticated request returns 401 within REVALIDATE_MS window
- [ ] Invite token acceptance — POST /api/portal/invite/accept with valid token activates invited user and allows login
- [ ] Portal OAuth client CRUD — GET/POST/DELETE /api/portal/oauth-clients scoped to caller's tenant
- [ ] OAuth access token revocation — DELETE /api/portal/oauth-tokens revokes token; subsequent MCP request returns 401
- [ ] OAuth 2.1 discovery — GET /.well-known/oauth-authorization-server returns valid RFC 8414 metadata document
- [ ] Admin role gate — client-role user directed to /portal/dashboard when attempting /admin routes
- [ ] clientMembers viewer role enforcement — viewer-role member cannot create/edit kanban cards
- [ ] API key scope enforcement — sd_mcp_* key with narrowly-scoped scopes is rejected by out-of-scope MCP tools
- [ ] Admin impersonation start + stop — admin can impersonate a portal user and end the session via /api/portal/impersonate/stop

## Testing


## Blocked


## Passed

- [ ] NextAuth login → portal dashboard ✓ (Phase 2 MCP pass)
- [ ] scoped MCP token issuance for agent access ✓

## Gaps Found

- [ ] e2e seed lacks entitlements (402) — see [[Platform E2E Audit 2026-06-17]]
- [ ] No MFA (TOTP/SMS/backup codes) — hard table-stakes gap — see [[Competitive Gap Analysis 2026-06]]
- [ ] No platform-wide audit log for auth events — see [[Competitive Gap Analysis 2026-06]]
- [ ] No rate limiting on auth/reset endpoints — see [[Competitive Gap Analysis 2026-06]]
- [ ] OAuth 2.1 consent screen (/oauth/authorize) has no e2e test — entire user-facing consent flow is untested
- [ ] Self-serve signup + email verification funnel has no e2e test despite routes being live (/api/auth/signup, /api/auth/verify-email, /api/auth/resend-verification)
- [ ] Admin impersonation (/api/portal/impersonate/status + /stop) has no e2e coverage


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
