# Roast: Auth & Security — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
Auth & Security is the foundational identity and access layer for the entire SD platform. It combines NextAuth v5 (Credentials provider, JWT strategy, DB re-validation throttle) with a hand-rolled OAuth 2.1 authorization server (PKCE, dynamic client registration, RFC 8414 discovery, consent screen) for MCP client access, two AES-256-GCM encryption key universes (BYOK AI keys vs. workspace credentials), SHA-256-hashed at-rest tokens for invites/resets, tenant ownership guards (`assertOwned*` functions), and a per-key approval gate that stages MCP CMS writes into `mcp_pending_changes` before they touch production data. The `lib/crypto/**` coverage floor is enforced at 90% lines / 80% functions — the highest in the codebase.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies running SD as their business OS — every feature they use (portal, MCP, Brain, CRM, automations) goes through this layer.
- **End user:** Agency staff (session auth, invite flow, password reset, API key management) and AI agents / third-party MCP clients (OAuth 2.1 bearer tokens, scope guards).
- **Monetization:** Enabling infrastructure with no direct revenue line. The OAuth 2.1 server and `requireCmsApproval` gate are load-bearing for the AI-credit metered surface (MCP tools) — so every AI-credit dollar flows through auth. The approval gate itself could be a plan-gated feature (stricter audit/approvals on higher-tier plans).

## The edge
- **Approval-gated AI writes by default.** All new `portalApiKeys` have `requireCmsApproval=true` — MCP CMS-write tool calls land in a staging queue for staff review before touching production content. This is a genuine enterprise/agency-grade safety net that Auth0, Clerk, and Supabase Auth don't offer out of the box.
- **MCP-native OAuth 2.1.** The built-in OAuth 2.1 server (RFC 8414, RFC 9728 resource indicators, RFC 7591 dynamic registration) is purpose-built for Claude.ai connector compatibility. Competing auth providers don't ship this; you'd have to build it on top of Auth0 anyway.
- **Two separate AES-256-GCM key universes.** BYOK AI keys and workspace OAuth credentials intentionally never share key material — a leak of one doesn't compromise the other. Documented invariant enforced in tests (90% coverage floor on `lib/crypto/**`).
- **Stateless JWT with throttled DB re-validation.** Deliberate 60-second re-validation window trades some revocation latency for availability (fail-open on transient DB errors) — a production-grade choice that bespoke implementations often get wrong in both directions.
- **Tenancy ownership guards as first-class primitives.** `assertPipelineInClient`, `assertContactInClient`, etc. are centralised throw-on-FK-mass-assignment helpers — not ad-hoc inline checks. Combined with the tenancy integration test gate (`bun test:tenancy`), this makes cross-tenant data leakage a test-enforced invariant rather than a convention.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed tools agencies already pay for: Auth0, Clerk, WorkOS (enterprise SSO), Supabase Auth, NextAuth community wrappers.
- Time-to-first-dollar and maintainability by a tiny team both matter.
- Known gaps and deliberate deferrals: JWT is stateless — a deleted/deactivated user keeps a valid session up to 60 seconds (intentional, but will surprise security buyers). Host header validation uses a regex plausibility check (`isPlausibleTenantHost`) rather than a DB lookup — a fuller fix is tracked for Wave 3 but creates a mild SSRF surface in the interim. No SSO / SAML / enterprise IdP support (WorkOS territory). No MFA/2FA on the Credentials provider path. `githubConnections` access tokens stored without the same encryption treatment as workspace credentials.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That the approval-gated MCP write queue and purpose-built OAuth 2.1 server are sufficient differentiators to keep agencies on SD's home-grown auth layer rather than migrating to Clerk or WorkOS — especially once they need SSO, MFA, or compliance audit logs that Auth0/WorkOS deliver as a first-class product and SD does not.
