# Roast Priority — SimplerDevelopment domains

**Ranking axis:** strategic stakes (how load-bearing each domain is to SD's real wedge — an *AI-native, MCP-operable, integrated* agency OS), with ties broken by **roast signal-value** (where a brutal verdict would most change the plan). Roast top-down: Tier 1 first.

Other axes you might re-sort by: **likely-KILL-first** (cut fast → start at the bottom), **first-dollar potential** (revenue wedge), or **maintenance-drag** (what's bleeding solo-founder time).

---

## Tier 1 — Core wedge (roast first; the platform's reason to exist)
1. **Agentic OS** — the MCP server + agent harness *is* the differentiation. If this isn't a real moat, SD is just a weaker all-in-one. Highest stakes. (Note: dashboard is local-dev only; the asset is `lib/mcp/`.)
2. **Company Brain & AI** — the RAG/knowledge layer that feeds every other domain's AI (brand context, CRM classification). Central + adoption-risky (the knowledge-base-population problem).
3. **CMS & Blocks** — the client-website delivery engine agencies actually bill for. No this, no agency platform.
4. **Visual Editor** — the editing surface for #3; coupled to it, but carries the worst complexity-debt risk (2k-line god files, dual-sided postMessage protocol).
5. **Agency, Onboarding & Branding** — the brand profile is the primitive powering all AI generation; if onboarding is skipped, every downstream AI feature degrades silently. Foundational leverage.

## Tier 2 — Differentiated suite value (the integration moat)
6. **CRM** — retention anchor; Brain auto-hydration + deal→artifact graph is genuinely integrated, not a webhook afterthought.
7. **Projects, Tickets & Kanban** — delivery + client-portal visibility; crowded/habitual space (Linear/Jira) but high stickiness.
8. **Automations & Workflows** — the glue that makes "all-in-one" more than a bundle. High stakes *and* high uncertainty (engine is in-process, fire-and-forget, no retries) = best pure roast target.
9. **Email & Campaigns** — campaign→deal revenue attribution is native; deliverability/sender-reputation vs Mailchimp/Klaviyo is the risk.
10. **Pitch Decks & Product Designer** — "an agent builds a client-ready deck" is a real demo; but the brief flags it bundles an unrelated Fabric.js print designer — roast the bundling itself.

## Tier 3 — Table-stakes (keep for completeness; bundle-justified, don't over-invest)
11. **Surveys** — CRM score-routing justifies it; the product itself trails Typeform/Tally on respondent UX.
12. **Bookings & Services** — value is only embed + MCP control; Calendly/Cal.com are free-and-good.
13. **E-Sign & Approvals** — niche; only pays off if AI-publish-approval adoption is real, and it lacks DocuSign's legal/compliance trail.
14. **Storefront & Commerce** — Shopify is brutal to beat and the heaviest to maintain; bundle-only justification.

## Tier 4 — Infra & premature bets (roast = build-vs-buy or cut/defer, not market validation)
15. **Billing & Stripe** — necessary infra (SD's own monetization), not a market product; honest test-coverage risk (a billing bug = fix-in-prod).
16. **Sites, Hosting & Publishing** — necessary delivery infra; real ecosystem gap vs WordPress/Webflow themes+plugins.
17. **Auth & Security** — pure infra; home-grown vs Clerk/WorkOS; roast this as build-vs-buy. SSO/MFA gap is a near-term enterprise blocker.
18. **Integrations — Google, Microsoft & OAuth** — enabling infra; plaintext-refresh-token + revocation gaps flagged.
19. **AB Testing** — speculative; agencies may not be the buyer at all, and the differentiated surface (deck A/B) isn't even wired into the public render path.
20. **Chat, Realtime & Voice** — fully built, mounted for zero customers. The clearest "build it all, ship none" over-engineering — strong cut/defer candidate.
21. **Plugins & Extension** — an ecosystem of one with no marketplace; premature platform play. Defer until there's both demand and third-party supply.

---

### How to read this
- **Tiers 1–2 (1–10):** worth a real roast — the verdict could genuinely move investment.
- **Tier 3 (11–14):** the roast will likely say "keep only because it's bundled" — useful to confirm, low surprise.
- **Tier 4 (15–21):** several answers are *already* "cut/defer" or "infra, don't market" — roast mainly to make the cut decisive (esp. #19 AB Testing, #20 Chat/Voice, #21 Plugins).
