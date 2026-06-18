---
type: spec
domain: auth-security
status: proposed
date: 2026-06-17
sources:
  - lib/db/schema/auth.ts
  - lib/db/schema/audit.ts
  - app/api/stripe/webhook/route.ts
---

# Feature: Auth MFA + Audit Log + Rate Limiting

## Overview

Three tightly coupled security table-stakes, grouped because they share schema, middleware, and the same "enterprise credibility" gate: (1) **TOTP-based MFA** with backup codes, (2) a **platform-wide audit log** capturing actor/action/resource/IP for every mutation, and (3) **rate limiting** on auth and password-reset endpoints. None are differentiators; all are the price of passing a security review.

Competitive context: **Clerk** ships MFA, audit logs, and rate limiting as baseline features. **WorkOS** owns the enterprise-auth segment with RBAC + audit. Gap #4 and #6 in [[Competitive Gap Analysis 2026-06]].

## Domain context

Read first: [[Auth & Security]]. Invariants:

- Auth is NextAuth v5 (beta). The session/user schema lives in `lib/db/schema/auth.ts`.
- An audit schema already exists at `lib/db/schema/audit.ts` — this spec extends and connects it rather than building from scratch.
- SD already has an OAuth 2.1 server + scoped `sd_mcp_*` agent tokens (MCP-native auth). MFA must not break the MCP token flow.
- Tenancy: portal users belong to a `clientId`; audit rows must include `clientId` + `actorId` + resource identifiers. Admin audit rows use a global scope.
- Never hand-edit `drizzle/*.sql`.

## Problem

There is no second factor on any account — a compromised password is full access. There is no audit trail showing who changed what and when, making compliance and incident response impossible. Auth and password-reset endpoints have no rate limiting, leaving them open to brute-force and credential-stuffing attacks. Every serious security review filters on all three.

## Goal

- Portal and admin users can enroll TOTP MFA (authenticator app) with backup codes; MFA challenges are enforced on sign-in.
- Every significant platform mutation (sign-in, permission change, content publish, data export, billing change) writes an immutable audit log row queryable by admin and per-tenant.
- Auth endpoints (`/api/auth/signin`, `/api/auth/forgot-password`, `/api/auth/reset-password`) enforce rate limits (e.g. 10 attempts / 15 min per IP + per identifier).
- No existing MCP token or OAuth flow is broken.

## Proposed approach

### TOTP MFA

1. Add `mfaSecret` (encrypted), `mfaEnabled` (boolean), `mfaBackupCodes` (encrypted JSON array) columns to `lib/db/schema/auth.ts` → `bun run db:generate`.
2. Enroll flow (portal settings): generate TOTP secret with a TOTP library (e.g. `otpauth`, zero-dependency), display QR code, verify one TOTP token before activating, generate and display 8 backup codes (hashed at rest using `lib/crypto` if it exists, else `bcrypt`).
3. Sign-in challenge: after credential verification, if `mfaEnabled`, redirect to a `/auth/mfa-challenge` page (TOTP input or backup code). Only issue the session cookie after the second factor passes.
4. Backup codes: single-use, stored as hashed values; consumed and replaced on use.
5. Admin can view MFA enrollment status per user; cannot see secrets.
6. MCP tokens (`sd_mcp_*`) are pre-authorized agent credentials — they do not go through the interactive sign-in flow and are not subject to the TOTP challenge.

### Audit log

1. `lib/db/schema/audit.ts` already defines an audit structure — verify columns are sufficient for: `id`, `clientId` (nullable for admin actions), `actorId`, `actorType` (user / api-key / mcp-token), `action` (string), `resource` (type + id), `ip`, `userAgent`, `metadata` (JSONB), `createdAt`. Add missing columns as needed.
2. Create `lib/audit/log.ts` — a thin `writeAuditEvent(event)` helper that inserts asynchronously (fire-and-forget, non-blocking to the primary request). Wrap in a try/catch — audit writes must never fail a primary operation.
3. Instrument the most critical surfaces first: auth events (sign-in, sign-out, MFA enroll/disable, password reset), permission changes, content publish/approve, billing changes, data exports.
4. Portal audit log UI: filterable table of recent events scoped to `clientId` (accessible to tenant admins). Admin panel: cross-tenant view with `clientId` + `actorId` filter.
5. Retention: rows are append-only; soft-delete is not applicable. Implement a cron to archive rows older than 365 days to a cold table or export.

### Rate limiting

1. Implement a lightweight in-process rate limiter using a sliding-window counter backed by a Redis key (if Redis is available) or an in-memory LRU (acceptable for single-instance dev; Redis for production). If neither is available, a simple DB-backed counter using `lib/db/schema/auth.ts` is the fallback.
2. Apply to: `POST /api/auth/signin` (10 req / 15 min per IP + per email), `POST /api/auth/forgot-password` (5 req / 15 min per IP), `POST /api/auth/reset-password` (5 req / 15 min per token), `POST /auth/mfa-challenge` (5 req / 5 min per session).
3. Return `429 Too Many Requests` with a `Retry-After` header. Log rate-limit hits to the audit log.
4. Middleware placement: Next.js middleware (`middleware.ts`) or route-level wrapper — to be decided based on whether Redis is available in the deployment stack.

