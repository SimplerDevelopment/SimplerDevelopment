# Roast: Integrations (Google, Microsoft & OAuth) — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
The Integrations domain connects each tenant's users to Google Workspace (Gmail, Drive, Calendar, Contacts — with incremental Pub/Sub and push-channel sync) and Microsoft 365 / Teams (transcript ingestion via Graph change-notification subscriptions). On top of that, SD runs its own OAuth 2.1 authorization server — complete with RFC 8414 discovery, PKCE, dynamic client registration, and resource indicators — so that MCP clients like Claude.ai and Claude Code can obtain scoped bearer tokens and operate the platform as agents. Standard tenants share SD's OAuth app credentials; enterprise tenants can bring their own GCP project (BYO-creds tier, with AES-256-GCM-encrypted secrets).

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies running SD as their business OS; Gmail/Drive/Calendar sync feeds the Company Brain and booking system; Teams transcript ingestion enriches meeting notes.
- **End user:** Agency staff (the people connecting their Google or Microsoft accounts) and, indirectly, agency clients whose data flows into CRM/Brain via synced contacts and meetings.
- **Monetization:** Enabling infrastructure — no direct revenue line. BYO-GCP enterprise tier creates an upsell gate (standard vs. enterprise plan distinction). The OAuth 2.1 server is the access-token layer for the MCP surface, which underpins AI-credit consumption — so it is load-bearing for monetized AI features without billing for integration connections themselves.

## The edge
- **MCP-native OAuth server.** SD ships a full RFC-conformant OAuth 2.1 server (PKCE + dynamic registration + RFC 8414 discovery + RFC 9728 resource indicators) specifically so Claude.ai can authorize against it. No competing all-in-one agency platform ships this — most rely on Auth0 or a simple API key.
- **Brain-integrated sync.** Gmail Pub/Sub pushes, Drive change polling, and Teams transcript subscriptions don't just sync data — they feed directly into the Company Brain embedding pipeline and CRM contact enrichment. The integration *is* the intelligence layer, not a bolt-on connector.
- **Two-tier credential model.** Enterprise tenants can supply their own GCP project, keeping data inside their own Google org boundary. This is a genuine enterprise differentiator even if it's currently Google-only (Microsoft BYO is future-planned).
- **Booking-chain dependency.** Google Calendar OAuth is a hard dependency for booking-page availability checks. This creates tight functional coupling that raises switching cost — removing Google would break scheduling, not just email sync.
- **Single login, multi-surface.** One connection grants Gmail, Drive, Calendar, and Contacts simultaneously under a scoped surface enum, rather than four separate OAuth integrations each requiring separate user consent.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed tools agencies already pay for: Zapier / Make (automation-layer Google connectors), Merge.dev (unified API abstraction), native first-party integrations built into Notion/Hubspot/Monday, Google Workspace Marketplace apps.
- Time-to-first-dollar and maintainability by a tiny team both matter.
- Known gaps and fragility: Microsoft revocation is a local-only no-op (tokens expire; real revocation requires the user to visit Microsoft's consent portal). Refresh tokens for Google and Microsoft user connections are currently stored **plaintext** in the DB — a planned hardening pass, not yet done. Drive push channels can expire in as little as 1 day; missing a 60-minute Microsoft subscription renewal leaves a sync gap.
- The `google_workspace_client_connections` (org-level) table has **no active write path** — the legacy callback populates `googleWebsiteTokens` instead. Enterprise-level org sync is structurally incomplete.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That agencies will trust SD's OAuth infrastructure (a solo-founder Next.js monorepo) to hold long-lived Google and Microsoft refresh tokens in plaintext, and will prefer it over standing up a dedicated integration layer (Zapier, Merge.dev, or native Workspace apps) — especially given the existing gaps: no org-level Google write path, no Microsoft revocation, and a 60-minute subscription renewal window that gaps on missed crons.
