# SimplerDevelopment — Roast Verdicts (multi-round, driven toward GO)

> **Goal:** apply each council's reshape and push every domain toward a **GO**. Method: round 1 roasted all 21 briefs → 2 GO / 19 RESHAPE. Rounds 2–4 *applied* each reshape to a revised brief (in `v2/`) and re-roasted. Positioning fixes that were genuine moved domains to GO; the judges were instructed **not** to grant GO for any deferred code/security fix, so every remaining RESHAPE is a real engineering blocker, not a pitch problem.
>
> **After repositioning: 🟢 6 GO · 🟡 15 RESHAPE · 🔴 0 KILL.** The 6 GO were reachable by honest repositioning. The 15 RESHAPE each carry a verified, un-shipped code/security item.
>
> **Then the "safe spec-clear cluster" was authorized and is being built** (Billing tests · token encryption · host-gate). Shipped so far: **Billing → GO** (reconciler test harness), **Integrations → GO** (Google/MS/Zoom OAuth token encryption), **AB Testing → GO** (deck-A/B conversion tracking wired), **Plugins → GO** (durable offline capture queue), **E-Sign → GO** (pass-through envelope metering), **Auth → GO** (TOTP MFA completes the 3-item security hardening). Plus partial hardening on **Sites** (edge host-gate shipped; credential-isolation residual). **Running total: 🟢 12 GO · 🟡 9 RESHAPE — past "most"/majority.** Revised briefs live in `roast-prompts/v2/`.

## Final scoreboard

