# Auth Implementation Audit — July 2026

**Scope:** the full authentication & authorization surface — NextAuth v5 credentials + Google login, JWT session strategy, middleware auth guard, password lifecycle (signup/reset/change), TOTP 2FA, the OAuth 2.1 server, MCP bearer tokens, rate limiting, and secret storage.
**Method:** manual read of the core files plus three parallel adversarial reviewers (session/JWT/middleware, OAuth/MCP, rate-limit/token-hygiene). Every High/Critical finding was independently verified before inclusion. Dimensions: **security, usability, transparency, best practices**.
**Board:** findings are tracked as `AUTH79-###` cards on project 172.

---

## Executive summary

The auth foundation is **solid and, in several areas, better than typical**: bcrypt + SHA-256 token hashing, AES-256-GCM for third-party secrets, a genuinely correct OAuth 2.1 server (S256 PKCE required for public clients, single-use codes, refresh-token rotation with reuse-detection that revokes the whole family), signed-state CSRF on almost every OAuth integration, a fail-closed non-enumerating login, and layered host-header validation before tenant rewrites.

The gaps are concentrated in a few places: **the consent-scope model is not enforced on the REST API**, **MFA is bypassable via the Google path**, the **apex-pinned session cookie + tenant-authored JS** creates a cross-subdomain CSRF surface, and a handful of endpoints were missing rate limits. Seven items — a critical open-redirect, the missing MFA rate limits, unauthenticated DCR, login timing/fail-open, plus the account-linking-CSRF and pre-auth-SSRF Highs — were **fixed in this pass**; the architectural items are filed with a recommended direction.

| Dimension | Grade | One-line |
|---|---|---|
| **Security** | B− | Strong primitives; a few real high-severity gaps (scope enforcement, MFA-via-Google, cross-subdomain CSRF) remain to design out. |
| **Usability** | B | Clean flows; the sharp edge is **no 2FA recovery codes** (lost authenticator = admin reset) and Google-login config friction. |
| **Transparency** | B+ | Neutral non-enumerating messages, structured failure logs, a real audit/token schema; consent screen over-promises scope granularity. |
| **Best practices** | B+ | NIST-aligned, right primitives; inconsistent bcrypt cost, per-route auth with no edge backstop, and migration-tracker drift. |

---

## Findings — full list

Status legend: ✅ **fixed this pass** · 🔧 **clear fix, filed** (touches a flow needing integration test) · 📐 **needs design/decision** · ℹ️ **info/latent**

| SKU | Sev | Dimension | Finding | Status |
|---|---|---|---|---|
| AUTH79-007 | Critical | Security | `callbackUrl` backslash open-redirect (`/\evil.com` → evil.com) | ✅ |
| AUTH79-008 | High | Security | MFA verify-and-enable/disable/setup had no rate limit | ✅ |
| AUTH79-009 | Medium | Security | OAuth `/register` (DCR) unauthenticated + unrate-limited | ✅ |
| AUTH79-010 | Low/Med | Security | Login timing enumeration + unbounded JWT fail-open | ✅ |
| AUTH79-011 | High | Security | OAuth consent **scopes not enforced** on the 124-route REST surface | 📐 |
| AUTH79-012 | High | Security | TOTP MFA **bypassable via Google** sign-in path | 📐 |
| AUTH79-013 | High | Security | Apex session cookie + tenant custom-JS → cross-subdomain session-riding/CSRF | 📐 |
| AUTH79-014 | High | Security | Unsigned OAuth `state` → website Google-connect account-linking CSRF | ✅ |
| AUTH79-015 | High | Security | SSRF via unauthenticated CIMD client-metadata fetch (pre-auth) | ✅ |
| AUTH79-016 | Medium | Security | RFC 8707 resource/audience binding enforced only at `/api/mcp` | 📐 |
| AUTH79-017 | Medium | Security | `resend-verification` limiter is per-instance (fleet-unbounded) | 🔧 |
| AUTH79-018 | Low | Best practices | `AUTH_INSECURE_COOKIES` unguarded against prod misuse | 📐 |
| AUTH79-019 | Low | Best practices | `crm.ownApiKey` plaintext (dead) + unscoped `whoami`/`list_workflows` + PKCE-for-confidential | ℹ️ |

