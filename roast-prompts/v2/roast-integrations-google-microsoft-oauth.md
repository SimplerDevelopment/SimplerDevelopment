# Roast: Integrations (Google, Microsoft & OAuth) — SimplerDevelopment V2

**How to use:** Run `/roast` and feed it this brief. The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

The Integrations domain connects each tenant's users to Google Workspace (Gmail, Drive, Calendar, Contacts — with incremental Pub/Sub and push-channel sync) and Microsoft 365 / Teams (transcript ingestion via Graph change-notification subscriptions). These connections feed directly into the Company Brain embedding pipeline and CRM contact enrichment — the integration *is* the intelligence layer. On top of that, SD runs an OAuth 2.1 authorization server (RFC 8414 discovery, PKCE, dynamic client registration, resource indicators) so that MCP clients like Claude.ai and Claude Code can obtain scoped bearer tokens and operate the platform as agents. That server is internal enabling infrastructure for the MCP surface, not a marketed product.

**What changed from V1:** The BYO-GCP enterprise tier pitch has been pulled (the `google_workspace_client_connections` org-level table has no real write path — the callback wrongly populates `googleWebsiteTokens` today, so that tier is vapor). The OAuth 2.1 server is repositioned as load-bearing MCP plumbing, not a differentiator. Token encryption at rest is named as a go-live blocker below. Brain-sync coupling is the actual moat.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies running SD as their business OS; Gmail/Drive/Calendar sync feeds the Company Brain and booking system; Teams transcript ingestion enriches meeting notes.
- **End user:** Agency staff connecting their Google or Microsoft accounts, and — indirectly — agency clients whose data flows into CRM/Brain via synced contacts and meetings.
- **Monetization:** Enabling infrastructure with no direct revenue line. The OAuth 2.1 server is the access-token layer for the MCP surface, which underpins AI-credit consumption. The integrations raise switching cost by making the Brain smarter as more client data flows through — retention moat, not a billing SKU. No standalone ambition — bundled retention layer.

## The edge

- **Brain-sync coupling is the moat.** Gmail Pub/Sub pushes, Drive change polling, and Teams transcript subscriptions don't merely sync data — they feed directly into the Company Brain embedding pipeline and CRM contact enrichment in real time. The integration *is* the intelligence layer. Competitors either run a separate connector (Zapier) that writes nowhere useful, or they lack a Brain entirely. This coupling deepens the longer an agency runs SD, making it genuinely hard to extract.
- **Booking-chain dependency raises switching cost further.** Google Calendar OAuth is a hard dependency for booking-page availability checks. Removing Google breaks scheduling, not just email sync — structural lock-in without lock-in messaging.
- **Single consent, multi-surface.** One OAuth connection grants Gmail, Drive, Calendar, and Contacts simultaneously under a scoped surface enum, rather than four separate flows each requiring separate user consent. Low friction at the connection step matters for adoption.
- **MCP-native token layer (enabling infra, not a pitch).** The OAuth 2.1 server lets Claude.ai authorize against SD and operate it as an agent. No competing agency OS ships this. It is not marketed as a standalone product — it is what makes the MCP tool surface credible to Claude.ai clients.

## Constraints

- Solo founder / tiny team; SD is a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed tools agencies already pay for: Zapier / Make (automation-layer connectors), Merge.dev (unified API abstraction), native first-party integrations built into Notion/HubSpot/Monday.
- Time-to-first-dollar and maintainability by a tiny team both matter.

**GO-LIVE BLOCKERS (committed, in-progress, must close before a single paying seat):**

1. **Token encryption at rest — BLOCKER.** Google and Microsoft user refresh tokens are currently stored plaintext in the DB. A single Postgres dump or leaked credential exposes every tenant's long-lived tokens across all connected orgs — a GDPR/CCPA-actionable lateral-breach surface. Fix: wire the existing AES-256-GCM helper (already used for BYO-creds) to encrypt the user refresh-token columns, key stored in env/KMS. This is a contained, scoped engineering task, not an architecture decision. Nothing else ships until it is done.

2. **BYO-GCP write path — BLOCKER to that tier.** The `google_workspace_client_connections` org-level table has no active write path; the current callback populates `googleWebsiteTokens` instead. The BYO-GCP enterprise upsell pitch is pulled until the write path exists and is tested. Standard-tenant shared credentials are unaffected.

3. **Sync-gap observability.** Drive push channels expire in as little as 24 hours; Microsoft Graph subscriptions require 60-minute renewals. A missed cron creates a silent sync gap with no alert. Fix: add observable sync-gap alerting (a simple last-synced + expected-renewal check surfaced to the tenant dashboard) before promoting Brain-sync as a reliability claim.

**Existing known gaps (tracked, not yet fixed):**
- Microsoft revocation is a local-only no-op; real revocation requires the user to visit Microsoft's consent portal. Document this window explicitly in any security-posture material rather than letting it surprise a diligence reviewer.

## Roast it on two lenses

1. **Earns its place in the suite?** Does the Brain-sync coupling create real stickiness and intelligence value, or is it shallow connector plumbing that a Zapier workflow replicates in an afternoon? Does the booking-chain dependency actually raise switching cost, or is it a fragile single-point-of-failure?
2. **Could it stand alone?** No standalone ambition — bundled retention layer. The OAuth 2.1 server is internal MCP plumbing; Auth0/WorkOS/Stytch already own the "managed OAuth for AI agents" lane and are closing it fast. There is no solo-founder wedge there. Pressure this lens only to confirm the module earns its keep in the suite — not to find a spin-out thesis.

## Riskiest assumption to pressure-test

That agencies will trust a solo-founder monorepo to hold long-lived Google and Microsoft refresh tokens once those tokens are encrypted at rest and a credible one-page security-posture paragraph can be written and shown to real buyers. The de-risked version of this test: (1) close the encryption blocker, (2) draft the security-posture paragraph, (3) show it to 2-3 real agency prospects and ask "does this clear your bar to connect your clients' Google accounts?" — if a credible paragraph can't be written in 48 hours, the module isn't sellable yet, and that answer is cheap to learn before a breach teaches it.