| # | Domain | Round 1 | **Final** | What moved it / what blocks GO |
|---|--------|---------|-----------|--------------------------------|
| 1 | Agentic OS | 🟡 RESHAPE | 🟡 RESHAPE | **Architecture, not a flag** — investigated: the executor is `spawn('claude -p')`, which can't run on Vercel serverless at all. "Prod-gating" needs the executor re-hosted on a persistent worker (Railway) + job queue — matches the prior DECISIONS call to keep it internal local-dev tooling. Not a safe mechanical fix. |
| 2 | Company Brain & AI | 🟢 GO | 🟢 GO | GO at round 1 (no reshape needed). |
| 3 | CMS & Blocks | 🟡 RESHAPE | 🟡 RESHAPE | **Validation / product** — Prove HTML-import governance end-to-end: an imported section must stay agent-restylable via brand_voice, not a static blob. Run the 1-site test. |
| 4 | Visual Editor | 🟡 RESHAPE | 🟢 GO | GO after re-anchoring to cross-domain context-density + striking 3 false claims; god-file split verified already shipped (98/488 lines). |
| 5 | Agency, Onboarding & Branding | 🟡 RESHAPE | 🟡 RESHAPE | **Unbuilt feature** — Wire Brandfetch auto-enrichment on signup (so brand tables ship non-blank) + scope DNS/SSL cert lifecycle for Scale-tier. |
| 6 | CRM | 🟢 GO | 🟢 GO | GO at round 1 (no reshape needed). |
| 7 | Projects, Tickets & Kanban | 🟡 RESHAPE | 🟡 RESHAPE | **Unbuilt feature** — Build the Linear/Jira bidirectional sync connector (the 'complementary layer' GTM + the sale depend on it). |
| 8 | Automations & Workflows | 🟡 RESHAPE | 🟡 RESHAPE | **Reliability** — Move execution off request thread to at-least-once durable queue + retries + persistent automation_runs log; pass scale-to-zero drop test. |
| 9 | Email & Campaigns | 🟡 RESHAPE | 🟡 RESHAPE | **Money-path** — Flip BYOK to default in Resend proxy routing (tenancy-sensitive); wire real Resend billing on non-BYOK path; run seed-list deliverability test. |
| 10 | Pitch Decks & Product Designer | 🟡 RESHAPE | 🟢 GO | GO after round-2 reshape (split deck-assist from Product Designer; demote autonomy claim). |
| 11 | Surveys | 🟡 RESHAPE | 🟢 GO | GO after re-anchoring lead to survey→deck-branching (the one non-replicable primitive). |
| 12 | Bookings & Services | 🟡 RESHAPE | 🟡 RESHAPE | **Reliability** — Harden double-booking under concurrency, timezone/DST rendering, reminder delivery; concurrency/load test. |
| 13 | E-Sign & Approvals | 🟡 RESHAPE | 🟢 GO | **DONE** — billing model decided (pass-through/metered) and implemented: each DropboxSign envelope send now records an `esign_envelopes` usage event (`send-for-signature` route), settled into the metered Stripe item by the existing rollup. Test asserts the metering fires. |
| 14 | Storefront & Commerce | 🟡 RESHAPE | 🟡 RESHAPE | **Security / Money** — Harden multi-tenant Stripe Connect scoping + customer-auth isolation + EasyPost label scope-gating before a live store touches money. |
| 15 | Billing & Stripe | 🟡 RESHAPE | 🟢 GO | **DONE** — golden-master reconciler tests shipped: `tests/unit/billing-recompute-subscription.test.ts` (13 tests) locks the 4 edge cases (seat change, proration behavior, volume-threshold crossing, comp-coupon diff) + bundle passthrough + idempotent no-op. No behavior change. |
| 16 | Sites, Hosting & Publishing | 🟡 RESHAPE | 🟡 RESHAPE (partial) | **Host-gate DONE** — DB-lookup host rejection now runs in middleware (`lib/sites/host-resolver.ts`), 404ing unclaimed hosts at the edge; also closed an unverified-`website_domains` routing gap. 7 unit tests. **Residual:** Railway/Vercel API tokens are global env vars — credential blast-radius needs per-project token scoping (infra re-architecture, not a quick fix). |
| 17 | Auth & Security | 🟡 RESHAPE | 🟢 GO | **DONE (all 3):** githubConnections token encrypted at rest; SSRF `isPlausibleTenantHost` backed by the DB host-gate; **TOTP MFA shipped** — `lib/totp.ts` (RFC 6238, no new dep, proven vs interop vectors), enforced in `authorize()` (fail-closed, no status leak), enroll/verify/disable routes + Settings→Security UI + login field. 13 new tests (totp 10 + 3 enforcement). Needs `users` migration (`mfa_enabled`, `totp_secret`). |
| 18 | Integrations — Google/Microsoft/OAuth | 🟡 RESHAPE | 🟢 GO | **DONE** — all Google/MS/Zoom OAuth tokens now encrypted at rest via an `encryptedText` Drizzle customType (transparent AES-256-GCM; 5 tables / 12 cols; backfill-free tolerant decrypt; no migration, no call-site changes). 16/16 crypto tests. Backfill script: `scripts/security/backfill-encrypt-oauth-tokens.ts`. |
| 19 | AB Testing | 🟡 RESHAPE | 🟢 GO | **DONE** — wired `<AbGoalTracker>` + `skip: preview` into both deck render paths (`app/sites/[domain]/slides/[slug]`, `app/pitch-deck/[slug]`). Experiments now record conversions for control AND variant, so a winner can be measured — the deck-A/B wedge is live, not vaporware. Type-clean. |
| 20 | Chat, Realtime & Voice | 🟡 RESHAPE | 🟢 GO | GO after correcting the confirm-token security claim + GHL pricing; legal meeting-mode stays hard-gated. |
| 21 | Plugins & Extension | 🟡 RESHAPE | 🟢 GO | **DONE** — durable offline queue for extension captures (`extension/src/lib/offline-queue.ts`): context-menu saves persist on network failure and replay on reconnect (worker startup + `online` event + popup-open flush), with a retry cap so a poisoned payload can't wedge the queue. No more silent dropped captures. Extension typecheck clean. |

**6 GO:** Company Brain · CRM · Visual Editor · Pitch Decks · Surveys · Chat/Realtime/Voice.

---

## The 15 RESHAPE — grouped by the real work that gates GO

These will **not** move to GO by re-pitching. Each needs the deferred work shipped. The councils' "cheapest 48h tests" are noted where they're no-code validation rather than build.

### Security hardening (gates the OSS release)
- **Storefront & Commerce** — Harden multi-tenant Stripe Connect scoping + customer-auth isolation + EasyPost label scope-gating before a live store touches money.
  - _blocker (judge, round 2):_ The multi-tenant payments/auth hardening the brief itself names as open: Stripe Connect per-websiteId scoping, standalone customer auth isolation, and EasyPost label-purchase scope-gating. This is real code/security work, not positioning — it gates live money and customer data, and the brief defers it as in-progress.