Plus the four original QA cards this session shipped: **AUTH79-002** (password reuse), **AUTH79-003** (password strength), **AUTH79-004** (Google login — ops fix instructions), **AUTH79-005** (2FA docs).

---

## Security

**Fixed this pass**

- **Open redirect (Critical).** `safeCallbackUrl` string-matched `//`/`scheme:` only; `/\evil.com` slipped through and the URL parser resolved it to `https://evil.com`. Triggerable on an already-logged-in user via the `authorized` callback redirect and via `window.location.href` after sign-in. Now a single hardened, same-origin-verifying helper used by both call sites.
- **MFA brute-force (High).** `verify-and-enable` (6-digit code), `disable` (password compare), and `setup` (secret churn) had no attempt cap. Now rate-limited per userId.
- **DCR flood + timing/fail-open (Medium/Low).** `/oauth/register` rate-limited; login timing equalized; JWT fail-open bounded to 60s.

**Open — needs design/decision**

- **Consent scopes are cosmetic on REST (High, AUTH79-011).** `authorizePortal` (124 routes) authorizes on role, never on `ctx.scopes`. An `sd_oauth_*` token consented with a narrow scope has full role-level REST access (CRM, bookings incl. refunds, billing, team). The consent screen's granularity is real for MCP tools but not the REST API.
- **MFA bypass via Google (High, AUTH79-012).** The Google `jwt` branch never checks `mfaEnabled`; any account with a matching Google identity signs in at full role without the TOTP gate. Compromising the user's Google account defeats 2FA.
- **Cross-subdomain CSRF (High, AUTH79-013).** Session cookie pinned to `.simplerdevelopment.com`; tenant sites at `*.simplerdevelopment.com` carry free-form custom JS. `SameSite=Lax` doesn't protect between sibling subdomains, so tenant JS can ride an ambient staff/admin session against `/api/portal/**`. No CSRF token / origin check as a secondary defense.
**Fixed after the initial pass**

- **Account-linking CSRF (High, AUTH79-014).** The website Google-connect state is now signed (HMAC + 10-min TTL) and bound to the initiating user + client; the callback rejects any state not issued to the current session. Verify in CI/preview (live OAuth flow, no local DB).
- **Pre-auth SSRF (High, AUTH79-015).** `fetchCimdDocument` now calls `assertSafeUrl` before the outbound fetch, blocking private/loopback/link-local targets with a DNS-rebind re-check.

**Verified OK (checked, no action)**

- OAuth 2.1 server: S256-only PKCE, required for public clients; auth codes single-use via atomic conditional UPDATE; refresh rotation + reuse-detection revokes the token family; exact-match `redirect_uri`; `hasScope` wildcard not escalatable; revocation checked on every resolve; no plaintext codes/tokens/secrets at rest.
- OAuth CSRF `state`: Google-integrations, Microsoft, LinkedIn, GitHub, and booking flows all use signed state or a cookie nonce with timing-safe compare. (The one outlier is AUTH79-014.)
- Third-party token storage: GitHub, TOTP, Google website, Calendar/Drive, Microsoft, Zoom, LinkedIn, Stripe/EasyPost/Printful all AES-256-GCM at rest.
- Host-header validation before tenant rewrite (regex pre-filter + DB confirm); client-role blocked from `/admin`; plugin-proxy tenancy JWT correctly scoped and short-lived; HSTS + nosniff + Referrer-Policy + CSP-Report-Only present.

---

## Usability