## Scope

In scope:
- TOTP enroll/verify/disable + backup codes.
- MFA challenge on sign-in for portal and admin users.
- Audit log schema extensions + `writeAuditEvent` helper + instrumentation of top-priority surfaces.
- Portal audit log UI (tenant-scoped) + admin cross-tenant audit view.
- Rate limiting on auth/reset endpoints.
- Audit log retention cron.

Out of scope:
- SMS-based MFA (Twilio path — see future SMS channel spec; TOTP first).
- SCIM provisioning or SSO/SAML (enterprise-tier future work).
- Signer identity verification / OTP for e-sign flows (related but distinct: [[ESign Approvals E2E Audit]]).
- RBAC changes beyond current role model (full RBAC redesign is a separate spec).

## Risks

- The TOTP secret must be encrypted at rest. Verify `lib/crypto` or equivalent AES-256 encryption utility exists before storing; do not store plaintext secrets.
- Backup codes must be hashed (bcrypt or argon2) before storage — not encrypted, so they cannot be recovered (by design).
- Rate limiting in-memory state is lost on restart; Redis is strongly preferred for production. Clarify deployment stack before choosing the backend.
- MFA must be testable in E2E; Playwright-accessible TOTP generation or a test bypass flag (env-gated) is required.
- Audit log writes are fire-and-forget — if the audit table grows unbounded, query performance degrades. Add index on `(clientId, createdAt)` and the retention cron before shipping.

## Effort

**M** (~2–3 engineer-weeks: MFA enroll + challenge + backup codes, audit log extensions + instrumentation, rate limiting middleware, UI for both audit views, tests).

## Open questions

- Is Redis available in the Railway/Vercel deployment stack, or should the rate limiter fall back to DB-backed counters?
- Which encryption utility handles the TOTP secret at rest — does `lib/crypto` exist and cover AES-256?
- Audit retention: 365 days archive-to-cold or hard delete? Compliance requirement from any current client?

---

## Verified against dev (2026-06-17)

**Verdict: mostly ABSENT — strongest real gap in the next-ranked set.**

### What exists

- **MFA/TOTP:** entirely absent. No schema columns (`mfaSecret`, `mfaEnabled`, `mfaBackupCodes`) in `lib/db/schema/auth.ts`, no enroll/challenge UI, no TOTP library dependency.
- **Security audit log:** absent. `lib/db/schema/audit.ts` exists but the Brain domain has a separate `brain_audit_logs` table that is Brain-only and unrelated to platform-wide security events. No `writeAuditEvent` helper, no instrumentation on auth/permission/billing surfaces.
- **Rate limiting — partial.** Two in-memory sliding-window rate limiters exist in the codebase (`lib/api-keys.ts::checkRateLimit` keyed by API key ID; `lib/plugins/rate-limit.ts` keyed by plugin appId+clientId) but neither covers auth endpoints. The forgot-password (`app/api/portal/forgot-password/route.ts`), reset-password (`app/api/portal/reset-password/route.ts`), and change-password (`app/api/portal/change-password/route.ts`) routes contain no rate-limiting calls — the `.limit(1)` in each is a Drizzle query row limit, not a request throttle.
- **Update (2026-06-17): rate-limit quick-win SHIPPED** on branch `fix/auth-rate-limiting` (commit 4d4b6dab, off dev, unpushed). Added per-IP throttles to the NextAuth credentials login (inside authorize, before any DB hit or bcrypt), the mobile sign-in route, and the OAuth token endpoint — using dev's shared rate-limit helper (lib/security/rate-limit, present on dev). Verified live: 429 after 10 attempts. Remaining for this spec: MFA, security audit log, and a Redis-backed limiter (current limiters are in-memory per-instance).

### What is genuinely unbuilt (narrowed scope)

**Quick wins (wiring, not infrastructure):**

- Add rate-limit calls to `app/api/auth/[...nextauth]/route.ts` (main portal login — currently completely unthrottled).
- Add rate-limit calls to `app/api/portal/auth/mobile-sign-in/route.ts` (mobile auth — currently unthrottled).
- Add rate-limit calls to `app/oauth/token/route.ts` (OAuth 2.1 token endpoint — currently unthrottled).
- The in-memory pattern from `lib/api-keys.ts` is copy-adaptable; a shared `lib/auth/rate-limit.ts` keyed by IP+identifier is the right extraction.

**Bigger work (unchanged from original scope):**

- TOTP MFA enroll/challenge/backup-codes — fully greenfield.
- Platform-wide audit log (`writeAuditEvent` helper + instrumentation + UI) — fully greenfield.
- Redis-backed distributed rate limiter for production (in-memory state is per-instance, lost on restart).

The original scope and effort estimate (**M**, ~2–3 engineer-weeks) holds. Prioritize the three unthrottled endpoint quick-wins as a separate fast-track card (see Project Board).
