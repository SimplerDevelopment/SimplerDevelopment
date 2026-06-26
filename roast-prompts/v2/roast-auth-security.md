# Roast V2: Auth & Security — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief. The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

Auth & Security is load-bearing bundled infra — the identity and access substrate every other SD module sits on. Its defensible marketed asset is the **AI-write governance layer**: the `requireCmsApproval` approval queue that stages every MCP CMS-write into a human-review step before touching production data. All new `portalApiKeys` default to `requireCmsApproval=true` — an explicit, plan-gated safety net that no point-auth vendor ships.

The rest of the layer (NextAuth v5 JWT sessions, hand-rolled OAuth 2.1 server with PKCE + RFC 8414/7591/9728, two AES-256-GCM key universes, SHA-256-hashed at-rest tokens, and tenancy ownership guards) enables the platform but is not pitched as a standalone competitive product against Auth0, Clerk, or WorkOS. That framing is abandoned. The approval gate and the "trust by construction" tenancy model are the claims that matter; they are the only ones competitors cannot replicate by flipping a config.

The `lib/crypto/**` coverage floor is enforced at 90% lines / 80% functions — the highest in the codebase. Three invariant violations exist today and are tracked as GO-LIVE BLOCKERs (see Constraints) before the public repo is opened to scrutiny.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies already inside the SD suite — every feature they use (portal, MCP, Brain, CRM, automations) runs through this layer. There is no auth-buyer ICP; this module does not acquire new customers.
- **End user:** Agency staff (session auth, invite flow, password reset, API key management) and AI agents / third-party MCP clients (OAuth 2.1 bearer tokens, scope guards, per-key write governance).
- **Monetization:** Enabling infrastructure with no direct revenue line, plus one plan-gated product surface: the approval gate itself is a higher-tier differentiator (stricter write governance, full audit log) that makes agencies stickier at the price point where compliance starts to matter. Every AI-credit dollar flowing through MCP tools is gated by this layer; that coupling makes hardening it a revenue-protection obligation, not optional maintenance.

## The edge

- **AI-write governance as a named, marketed capability.** The `requireCmsApproval` queue is the only place in the agency OS category where every AI write is structurally human-gated before it touches production content. It is pitched with its own feature page and its own pitch line — not buried as a footnote inside an auth module. Approval-gated AI writes by default is a genuine enterprise/agency-grade safety net Auth0, Clerk, and Supabase Auth do not offer; it earns a stated buy/stay reason if surfaced correctly.
- **Two separate AES-256-GCM key universes — when the invariant holds.** BYOK AI keys and workspace OAuth credentials are intentionally isolated so a leak of one does not compromise the other. This claim is valid once the `githubConnections` encryption gap is closed (see Constraints — GO-LIVE BLOCKER #1); until then the dual-key-universe invariant is partially falsified and must not be stated as complete.
- **MCP-native OAuth 2.1 server as enabling infra.** The built-in OAuth 2.1 server (RFC 8414, RFC 9728, RFC 7591) is purpose-built for Claude.ai connector compatibility — a real technical advantage that competing auth providers do not ship. This is positioned as internal enabling infrastructure for the MCP surface, not a marketed standalone product. The standalone "managed MCP OAuth" lane is already occupied by Auth0/WorkOS/Stytch; defending it is a solo-founder trap.
- **Tenancy ownership guards as first-class primitives.** `assertPipelineInClient`, `assertContactInClient`, etc. are centralised throw-on-FK-mass-assignment helpers enforced by the tenancy integration test gate (`bun test:tenancy`). Cross-tenant data leakage is a test-enforced invariant, not a convention — a meaningful assurance for agencies running multiple client orgs from one panel.
- **Stateless JWT with a documented revocation window.** The deliberate 60-second re-validation window is a production-grade availability tradeoff. It is documented explicitly for buyers and SOC 2 auditors rather than left to surprise a security review.

## Constraints

- Solo founder / tiny team; SD is a ~357k-line shipping monorepo, now moving toward open-source. Open-sourcing while carrying the invariant violations below creates credibility-ending audit findings the moment strangers read the code.
- **No standalone ambition.** The module does not compete with Auth0, Clerk, WorkOS, or Supabase Auth on their turf. No SSO/SAML/enterprise IdP (WorkOS territory — explicitly deferred). No attempt to open-source the OAuth 2.1 server as a standalone category play.
- **No MFA on the Credentials path** (currently). No plan-gated MFA/2FA exists; it is a 15-minute disqualifier in enterprise procurement.

### GO-LIVE BLOCKERs — real code work, not yet done, must close before OSS launch

These are committed, scoped engineering items. They are not positioning changes. The dual-key-universe invariant and "trust by construction" claims do not hold in full until all three are shipped:

1. **Encrypt `githubConnections` access tokens at rest** under the existing AES-256-GCM universe. Currently stored unencrypted — a direct falsification of the dual-key-universe claim and an active liability if the DB is compromised.
2. **Replace `isPlausibleTenantHost` regex with a full DB-lookup middleware.** The current regex plausibility check is a live mild-SSRF surface in the tenant resolver. A proper DB lookup was tracked for Wave 3 but must ship before the public repo exposes it to scrutiny.
3. **Add TOTP MFA on the Credentials provider path.** Absent today; a standard enterprise-procurement checkbox and a one-session disqualifier in any serious diligence review.

Until these three blockers are closed, the "trust by construction" and dual-key-universe claims are accurate only with explicit caveats, and the OSS launch does not happen.

## Roast it on two lenses

1. **Earns its place in the suite?** Once the three GO-LIVE BLOCKERs close, does the approval gate register as a genuine plan-gated differentiator that increases retention and justifies the maintenance overhead of a home-grown auth layer — or does it remain invisible to buyers who evaluate SD on CRM and Brain and only notice auth when something breaks?
2. **Could it stand alone? No standalone ambition — bundled retention layer.** The OAuth 2.1 server is internal enabling infrastructure for the MCP surface. The standalone "managed MCP OAuth" product category is already being closed by Auth0/WorkOS/Stytch, and a solo founder has no path to win it. The approval gate's value is entirely derivative of co-location with the CRM, Brain, and CMS surfaces it governs. Outside the bundle, it is a feature in search of a substrate.

## Riskiest assumption to pressure-test

That naming and surfacing the approval queue as its own marketed capability — "AI write governance / human-in-the-loop for agent CMS writes," with a dedicated feature page — registers with agency buyers as a stated stay/buy reason rather than an auth footnote they never see. The cheapest test: a single named landing page taken to five agency prospects in 48 hours, measuring whether it produces a lean-in reaction before any new code is written. In parallel, the githubConnections encryption and host-lookup patches ship — both are mechanical and have no open design decisions.
