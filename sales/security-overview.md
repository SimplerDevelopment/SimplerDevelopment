---
type: sales-collateral
audience: enterprise-buyer, security-reviewer
status: internal-draft
date: 2026-06-27
sources: FEATURE-INVENTORY-api-mcp.md, docs/agents/architecture-for-agents.md, FEATURE-INVENTORY-domains.md, SECURITY.md
---

# Security Overview

> Internal draft. All claims are grounded in the current codebase; open items are noted as roadmap.

---

## 1. Authentication

### Session Authentication (NextAuth v5)

SimplerDevelopment uses **NextAuth v5** with a JWT strategy. Session tokens are stored in `httpOnly` cookies — never exposed to client-side JavaScript. Cookies carry a 7-day maximum age with a 1-day idle refresh. The cookie domain is scoped to the platform's root domain in production, so session tokens cannot be accessed from third-party origins.

**Password hashing:** bcryptjs with 10 rounds. Plaintext passwords are never stored.

**Stateless JWT caveat:** Because sessions are stateless JWTs, a deactivated user retains access for up to 60 seconds until the current token expires. This is a known, intentional trade-off of the JWT strategy, not a silent gap.

### Multi-Factor Authentication (TOTP)

TOTP-based MFA is shipped and available to all portal users (`lib/totp.ts`). Users enroll via `/portal/settings/security`. At login, a TOTP field is presented when MFA is enabled. Disable requires password re-verification. The implementation is fail-closed and does not enumerate whether a TOTP code or password was the failure point.

### Brute-Force Protection

Per-IP rate limiting on the authentication endpoint: **10 attempts per 15-minute window** (`lib/security/rate-limit.ts`). Failed attempts beyond this threshold are rejected before the credential check runs. The rate-limit store uses Upstash Redis; on Redis unavailability the limiter fails open (this is a known hardening target on the roadmap).

### Login Providers

| Provider | Method |
|---|---|
| Email + password | Credentials (bcryptjs, 10 rounds) + optional TOTP |
| Google | OAuth 2.0 social sign-in via NextAuth Google provider |

---

## 2. Authorization

### Role Model

| Role | Access level |
|---|---|
| `admin` (staff) | Full admin panel — cross-tenant visibility |
| `employee` (staff) | Admin panel — subset of admin rights |
| `client / admin` | Portal — full access within own tenant |
| `client / editor` | Portal — edit-level access within own tenant |

API and MCP access is **not role-based** — it is governed entirely by key scopes (see Section 3).

### Tenant Isolation

Every tenant-scoped database table carries a `clientId` and/or `siteId` column. All queries are filtered on these fields before data is returned. The `clientId` is always derived from the authenticated session via `lib/active-client.ts` — it is never read from a URL parameter, which would be forgeable.

Per-tenant isolation is validated by a dedicated integration test suite (`bun test:tenancy`) run after any data-access change. Cross-tenant data leaks have been caught and fixed in this suite; it serves as the regression gate.

---

## 3. API and MCP Security

### API Key Types

| Key prefix | Purpose | Storage |
|---|---|---|
| `sd_mcp_` | MCP portal API key | SHA-256 hashed in `portal_api_keys` table — raw key shown once at creation |
| `sd_oauth_` | OAuth 2.0 bearer token | Issued by the OAuth authorization server; short-lived |
| `sd_live_` | REST v1 headless read key | `lib/api-key-middleware.ts`; rate-limited at 60 requests/minute |

### OAuth 2.1 Authorization Server

The platform includes a first-party OAuth 2.1 authorization server (`lib/oauth/server.ts`) supporting:

- Full authorization-code flow with **PKCE** (RFC 7636)
- **RFC 8707 resource indicators** (audience binding on tokens)
- Approximately 50 named scopes (`<domain>:read` / `<domain>:write`, `email:send`, `brain:approve`, `approvals:manage`). A `*` wildcard grants all scopes.

Token scope is enforced at the MCP tool level: every registered tool calls `hasScope(ctx.scopes, ...)` before executing. A tool missing this guard is treated as a tenancy bug and is caught by the baseline test (`tests/unit/mcp-tool-registry-baseline.test.ts`) before any push reaches production.