- **Login form.** A single form carries email, password, and an always-visible *"Two-factor code (only if enabled)"* field. Simple, but the code field is shown to 100% of users when only 2FA-enrolled users need it — mild noise. The generic error (*"Invalid email or password — if you have two-factor enabled, include your authenticator code"*) is the right privacy/UX tradeoff.
- **No 2FA recovery codes (the sharpest edge).** A user who loses their authenticator cannot log in, and `disable` requires being logged in — so recovery today is an admin DB reset. Standard practice is a one-time recovery-code set issued at enrollment. Flagged in the 2FA guide and worth prioritizing before pushing 2FA adoption.
- **Google login friction.** The button only appears if env vars were present *at build time* and only works once the callback URI is registered — a silent-config failure mode (this session's AUTH79-004). Now documented in `.env.example`.
- **Password errors are actionable.** The new policy returns specific, human messages ("too common", "must not contain your email", "use a mix… or a longer passphrase") rather than a generic reject — good for completion rates.
- **Reset/verify link expiry** (1h reset, 24h verify) is communicated in the email copy. Self-serve signup honestly reports whether the verification email actually sent (`verificationSent`) so the UI can offer a resend.

---

## Transparency

- **Non-enumerating by design.** Forgot-password always returns the same "if an account exists…" message; login never reveals whether an email is registered or whether 2FA is on. (The timing side-channel that undercut this is now fixed.)
- **Honest failure signals.** Signup surfaces real email-send failures (structured `signup.verification_email_failed` logs) instead of pretending success; dev-only verify links are logged for local testing and explicitly *not* in production (token is a credential).
- **Audit trail exists.** `audit.ts` OAuth tables record issuance/consumption; tokens store a preview + hash so activity is reviewable without exposing secrets. Portal users can list and revoke their own OAuth tokens.
- **Gap — consent over-promises.** The `/oauth/authorize` screen shows granular scopes, but those scopes don't constrain the REST surface (AUTH79-011). A user consenting to "read profile" is not told the token can also write their CRM. This is a transparency issue as much as a security one.
- **Rate-limit degradation is invisible.** When Upstash is down the limiter fails open to a per-instance limit with only a `console.warn` — no signal to operators that brute-force protection is degraded fleet-wide. Worth an alert on `rate_limit_backend_error`.

---

## Best practices

- **Right primitives, NIST-aligned.** bcrypt for passwords, SHA-256 for reset/invite/OAuth tokens (raw only in the email/response), AES-256-GCM for secrets with two separate key universes, TOTP on `node:crypto` with constant-time compare and ±1 drift. Password policy now length-first with a blocklist (NIST 800-63B) rather than arbitrary composition rules.
- **Inconsistent bcrypt cost (minor).** Signup and the Google placeholder hash at cost **10**; reset and change at cost **12**. Standardize (12 recommended) so a password set via signup isn't weaker-stored than one set via reset.
- **Per-route auth with no edge backstop.** `/api/portal/**` (562 route files) gets no middleware auth gate — each route must call `authorizePortal` itself. Spot-checks found no accidental gaps, but this is a single-point-of-failure class; a lint/CI grep asserting every `app/api/portal/**` route imports a guard would convert review discipline into an enforced invariant.
- **Duplicated security logic.** `safeCallbackUrl` lived in two verbatim copies (now unified) — the exact drift risk that let the client-side copy stay vulnerable. Prefer shared `lib/security/*` helpers for anything security-relevant.
- **Migration-tracker drift.** `db:generate` refuses non-interactively on the populated `users` table, so schema changes ship as hand-numbered `90xx_*_manual.sql` files (this pass added `9005`). Workable and documented, but the meta/journal inconsistency should be reconciled so `generate` works again.
- **Rate-limit fail-open is defensible but unmonitored.** Global→per-instance degradation on Upstash outage needs an alert (see Transparency).

---

## Recommended priority order

1. **AUTH79-011** (scope enforcement on REST) — highest blast radius; design a route→scope map and enforce in the bearer branch once.
2. **AUTH79-012** (MFA-via-Google) — a product decision, then a small code change; it silently defeats 2FA for any Google-linked account.
3. **AUTH79-013** (cross-subdomain CSRF) — architectural cookie/host-topology decision; pairs with a `Sec-Fetch-Site`/origin check on portal mutations.
4. ~~**AUTH79-014 / AUTH79-015** (account-linking CSRF, CIMD SSRF)~~ — **fixed this pass**; confirm in CI/preview.
5. **2FA recovery codes** (usability) — before promoting 2FA adoption.
6. The Medium/Low items (AUTH79-016/017/018/019, bcrypt-cost, per-route lint) as a hardening batch.

---

_Audit performed 2026-07-09. Fixed items shipped on `worktree/auth-qa-fixes`. See project 172 for per-finding tracking._
