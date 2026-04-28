---
phase: 01-gcp-foundation-and-schema
plan: 03
status: complete
completed: 2026-04-28
---

# Plan 01-03 Summary — OAuth Helper Module

## Files created

- `lib/google/scopes.ts` — canonical scope source-of-truth keyed by surface (`identity | gmail | calendar | drive | contacts`)
- `lib/google/oauth.ts` — shared OAuth helper (`buildAuthUrl`, `exchangeCode`, `refreshIfExpired`, `revoke`, `RefreshTokenInvalidError`, `GoogleConnectionLike` interface)
- `tests/unit/google/oauth.test.ts` — 19 vitest tests with `googleapis` mocked

## Test coverage (19 tests, all passing)

**buildAuthUrl** (6 tests):
- Sets `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`
- Passes the supplied state value
- Combines identity scopes + requested surface scopes (deduped)
- Returns the URL produced by googleapis
- Optional `loginHint` → `login_hint`
- Omits `login_hint` when not provided

**exchangeCode** (4 tests):
- Returns parsed token object including userinfo email + id
- Throws when `refresh_token` missing
- Throws when `access_token` missing
- Throws when userinfo lacks email

**refreshIfExpired** (6 tests):
- Returns `refreshed:false` when token has > 60s remaining
- Refreshes and returns new access_token when expired
- Returns rotated `refresh_token` when Google provides one
- Throws `RefreshTokenInvalidError` on `invalid_grant`
- Rethrows non-invalid_grant errors as-is
- Refreshes within the 60s skew window even if not yet expired

**revoke** (3 tests):
- Returns `{ revoked: true }` on success
- Treats `400 invalid_token` as already-revoked (idempotent)
- Rethrows other errors

## Deviations from plan

1. **Test file location**: Plan said `lib/google/oauth.test.ts` (co-located). Repo's `vitest.config.ts` only includes `tests/unit/**/*.test.ts`. Moved to `tests/unit/google/oauth.test.ts`.

2. **`server-only` import omitted**: Plan said to include `import 'server-only'`. The package isn't installed in this repo. Adding a new dep wasn't authorized, so the import was removed. The module is still effectively server-only because it imports `googleapis` (which fails on the client). Hardening with `server-only` can be added later in a one-line change after `npm i server-only`.

3. **Test mock fix**: Initial `vi.fn().mockImplementation(() => ({...}))` failed because arrow functions can't be `new`'d (the helper does `new google.auth.OAuth2(...)`). Switched to `vi.fn(function OAuth2Mock() { return {...}; })`.

## Verified

- `npx vitest run tests/unit/google/oauth.test.ts` → 19/19 pass
- `npx tsc --noEmit` → no errors in `lib/google/` or `tests/unit/google/`
- `grep "db\\." lib/google/oauth.ts` → no DB access (helper is purely persistence-agnostic, as designed)

## Backlog item

`lib/google-calendar.ts:getAuthedClient` (lines 13–46) duplicates the refresh-on-expiry logic this helper now centralizes. Refactor candidate: replace `getAuthedClient` with a call to `refreshIfExpired` + a thin DB-write step. **Not in scope for this plan** (existing calendar feature works; touching it adds risk to a stable surface). File a follow-up task.

## What's next

Plan 01-01 (manual GCP setup) still pending — operator must complete the GCP console steps before Phase 2 can use `lib/google/oauth.ts` against real Google credentials. The helper currently throws `'Google Workspace OAuth env vars not configured'` if invoked without `GOOGLE_WORKSPACE_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` set.