### REST v1 Rate Limiting

The headless REST v1 API enforces a **60 requests/minute sliding window** per key. Rate-limit headers are returned on 429 responses.

**Note:** MCP-specific rate limiting is not separately documented in the current implementation and is a roadmap item.

### Approval-Link Pattern (Human-in-the-Loop Writes)

Most live-content write operations via MCP (CMS posts, CRM records, Brain notes) do not mutate data immediately. Instead, the tool mints a one-time tokenized approval URL (`lib/mcp/approvals.ts`). A human must click through to confirm the change in their browser before it is applied. Metadata and draft operations mutate immediately without requiring approval. This pattern limits the blast radius of a compromised MCP key.

---

## 4. Secrets and Encryption

### BYOK AI Key Encryption (AES-256-GCM)

Customer-provided AI API keys (Bring Your Own Key) are encrypted at rest using **AES-256-GCM** before storage. Key resolution at runtime goes through `resolveClientApiKey(clientId, provider)`, which handles the BYOK vs. platform-key selection and per-tenant key rotation. Platform code never reads `process.env.ANTHROPIC_API_KEY` directly — the resolver is the only path.

### Roadmap: Plaintext Credential Hardening

Two areas are currently unencrypted and targeted for hardening in a near-term release:

- **OAuth integration refresh tokens** — refresh tokens stored in user-level Google and Microsoft connection tables are currently plaintext. Encryption at rest is a documented TODO.
- **CRM enrichment API key** — `crmEnrichmentConfig.ownApiKey` is stored plaintext. Schema encryption is a planned migration.

These are known gaps, not silent ones. Neither stores user passwords or payment credentials (those are hashed/tokenized respectively).

---

## 5. SSRF Protection

Outbound webhooks (per-project, developer-configured) pass through `lib/ssrf-guard.ts` before any HTTP request is made. This guards against Server-Side Request Forgery attacks that would allow a malicious webhook URL to reach internal network endpoints, metadata services, or localhost.

---

## 6. AI Output Guardrails

The Company Brain AI agent sanitizes all tool results before they enter the LLM context (`sanitizeToolResult()`), stripping API keys, session tokens, and flagged PII fields. AI-generated content — meeting extractions, slide edits, Brain notes — flows through a human-review queue (`brainAiReviewItems`) before being committed to canonical data. AI is explicitly not the source of truth.

---

## 7. Vulnerability Disclosure

SimplerDevelopment follows a **coordinated disclosure model**:

- Report to **security@simplerdevelopment.com** (not a public issue tracker)
- Acknowledgment within **72 hours**
- Initial severity assessment within **7 business days**
- Fix developed and released; reporter may publish **30 days** after the fix ships (or sooner by mutual agreement)
- Researchers who report valid vulnerabilities are credited (unless they prefer anonymity)

Scope: the SimplerDevelopment platform codebase. Third-party dependency vulnerabilities should be reported to the respective upstream project.

---

## 8. License

The platform is released under the **Apache License 2.0**, which permits self-hosted deployments, modification, and commercial use. Buyers who self-host retain full rights to run and modify the software subject to the Apache 2.0 terms.

---

## Summary: Shipped vs. Roadmap

| Control | Status |
|---|---|
| JWT sessions, httpOnly cookies | Shipped |
| bcryptjs password hashing (10 rounds) | Shipped |
| TOTP MFA (enroll / verify / disable) | Shipped |
| Per-IP brute-force rate limiting | Shipped (fail-open on Redis outage — roadmap) |
| OAuth 2.1 + PKCE authorization server | Shipped |
| RFC 8707 audience-bound tokens | Shipped |
| ~50 named scopes, per-tool scope guards | Shipped |
| SSRF guard on outbound webhooks | Shipped |
| AES-256-GCM BYOK key encryption | Shipped |
| Approval-link pattern for write tools | Shipped |
| Tenancy integration test gate | Shipped |
| REST v1 rate limiting (60 req/min) | Shipped |
| MCP-specific rate limiting | Roadmap |
| Refresh token encryption (Google/Microsoft) | Roadmap |
| CRM enrichment key encryption | Roadmap |
| Full DB-lookup host-header validation | Roadmap (deferred to Wave 3) |