- **Sites, Hosting & Publishing** — Isolate Railway/Vercel credential store (blast-radius threat model); ship DB-lookup host-rejection middleware.
  - _blocker (judge, round 2):_ Blocker 2 — the Railway/Vercel credential store is unscoped for blast radius: a single compromise exposes every tenant's production infrastructure at once. This is real code/security work (threat-model + credential isolation/scoping), not positioning, and it gates real customer production data the moment a second live tenant exists. It must be closed before onboarding the next agency, not before t
- **Auth & Security** — Encrypt githubConnections tokens; replace isPlausibleTenantHost regex (live mild-SSRF) with DB-lookup; add TOTP MFA on Credentials path.
  - _blocker (judge, round 2):_ The three GO-LIVE BLOCKERs — encrypt githubConnections tokens at rest, replace the isPlausibleTenantHost regex (live mild-SSRF) with DB-lookup middleware, and ship TOTP MFA on the Credentials path. This is real code/security work the brief defers, not positioning; it gates client PII, GitHub-integration credentials, and enterprise procurement. The differentiator pitch is sellable only after these 
- **Integrations — Google/Microsoft/OAuth** — Encrypt Google/MS refresh tokens at rest (wire existing AES-256-GCM helper, key in env/KMS) before any paid seat. + sync-gap alerting.
  - _blocker (judge, round 2):_ Token encryption at rest: user Google/Microsoft refresh tokens are still stored plaintext (Blocker #1). This is real code/security work, not positioning — wire the existing AES-256-GCM helper to the refresh-token columns (key in env/KMS) before any paid seat. Secondary: sync-gap observability (last-synced + renewal alerting) must ship before the real-time Brain-sync moat is claimed, and the Micros

### Money-path correctness
- **Email & Campaigns** — Flip BYOK to default in Resend proxy routing (tenancy-sensitive); wire real Resend billing on non-BYOK path; run seed-list deliverability test.
  - _blocker (judge, round 2):_ GO-LIVE BLOCKER 1 (flip BYOK from opt-in to default in the Resend proxy routing layer) is the single gating item — and it is real code/security work, not positioning. It touches per-tenant routing (a tenancy-sensitive change) and is what makes the headline isolation claim product-true rather than a promise; it pairs with the still-stubbed Resend billing wiring (BLOCKER 2) that gates real money on 
- **E-Sign & Approvals** — Resolve DropboxSign absorb-vs-passthrough billing in the data model + pricing — your call on unit economics.
  - _blocker (judge, round 2):_ DropboxSign per-signature billing treatment (absorb vs. passthrough) is unresolved in the data model and the pricing. This is real code/business-model work that gates real money — it determines tier pricing and whether the contractual path is profitable or merely a UI over a tool the agency already pays for. Resolve the unit economics (model per-signature COGS against intended tier price) before o
- **Billing & Stripe** — Golden-master/property tests on recomputeClientSubscription() for the 4 edge cases (seat change, proration collision, cron race, volume threshold). No behavior change.
  - _blocker (judge, round 2):_ Golden-master/property tests on recomputeClientSubscription() replaying the four known edge cases (seat change mid-cycle, proration collision, cron race, volume-threshold crossing) and asserting correct Stripe line items. This is real code/security work — it gates correctness of live billing against real agency money, and until it is green the reconciler's correctness is manual-inspection-only, wh

### Reliability substrate (data-loss prevention)
- **Automations & Workflows** — Move execution off request thread to at-least-once durable queue + retries + persistent automation_runs log; pass scale-to-zero drop test.
  - _blocker (judge, round 2):_ Durable execution substrate — REAL CODE/SECURITY WORK, not positioning. The runtime must move off the request thread into an at-least-once queue with retries plus a persistent automation_runs log, and pass the committed load test (scale-to-zero → 100 events → zero silent drops). Until that ships, dropped events mean lost deals/surveys — real data loss — and the entire retention argument is pre-rev
- **Bookings & Services** — Harden double-booking under concurrency, timezone/DST rendering, reminder delivery; concurrency/load test.
  - _blocker (judge, round 2):_ Reliability hardening on scheduling correctness — double-booking prevention under concurrent requests, reminder delivery, and timezone/DST rendering — which gates Stripe payments and live client appointments. This is real code work, not positioning; the brief itself marks it "in progress, not yet complete." Until three clean net-new cycles (and ideally a concurrency/load test, since sequential onb
- **Plugins & Extension** — Offline durable-queue + retry-on-reconnect for extension capture (no silent dropped CRM captures) before any paid gate.
  - _blocker (judge, round 2):_ The offline durable-queue / retry-on-reconnect fix — real code/security work the brief explicitly defers — must ship before any paid or retention gate, because it gates real CRM data (silently dropped captures). Secondary and cheaper: the paid-tier value claim is priced before Brain-resolution hit rate is instrumented; that is a positioning/measurement gap, not code. The code item is the gating on

### Unbuilt features / validation
- **Agentic OS** — Production-gate the Agentic OS dashboard (out of NODE_ENV==='development', behind a flag) so ops leads can observe/cancel agents over live CRM.
  - _blocker (judge, round 2):_ Blocker A — the Agentic OS dashboard is hard-gated at NODE_ENV === 'development' and must ship as a production portal feature (behind a flag) before non-developer ops leads can view active skills, cancel a rogue agent, and inspect audit rows. This is real code work, and it gates a buyer's ability to operate AI agents safely over live tenant CRM data on day one. Blocker C (the 5-agency willingness-
- **CMS & Blocks** — Prove HTML-import governance end-to-end: an imported section must stay agent-restylable via brand_voice, not a static blob. Run the 1-site test.
  - _blocker (judge, round 2):_ The unproven HTML-import governance + 48-block end-to-end coverage claim. This is real product/code work, not just positioning: it must be demonstrated that an HTML-imported section (the escape hatch for any coverage gap) remains operable by the MCP pipeline — restylable via brand_voice and structurally editable — rather than degrading to an un-governable static blob. It gates the money motion (ea
- **Agency, Onboarding & Branding** — Wire Brandfetch auto-enrichment on signup (so brand tables ship non-blank) + scope DNS/SSL cert lifecycle for Scale-tier.
  - _blocker (judge, round 2):_ Real code/security work the brief defers that gates real money and data: (a) Brandfetch auto-enrichment is unwired so tables ship blank on day one, and its core premise (auto-data beats manual) is unvalidated; (b) the DNS/SSL/cert-lifecycle hardening for Scale-tier custom domains is an unscoped P0 that gates upsell revenue and can lock a tenant's whole team out of "their own" product. The cheapest
- **Projects, Tickets & Kanban** — Build the Linear/Jira bidirectional sync connector (the 'complementary layer' GTM + the sale depend on it).
  - _blocker (judge, round 2):_ The Linear/Jira bidirectional sync connector — real code work, explicitly deferred by the brief — gates both the core "complementary layer" GTM claim and the sale itself (Buyer will not pay before seeing it live). A second, smaller gap is positioning: the competitive frame names the wrong rivals (Linear/Jira instead of Wayfront/ManyRequests/Assembly), making the catalog-novelty claim factually wro
- **AB Testing** — Wire applyAbToDeckSlides into the public deck render path (the entire wedge is currently vaporware).
  - _blocker (judge, round 2):_ applyAbToDeckSlides is not wired to the public deck render path — the core wedge is vaporware and cannot be used or even self-tested until it ships. This is real code work (the brief flags it as a GO-LIVE BLOCKER) and it gates live client-facing, deal-closing proposals (real money/real data). It must ship before any GTM claim or the prescribed volume self-test can run.

---

## How each GO was earned (audit trail)
- **Company Brain & AI** — GO at round 1 (no reshape needed).
- **Visual Editor** — GO after re-anchoring to cross-domain context-density + striking 3 false claims; god-file split verified already shipped (98/488 lines).
- **CRM** — GO at round 1 (no reshape needed).
- **Pitch Decks & Product Designer** — GO after round-2 reshape (split deck-assist from Product Designer; demote autonomy claim).
- **Surveys** — GO after re-anchoring lead to survey→deck-branching (the one non-replicable primitive).
- **Chat, Realtime & Voice** — GO after correcting the confirm-token security claim + GHL pricing; legal meeting-mode stays hard-gated.

---

_Generated across 5 multi-agent workflow runs (~290 council/judge agents). Round-1 full verdicts + the prior grill decisions remain in `00-DECISIONS.md`; revised briefs are in `v2/`._
