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

- [ ] Admin deactivates user (active=false) — that user's next authenticated request returns 401 within REVALIDATE_MS window — needs spec (requires 60s wait for JWT revalidation; too slow for E2E without test hook)
- [ ] OAuth 2.1 server scoped sd_mcp_* token issuance — needs spec (full authorization_code OAuth flow with consent screen not E2E-testable via API; scope enforcement via API keys is covered)

## Testing


## Blocked


## Passed

- [ ] NextAuth login → portal dashboard ✓ (Phase 2 MCP pass)
- [ ] scoped MCP token issuance for agent access ✓
- [ ] ✓ verified 2026-06-20: login flow verified; rate-limiter bypass wired (DISABLE_AUTH_RATE_LIMIT); onboarding-complete seeded + verified
- [ ] ✓ verified 2026-06-20 — Self-serve signup flow — POST /api/auth/signup with valid inputs creates inactive user and triggers verification email (auth-security-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Resend verification — POST /api/auth/resend-verification sends new token for unverified user (auth-security-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Invite token acceptance — POST /api/portal/invite/accept with valid token activates invited user and allows login (auth-security-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Portal OAuth client CRUD — GET/POST/DELETE /api/portal/oauth-clients scoped to caller's tenant (auth-security-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — OAuth access token revocation — DELETE /api/portal/oauth-tokens revokes token; list reflects revokedAt (auth-security-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — OAuth 2.1 discovery — GET /.well-known/oauth-authorization-server returns valid RFC 8414 metadata document (auth-security-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Admin role gate — client-role user directed to 401 when calling /api/admin routes; admin user passes (auth-security-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — clientMembers viewer role enforcement — viewer-role project member cannot create/edit kanban cards (403) (auth-security-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — API key scope enforcement — sd_mcp_* key with narrowly-scoped scopes is rejected by out-of-scope MCP tools (auth-security-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Admin impersonation start + stop — admin can impersonate a portal user and end the session via /api/portal/impersonate/stop (auth-security-coverage.spec.ts)
- [ ] ✓ verified 2026-06-20 — Email verification token — GET /api/auth/verify-email?token=<valid> activates user and allows login (cov-u1.spec.ts)
- [x] RESOLVED: credential brute-force rate-limiter blocked entire suite under localhost parallelism — DISABLE_AUTH_RATE_LIMIT bypass added to `lib/auth.ts` and wired into `scripts/test.sh`
- [x] RESOLVED: OAuth /oauth/authorize consent flow (error pages + unauth redirect + authenticated consent render) covered — gap-auth-coverage.spec.ts
- [x] RESOLVED (partial): signup/verify-email/resend guard+validation paths covered — gap-auth-coverage.spec.ts (happy-path already in auth-security-coverage.spec.ts)
- [x] RESOLVED (partial): impersonate status/stop guard paths covered — gap-auth-coverage.spec.ts (full round-trip already in auth-security-coverage.spec.ts)

## Gaps Found

- [ ] No MFA (TOTP/SMS/backup codes) — hard table-stakes gap — see [[Competitive Gap Analysis 2026-06]]
- [ ] No platform-wide audit log for auth events — see [[Competitive Gap Analysis 2026-06]]
- [ ] No rate limiting on auth/reset endpoints — see [[Competitive Gap Analysis 2026-06]]
- [ ] GAP (no implementation): MFA enrollment + TOTP login flow — MFA not implemented in codebase
- [ ] GAP (no implementation): Platform-wide audit log writes on auth events — no audit log table or event hooks exist
- [ ] GAP (no E2E path): Google OAuth sign-in — provider callback requires external Google OAuth flow; not testable via API without browser + provider credentials


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
