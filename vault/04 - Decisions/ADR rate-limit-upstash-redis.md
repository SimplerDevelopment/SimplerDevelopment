---
type: adr
domain: auth-security
status: accepted
date: 2026-06-25
sources:
  - lib/security/rate-limit.ts
  - lib/auth.ts
  - app/api/auth/signup/route.ts
  - app/api/portal/forgot-password/route.ts
  - app/api/portal/reset-password/route.ts
  - app/api/portal/change-password/route.ts
  - app/api/portal/auth/mobile-sign-in/route.ts
  - app/api/portal/invite/accept/route.ts
  - app/api/surveys/[slug]/route.ts
  - app/oauth/token/route.ts
  - tests/unit/lib/rate-limit.test.ts
  - .env.example
---

# ADR: Rate Limiter Backend — Upstash Redis (HTTP) over TCP Redis

## Status

Accepted

## Context

`lib/security/rate-limit.ts` (`checkRateLimit(key, limit, windowMs)`) already existed and was already wired into 8 credential-mutating endpoints (login in `lib/auth.ts`, mobile-sign-in, forgot-password, reset-password, change-password, invite-accept, oauth-token, and survey-submit — per `.claude/rules/auth-surface.md`). The signup route had a separate duplicate inline `Map` limiter.

The implementation was in-memory (`Map`). On Vercel's serverless runtime each function instance carries its own counter: the effective rate limit is `configured-limit × N-instances`, and counters reset on every cold start. Under any real traffic this renders the limiter nearly toothless.

The deployment is confirmed Vercel serverless: `vercel.json` routes all traffic through Next.js; no `output: standalone` or long-lived Node process (the only persistent Node service is the Yjs realtime sidecar in `packages/realtime-server/` running on Railway, which is unrelated to auth). A correct distributed limiter needs a shared backing store.

## Decision

Swap `lib/security/rate-limit.ts` to `@upstash/ratelimit` with a `Ratelimit.slidingWindow` algorithm, backed by `@upstash/redis` (HTTP REST client). The existing `checkRateLimit(key, limit, windowMs)` call signature is preserved and is now `async`. A module-level `Map` memoizes one `Ratelimit` instance per distinct `(limit, windowMs)` pair so call-site changes are limited to adding `await`.

Four supporting decisions follow from this:

**1. Upstash (HTTP) over Railway Redis (TCP) or any self-managed TCP Redis.**
TCP Redis from a serverless function opens a new connection on each cold start. At Vercel scale this exhausts connection pools within minutes. Upstash's HTTP REST API is stateless — no connection lifecycle, works correctly from any serverless runtime. Railway Redis was evaluated first and discarded when the serverless topology was confirmed. Vercel KV was also considered; it uses the same Upstash engine but is Vercel-vendor-locked, less portable to "any Next.js host" (the stated deployment contract). Upstash directly is preferred.

**2. Fail-open with in-memory fallback when Upstash is unreachable.**
A 1-second `Promise.race` timeout wraps the Upstash call. On timeout or transport error the helper logs a structured `console.warn` and returns `true` (allow). A rate limiter is defense-in-depth — bcrypt cost, token hashes, and account-status checks are the primary auth gates. A limiter outage that blocks legitimate users is a worse outcome than a limiter that temporarily degrades to best-effort. The degradation is observable in logs without creating a hard availability dependency.

When `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are absent (e.g. local dev, unprovisioned preview), the client constructor fails at call time and the fail-open path triggers. This means prod is unchanged until the env vars are added to Vercel — no regression on deploy.

**3. No `Retry-After` response header.**
The helper returns a plain `boolean`. A correct sliding-window `Retry-After` would require surfacing the limiter's `reset` timestamp, which changes the return type across all 8 call sites and every existing `if (!await checkRateLimit(...))` guard. A static/estimated `Retry-After` would be misleading. The existing `429 + JSON { error }` pattern is retained as sufficient.

**4. Preserve the `checkRateLimit(key, limit, windowMs)` call signature.**
Rather than adopting `@upstash/ratelimit`'s per-instance-config API (where each call site constructs a `Ratelimit` object), memoizing instances per `(limit, windowMs)` lets the existing signature survive. This minimised the call-site diff to mechanical `await` additions and allowed the duplicate inline limiter in `app/api/auth/signup/route.ts` to be deleted and replaced with the shared helper (`5 req / 1 hour per IP`).

## Consequences

- Rate limiting is now serverless-correct: shared counter state across all Vercel instances, no cold-start resets.
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are new required production env vars (documented in `.env.example` with a provisioning note). Until set, the limiter runs in-memory fail-open — same behaviour as before.
- All 8 call sites are `await checkRateLimit(...)` — all enclosing functions were already `async`, so no signature changes propagated further.
- `app/api/auth/signup/route.ts` no longer has a duplicate inline `Map` limiter; both paths (login + signup) go through the same shared helper.
- `NODE_ENV=test` / `DISABLE_AUTH_RATE_LIMIT=1` bypasses are retained for the unit-test suite (`tests/unit/lib/rate-limit.test.ts`).
- `@upstash/redis` and `@upstash/ratelimit` are new runtime dependencies.
- A correct `Retry-After` header remains out of scope; tracked as a future improvement if call sites are ever refactored to receive a richer limiter result.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Keep in-memory `Map` | Per-instance counter: effective limit ×N instances, reset on cold start — not a real limiter in serverless |
| Railway Redis via `ioredis` / `redis` npm pkg | TCP connection opened per cold start → connection-pool exhaustion at Vercel scale |
| Vercel KV | Same Upstash engine; locks to Vercel as host, worse portability |
| DB-backed counter (Drizzle / Postgres) | Extra write on every request; adds latency and load to the primary DB |
| Middleware-layer (`middleware.ts` / Edge) | Edge runtime does not support Node TCP Redis; Upstash works but moving the limiter to middleware couples it to the Edge bundle and complicates the `DISABLE_AUTH_RATE_LIMIT` bypass for tests |

## Related

- Domain map: [[Auth & Security]]
- Spec: [[Spec - Auth MFA + Audit Log + Rate Limiting]]
- Rule: `.claude/rules/auth-surface.md` — "rate-limit every credential-mutating endpoint"
- Implementation: `lib/security/rate-limit.ts` (134 lines), `tests/unit/lib/rate-limit.test.ts` (59 lines)
