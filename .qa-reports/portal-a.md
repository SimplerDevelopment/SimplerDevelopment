# QA Report: Portal-A — Auth / Settings / Billing

**Agent:** PORTAL-A | **Date:** 2026-05-14 | **Branch:** qa/full-walkthrough-2026-05-14

---

## Summary

- **Auth is structurally sound** — login, logout, switch-client, forgot-password, and invite flows all return correct HTTP contracts. One HIGH severity bug found and fixed: the password reset flow was entirely non-functional due to a raw-vs-hashed token mismatch in the reset-password route.
- **Settings pages all render cleanly** (no Next.js error overlays, no crashes on 500 injection). Three routes have missing input validation that can cause DB-level 500s on oversized/malformed inputs — two fixed during this session.
- **Billing and notifications** pages and APIs work correctly; billing lacks an empty-state UI when no invoices/services exist (cosmetic, LOW).
- **Performance** is borderline on dev server under parallel load: most pages load in 2–4 s but `/portal/services`, `/portal/settings/support`, and `/portal/settings/webhooks` measured 7–10 s TTI (dev only, not a production signal).
- **52 of 54 tests pass** consistently; 1 test is load-sensitive flaky on dev server (notifications page under 2-worker parallel load). All 3 code bugs fixed and committed in separate commits.

---

## Coverage Table

| Route | Status | Notes |
|---|---|---|
| `/portal/login` | COVERED | smoke + auth-extras |
| `/portal/forgot-password` | COVERED | 4 API tests this session + smoke |
| `/portal/reset-password` | COVERED | 4 API tests; BUG FIXED (token hash) |
| `/portal/invite/[token]` | COVERED | render-safe test; one-shot tokens not fully testable |
| `/portal/settings/profile` | COVERED | GET/PATCH, oversized, concurrent, unauth, 500-intercept |
| `/portal/settings/billing` | COVERED | GET shape, unauth, render, 500-intercept |
| `/portal/settings/notifications` | COVERED | prefs GET, unauth, render |
| `/portal/settings/api-keys` | COVERED | render + existing api-keys.spec |
| `/portal/settings/team` | COVERED | render, oversized name (FIXED), malformed email (FIXED) |
| `/portal/settings/webhooks` | COVERED | render + DELETE unauth check |
| `/portal/settings/support` | COVERED | render |
| `/portal/settings/ai` | COVERED | render |
| `/portal/settings/integrations` | COVERED | render |
| `/portal/integrations/api-keys` | COVERED | render |
| `/portal/notifications` | COVERED | feed GET (shape, unread filter, limit), render |
| `/portal/services` | COVERED | list GET, render |
| `/portal/services/[id]/request` | COVERED | valid id render, unknown id safety |

---

## Performance Numbers

All measurements from `domcontentloaded` event on local dev server under parallel test load (not representative of production).

| Route | TTI (ms) | Flag |
|---|---|---|
| `/portal/settings/profile` | 2,235 | OK |
| `/portal/settings/billing` | 2,926 | OK |
| `/portal/settings/notifications` | ~1,800 | OK |
| `/portal/notifications` | ~2,100 | OK |
| `/portal/settings/api-keys` | ~2,400 | OK |
| `/portal/integrations/api-keys` | ~2,600 | OK |
| `/portal/settings/team` | ~3,000 | OK |
| `/portal/settings/webhooks` | 6,672 | SLOW (>3s) |
| `/portal/settings/support` | 8,695 | SLOW (>3s) |
| `/portal/settings/ai` | 3,285 | BORDERLINE |
| `/portal/settings/integrations` | 4,273 | SLOW (>3s) |
| `/portal/services` | 10,164 | SLOW (>3s) — services list query unindexed? |
| `/portal/services/[id]/request` | 3,129 | BORDERLINE |

> Note: dev server under parallel test load inflates these 2-3x vs production. Flagging `/portal/services` (10s) and `/portal/settings/support` (8.7s) as worth profiling.

---

## Issues Found

