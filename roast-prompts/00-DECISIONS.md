# SimplerDevelopment — Domain Decisions (grill outcomes)

Recommended resolutions per domain. Method: each domain judged on **positioning**, **standalone? (lens B)**, **monetization**, **invest level**, and the **cheapest de-risk move** for its riskiest assumption. Flag where you disagree; unflagged = accepted.

**Monetization defaults (set during the Brain grill):** base = **flat per-seat**; **MCP access free**; cloud AI usage carries a **token-markup margin** (BYOK is the release valve); pure-infra domains have no direct revenue. Per-domain notes only call out deviations.

**Verdict legend:** KEEP (earns its place) · RESHAPE (keep but fix something first) · HOLD (maintain, don't invest) · DEFER/CUT (stop or shelve) · INFRA (necessary plumbing, not a market product).

---

## Tier 1 — Core wedge

### 1. Agentic OS — KEEP (enabling-layer multiplier) ✅ resolved
- **Positioning:** enabling layer, not a standalone product. Don't sell on it; harden the tools it exposes.
- **Standalone?** No.
- **Dashboard (`lib/agentic-os`):** freeze as internal local-dev tooling. Flagship is `lib/mcp/`.
- **Moat:** hosted instance + integrated data, not the code → open-source the MCP server freely (top-of-funnel).
- **Monetization:** MCP access bundled/free; defer an "Agent Access" paid tier until proven write-work pull.
- **De-risk:** instrument actual agent *write* usage before investing further.

### 2. Company Brain & AI — KEEP (per-seat anchor) ✅ resolved
- **Positioning:** the suite's primary per-seat upsell; differentiated by the human-review queue + grounder.
- **Standalone?** No — wedge depends on auto-ingest from CRM/Gmail/Kanban.
- **Population:** bet on auto-ingest from live activity; manual curation secondary.
- **Monetization:** flat per-seat + token-markup margin on metered cloud AI; BYOK dodges markup.
- **De-risk:** measure passive-ingest population + query usefulness on 1–2 real tenants.

### 3. CMS & Blocks — KEEP (core delivery engine)
- **Positioning:** the production engine agencies bill clients for. Core, not optional. Differentiation = AI authoring + integrated data + visual editor.
- **Standalone?** Weakly yes (vs Sanity/Contentful), but far stronger suite-native — keep it in.
- **Monetization:** bundled in plan (it's the core deliverable); revenue flows via Sites/Hosting usage.
- **Invest:** yes — load-bearing.
- **De-risk:** migrate **one real agency client site** end-to-end on blocks+AI authoring and confirm "good-enough blocks" beats keeping WordPress. The 48-block / plugin-breadth gap is the thing to prove down.

### 4. Visual Editor — RESHAPE (pay down debt before features)
- **Positioning:** the editing surface for CMS; differentiation = AI-native in-context editing.
- **Standalone?** No.
- **Monetization:** bundled with CMS.
- **Invest:** yes, but **contain the complexity debt first** (2k-line god files `BlockContentEditor.tsx`/`HtmlRenderEditor.tsx`, dual-sided postMessage protocol) — that maintenance risk is the real threat to a tiny team.
- **De-risk:** refactor/decompose the god files + add a regression harness *before* shipping new editor features.

### 5. Agency, Onboarding & Branding — KEEP (foundational primitive)
- **Positioning:** the brand profile is the platform primitive feeding all AI generation (copy, email, decks, Brain context).
- **Standalone?** No — it's the config layer.
- **Monetization:** bundled (onboarding).
- **Invest:** yes — but the risk is onboarding abandonment silently degrading every downstream AI feature.
- **De-risk:** make brand capture **near-automatic** (scrape brand from a URL/logo so it's never empty); track completion rate as a health metric.

---

## Tier 2 — Differentiated suite value

### 6. CRM — KEEP (retention anchor)
- **Positioning:** integrated deal flow (Brain auto-hydrate + deal→artifact graph).
- **Standalone?** No — integration *is* the value; standalone it's a worse HubSpot.
- **Monetization:** bundled per-seat; AI enrichment metered.
- **Invest:** maintain + deepen integration; don't chase Salesforce breadth.
- **De-risk:** build a great HubSpot/CSV importer and run one agency's real pipeline through it (beats the migration-inertia risk).

### 7. Projects, Tickets & Kanban — KEEP (don't chase Linear)
- **Positioning:** delivery + client-portal visibility; the cross-domain artifact graph.
- **Standalone?** No — value is portal visibility + links.
- **Monetization:** bundled per-seat.
- **Invest:** maintain; compete on the **client-facing visibility angle Linear/Jira can't do**, not internal-PM parity.
- **De-risk:** confirm agencies use it for client visibility, not as a Linear replacement.

### 8. Automations & Workflows — RESHAPE (fix the engine first)
- **Positioning:** the glue that makes "all-in-one" more than a bundle.
- **Standalone?** No — glue between SD domains.
- **Monetization:** bundled; optionally meter runs.
- **Invest:** yes, but the engine (in-process, fire-and-forget, no retries, 5s cap) **must move to a durable queue + retries before it's marketed** — otherwise users fall back to Zapier on first failure.
- **De-risk:** durable job queue + retries + load test, *then* promote it.

### 9. Email & Campaigns — KEEP (RESHAPE on deliverability)
- **Positioning:** campaign→deal revenue attribution, native.
- **Standalone?** No — attribution depends on CRM.
- **Monetization:** bundled + send-volume usage.
- **Invest:** maintain; the real risk is **deliverability / sender reputation** vs Mailchimp/Klaviyo.
- **De-risk:** prove inbox placement (warmed sending/Resend reputation, seed-list test) before agencies trust it with their lists.

### 10. Pitch Decks & Product Designer — RESHAPE (split it)
- **Positioning:** AI-agent-authored client decks = a real showcase of the agent story.
- **Standalone?** Deck tool: maybe (vs Gamma/Tome). Print designer (Fabric.js): unrelated — **unbundle**.
- **Monetization:** bundled; AI authoring metered.
- **Invest:** invest in **AI deck authoring**; **defer/cut the print designer** (scope creep).
- **De-risk:** ship one fully agent-authored, client-presentable deck end-to-end; decide the print designer's fate separately.

---

## Tier 3 — Table-stakes (bundle-justified; maintain, don't over-invest)

### 11. Surveys — HOLD
- **Standalone?** No — value is CRM score-routing. **Monetization:** bundled. **Invest:** maintain only; don't chase Typeform UX.
- **De-risk:** confirm the score→deal routing is actually used; otherwise it's just a form builder.

### 12. Bookings & Services — HOLD (keep thin)
- **Standalone?** No — Calendly/Cal.com win standalone. **Monetization:** bundled. **Invest:** minimal; lean on embed + agent control as the only differentiators.
- **De-risk:** none heavy — resist feature-creep toward Calendly parity.

### 13. E-Sign & Approvals — HOLD (adoption-gated)
- **Standalone?** No — DocuSign owns legal/compliance. **Monetization:** bundled. **Invest:** minimal; its value rides on AI-publish-approval adoption (tie to the Agentic OS write-usage signal).
- **De-risk:** don't build legal-grade e-sign; validate approval-queue usage first.

### 14. Storefront & Commerce — DEFER / RESHAPE (heaviest, Shopify is brutal)
- **Standalone?** No. **Monetization:** bundled + transaction usage. **Invest:** defer deep build; **decide build-vs-integrate Shopify** rather than out-building it solo.
- **De-risk:** validate whether any real client needs commerce SD can't get by embedding Shopify; don't out-build Shopify with a tiny team.

---

## Tier 4 — Infra & premature bets

### 15. Billing & Stripe — INFRA (harden, urgent)
- **Standalone?** No — it *is* the monetization engine. **Invest:** **add automated tests now** — the flagged zero-coverage on seat counts/reconciler/line-items means any bug is a fix-in-prod event.
- **De-risk:** test suite for billing math before any new billing feature. (Highest-urgency infra item.)

### 16. Sites, Hosting & Publishing — INFRA (security-fix)
- **Standalone?** No. **Monetization:** hosting usage. **Invest:** maintain; **close the flagged middleware host-gate gap** (full DB-lookup host resolution) — security, not optional.
- **De-risk:** fix host resolution before scaling tenants/domains.

### 17. Auth & Security — INFRA (keep home-grown for now)
- **Standalone?** No. **Monetization:** none. **Invest:** keep the existing build; **don't build SSO/MFA speculatively** — add (or buy Clerk/WorkOS) only when a real enterprise deal demands it.
- **De-risk:** keep a documented migration path to Clerk/WorkOS as the enterprise escape hatch.

### 18. Integrations — Google/Microsoft/OAuth — INFRA (security-fix before OSS)
- **Standalone?** No. **Monetization:** none. **Invest:** **encrypt refresh tokens at rest + close revocation gaps** — flagged plaintext token storage is an audit target the moment the repo is public.
- **De-risk:** do this *before* the OSS release.

### 19. AB Testing — DEFER
- **Standalone?** No. **Invest:** defer — agencies may not be the buyer, and the differentiated surface (deck A/B) isn't even wired to public render.
- **De-risk:** cheapest test = ask 3 agencies if they'd use it before writing any more code.

### 20. Chat, Realtime & Voice — CUT / SHELVE (clearest over-build)
- **Standalone?** No. **Invest:** **freeze** — fully built, mounted for zero customers. Don't ship voice to prod on spec.
- **De-risk:** get one customer committed to live chat/voice before un-shelving. Strong candidate to delete from the critical path.

### 21. Plugins & Extension — DEFER (ecosystem of one)
- **Standalone?** No — a marketplace needs demand *and* supply; you have one plugin and no marketplace. **Invest:** defer the marketplace; keep the extension mechanism only where it serves first-party needs.
- **De-risk:** revisit only when 3rd parties actually ask to build on it.

---

## The through-line
- **Almost nothing should stand alone.** The suite *is* the moat (integrated data + hosted), so OSS-ing the code is safe and most domains die outside the bundle — that's fine, it's the strategy.
- **Three security/hardening items jump the queue** (and gate the OSS release): #18 Integrations (plaintext tokens), #16 Sites (host gate), #15 Billing (no tests).
- **Three clear cuts/defers** free solo-founder time: #20 Chat/Voice (shelve), #19 AB Testing (defer), #21 Plugins (defer).
- **Two "fix-before-you-market" reshapes:** #8 Automations (durable engine), #9 Email (deliverability).
