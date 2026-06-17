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


%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false,false,false]}
```
%%