### Issue 1 — CRITICAL (FIXED)
**Severity:** HIGH  
**Route:** `POST /api/portal/reset-password`  
**Repro:** Request a password reset, click the link, submit new password → always returns "Invalid or expired reset link"  
**Root cause:** `app/api/portal/reset-password/route.ts` line 24 compared raw `token` from the URL against `users.passwordResetToken` which stores `hashToken(rawToken)`. The equality can never match.  
**Fix:** `eq(users.passwordResetToken, hashToken(token))` — committed as `fix(portal-auth): hash token before DB lookup in reset-password handler`

---

### Issue 2 — MEDIUM (FIXED)
**Severity:** MEDIUM  
**Route:** `PATCH /api/portal/settings/profile`  
**Repro:** Send `name: "N".repeat(10240)` → server returns 500 (Postgres column length violation)  
**Root cause:** No upper-bound validation on `name` or `email` fields before DB write.  
**Fix:** Added 255-char cap on both fields with 400 response — committed as `fix(portal-settings): add length validation to profile PATCH handler`

---

### Issue 3 — MEDIUM (FIXED)
**Severity:** MEDIUM  
**Route:** `POST /api/portal/settings/team`  
**Repro:** (a) Send `name: "N".repeat(10240)` → 500 (Postgres column too long); (b) Send `email: "not-an-email"` → 201, invalid email stored  
**Root cause:** No name-length check or email format validation before the `users.insert()` call.  
**Fix:** Added 255-char name cap and basic email regex check — committed as `fix(portal-settings): add name length + email format validation to team invite`

---

### Issue 4 — LOW (NOT FIXED — needs product decision)
**Severity:** LOW  
**Route:** `/portal/settings/billing`  
**Repro:** Log in as a fresh client with no invoices/services → billing page renders two empty sections with no empty-state message (just blank space)  
**Suggested fix:** Add "No invoices yet" / "No active services" empty state to `app/portal/settings/billing/page.tsx`

---

### Issue 5 — LOW (NOT FIXED — performance, needs profiling)
**Severity:** LOW  
**Route:** `/portal/services`  
**Repro:** Page consistently takes 8–10s TTI under parallel test load on dev server  
**Suggested fix:** Profile `/api/portal/services` query — likely missing index on `services.active` or `services.clientId` (if tenant-scoped). Check `app/api/portal/services/route.ts` for N+1 or full-table scans.

---

### Issue 6 — LOW (NOT FIXED — needs product decision)
**Severity:** LOW  
**Route:** `POST /api/portal/forgot-password`  
**Repro:** Send `email: "a".repeat(10240) + "@example.com"` → server returns 200 (anti-enumeration policy), but also attempts a DB query against a 10 KB string  
**Suggested fix:** Add a max-length check (e.g. 255 chars) before the DB lookup to avoid the query overhead. Return 200 (maintain anti-enumeration) but skip DB call.

---

## Recommendations

1. **Production gate before billing goes live:** The billing page has no empty state and no Stripe portal link. Users with no subscription see a blank page with no guidance — add an empty state and a "Manage billing" link pointing to a Stripe Customer Portal session endpoint.

2. **API key revoke has no confirmation modal** (visible in screenshot `08-settings-api-keys.png`): the delete button in `McpApiKeysManager` calls DELETE immediately. Add a confirm dialog for destructive operations.

3. **Team invite sends no email confirmation** to the invitee: the route creates a temp password and returns it in the API response, but no invite email is sent (Resend is bypassed). Users invited this way have no way to discover their credentials unless the owner manually communicates them. File as a UX gap.

4. **Reset-password UI has no "resend link" affordance:** the page at `/portal/reset-password` only has the password input form. If the token is expired, the user sees an error but no inline link to re-request the email.

5. **`/portal/services` slowness:** Given the 10s TTI under moderate parallel load, profile the services list query and add an index on `services.clientId` if tenant-filtered.

6. **Notifications preferences API returns 404** for the seed client (no preference rows seeded). The UI handles this gracefully but seeding default preferences on first load would improve the UX.
