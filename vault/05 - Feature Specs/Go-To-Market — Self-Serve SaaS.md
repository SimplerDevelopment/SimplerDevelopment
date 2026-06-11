---
type: spec
domain: go-to-market
status: proposed
date: 2026-06-11
sources:
  - lib/billing/domain-catalog.ts
  - lib/billing/entitlements.ts
  - lib/ai-credits.ts
  - lib/ai/portal-tools/index.ts
  - app/api/portal/ai/chat/route.ts
  - app/api/stripe/webhook/route.ts
  - app/portal/login/page.tsx
  - lib/website-provisioner.ts
---

# Go-To-Market: SimplerDevelopment → Self-Serve AI-Native SaaS

> **One-liner:** *The business platform with a brain that runs itself.* Pro-services teams chat with an AI agent that actually operates their CRM, content, projects, and email — priced as the escape from HubSpot's cliff.

Working board: [[GTM Launch Board]]. Built from a `/grill-me` strategy interview (9 resolved forks) + a 6-agent codebase review on 2026-06-11.

---

## Strategy at a glance — the 9 locked decisions

| # | Decision | Locked choice |
|---|---|---|
| 1 | **Positioning** | AI-native ops — "a brain that runs itself." Market the Brain + agentic layer; the 13-module suite is the substrate. New category, minimal direct competition. |
| 2 | **ICP** | Pro-services / small teams (5–50): agencies, consultancies, advisory & accounting firms. Adjacent to the existing agency book; where org-memory pain is real. |
| 3 | **Wedge** | "Run your business by chatting" — the **in-app agentic chat** (already built: 81 tools, 14 domains, ~41 write actions, zero-setup on Growth+). |
| 4 | **Pricing shape** | 3 per-seat tiers (Starter / Growth / Scale), **AI as the axis**, **no onboarding fee**. Per-seat → land-and-expand revenue. |
| 5 | **AI economics** | Metered / credits-visible, bounded by 5 guardrails (below). The trial *is* a free-credit grant. |
| 6 | **Activation** | Demo workspace → agent sets up the real one. (Defers the Google-token blocker — import becomes a post-activation "deepen" step.) |
| 7 | **Sequencing** | Phase 0 beachhead (convert existing clients) → Phase 1 private beta → Phase 2 public launch. |
| 8 | **Acquisition** | Product-led growth + viral loops (primary public engine). Warm network drives Phase 0; content/ecosystem is the secondary layer. |
| 9 | **Free entry** | Generous one-time credit grant + **referral credits** — viral loop funded in credits (tokens), not cash. Referred users arrive with credits and experience the AI wedge. |

---

## Current state (what the 2026-06-11 review found)

**The product is enormous and mostly built.** ~357k LOC, 21 domains, 400+ external MCP tools, 13 billable modules already wired to live Stripe price IDs in `lib/billing/domain-catalog.ts`.

**Strengths to lead with:**
- **Company Brain (AI/RAG)** — the crown jewel; no SMB competitor is close.
- **In-app agentic chat** — `lib/ai/portal-tools/index.ts` exposes 81 tools across 14 domains; `app/api/portal/ai/chat/route.ts` runs a real tool loop. Works with **zero setup** on Growth/Scale (platform Anthropic key). *This is the wedge, and it already exists.*
- CMS + Visual Editor, CRM, Store w/ designer, Projects/Kanban — all deep.

**The self-serve gap — today a stranger literally cannot pay us:**
- No public signup route (`app/portal/login/page.tsx` → "Contact us"); accounts are 100% admin-provisioned.
- `billingMode` defaults to `agency` → the self-serve checkout API 403s until an admin flips a client to `saas`.
- No Stripe-triggered provisioning; onboarding wizard never creates a site; site provisioning is infra-coupled (`lib/website-provisioner.ts`).

**Revenue-integrity bugs that bite *after* you have paying self-serve customers** (must fix in Phase 0):
- Monthly AI credit grants fire only on *initial* checkout, not renewal (`app/api/stripe/webhook/route.ts`).
- `invoice.payment_failed` unhandled → no dunning.
- Metered overage accumulates but `metered_subscription_items` require manual admin setup → overage never bills.
- Pay-as-you-go debt tracked in `lib/ai-credits.ts` but never invoiced.

---

## Positioning & messaging

- **Category:** AI-native business operations ("an AI that runs your business," not "a suite with an AI button").
- **Hero promise:** *Stop running 8 tools by hand. Tell one AI what you want done — it does it across your CRM, content, projects, and inbox.*
- **Against HubSpot:** "HubSpot Pro's power without the cliff — no $1,300/mo jump, no $3–7k onboarding fee, AI that does the work instead of drafting a paragraph."
- **Proof surface:** the in-app agent doing real multi-step work in a demo workspace in <2 minutes.

## ICP

Pro-services teams of 5–50: marketing/creative agencies, consultancies, advisory & accounting firms, fractional-exec shops. They feel org-memory pain, are client-centric, and already pay for tools (HoneyBook/HubSpot Starter/Notion). The Brain's org features (who-knows-what, decisions, required-reads) earn their keep when there's an org. The wealth-advisory Brain template is a ready-made vertical beachhead if a niche-first sub-play is wanted.

## The wedge

"Run your business by chatting." A non-technical user opens the **in-app** chat (no MCP, no Claude Desktop, no API key on Growth+) and the agent creates deals, builds pages, drafts campaigns, moves cards, sets up automations. The external 400+-tool MCP server is the **power-user expansion / wow**, not the front door. Gap to close: store-domain tools and the streaming/mobile tool loop (`/stream` is currently text-only — Phase 4 in code).

---

## Pricing & packaging

**Shape:** three per-seat tiers, AI as the differentiating axis, no onboarding fee. The 12 à-la-carte modules survive *underneath* for agency/custom deals — they are **not** shown on the self-serve pricing page.

> **Numbers below are illustrative hypotheses — validate in Phase 0.** Anchored to landing between HubSpot Starter (~$20/seat) and the brutal Pro cliff (~$260/seat-equivalent + $3–7k onboarding).

| Tier | Illustrative $/seat/mo | AI economics | For |
|---|---|---|---|
| **Starter** | ~$19 | Modest included allowance, **marked-up** metered overage, **no BYOK** → token markup is a profit center | price-sensitive / solo |
| **Growth** ⭐ | ~$59 | Generous-ish allowance, **marked-up** overage, **no BYOK** → profit center + upgrade pressure | the hero — "chat to run your business" |
| **Scale** | ~$119+ | **Unlocks BYOK → spend at cost**; large allowance for non-BYOK; white-label, governance, compliance | bigger teams; compliance-sensitive |

**The BYOK inversion (locked 2026-06-11):** BYOK is **not** a universal escape valve — it is a **Scale-tier unlock**. Marked-up metered AI on Starter/Growth is a deliberate **profit center** *and* the upgrade engine — rising overage at volume is what makes the at-cost BYOK unlock worth buying. Bonus: BYOK is also data-control, so compliance-sensitive clients (advisory / accounting / wealth) self-select into the top tier. Risk to manage — bill-shock now concentrates on price-sensitive low tiers, so guardrails 2–4 are load-bearing there, and the included allowance must be generous enough to activate the wedge but not so generous there's no overage left to profit from.

The legacy $159 flat "SimplerDev Complete" bundle becomes an agency/custom SKU, not a public tier.

### AI economics (metered-first) — the 5 committed guardrails

1. **Per-seat software base + metered AI on top** — the platform is predictable; only AI meters.
2. **Per-tier included credit allowance** — light users feel "included"; only heavy users hit the meter.
3. **Transparent per-action cost in-product** — "this run ≈ 12 credits (~$0.12)" shown before/after.
4. **User-set spend caps + budget alerts** — no invoice ever exceeds a ceiling the user didn't opt into (the fix Salesforce shipped after metered-AI pushback).
5. **Free-credit-grant trial (no card)** — since AI isn't bundled, the trial *is* a block of free credits. **BYOK is a Scale-tier unlock, not a universal option** (see the inversion above): marked-up metered AI on lower tiers is the profit center, and BYOK waives the markup only at the top tier.

### Competitive context (mid-2026, see interview research)

- **HubSpot:** seat-based; Starter ~$15–20/seat, **Customer Platform Pro ~$1,300/mo (5 seats) + $1.5–7k onboarding** + contact overages; AI via "Breeze credits" ($0.01/credit, agents $0.50–$1.00/outcome).
- **HoneyBook** (closest ICP comp): flat $29/$49/$109, AI bundled.
- **GoHighLevel:** flat $97/$297/$497, AI bundled (+ "AI Employee" add-on).
- **Zoho One:** ~$37/user all-apps, Zia included.
- **Pattern:** SMB platforms *bundle* AI; HubSpot/Salesforce *meter* it and both walked rates back after pushback. Our metered-first model is viable **only** with guardrails 1–5.

---

## Activation / first-run

Every signup lands in a **pre-seeded demo workspace** (sample contacts/deals/draft site/projects) so the agent's power is visible in the first message — zero cold-start, zero import friction. Opening "wow" interactions can be scripted/cached so they barely touch the credit grant (serves the metered-cost choice). The agent then pivots: *"Now let's set up YOUR business"* — creating real data conversationally. Import (Google/email/CSV) is a later "deepen" step that feeds the Brain.

---

## Go-to-market motion (sequencing)

### Phase 0 — Beachhead (convert existing clients)
Flip existing agency clients to `saas` mode (manual flip is fine). Validate metering, activation, and the demo-seed flow on warm, forgiving users. **Fix the revenue-integrity bugs here, at low stakes, before any stranger touches money.** Produce the first case studies/testimonials.

### Phase 1 — Private beta (invite-only)
Build the full cold-stranger funnel and stress it with a waitlisted cohort: public signup + email verification → auto-`saas` billingMode → demo workspace → agent-led setup → Stripe checkout → self-serve billing portal, **zero human touch**. This is where "self-service SaaS" is actually achieved (gated to invites).

### Phase 2 — Public launch (PLG)
Open public signup. Ignite viral loops: referral credits + shareable agent artifacts + public template/recipe gallery. Launch assets + ecosystem listings.

---

## Acquisition (PLG + viral loops)

**Primary engine:** product-led growth.
- **Referral credits** — referrer + referee both get credit grants; loop funded in tokens, not cash.
- **Shareable artifacts** — agent-built pages/sites/decks carry a "made with" attribution that links back; referred users land with a free-credit grant and hit the AI wedge.
- **Template/recipe gallery** — public, SEO-friendly, shareable agentic workflows.

**Secondary layers:** founder-led content + the AI-ecosystem angle (build-in-public, "HubSpot alternative" SEO, list as an MCP server / in AI-tool directories), a Product Hunt launch moment, partnerships into pro-services communities. **Warm network** carries Phase 0.

---

## MVP / "marketable" bar (per phase)

- **Phase 0 marketable:** the model works end-to-end for a *warm* client — demo seed + free credits + transparent metering + spend caps + revenue-integrity fixes; existing clients converted; `bun test:tenancy` green (fix the 9 pre-existing `oauth_clients` failures).
- **Phase 1 marketable:** a *cold invited stranger* completes signup → activation → subscribe → self-manage billing with **no human intervention**. ← self-service SaaS achieved.
- **Phase 2 marketable:** public signup open + viral loops live + launch assets shipped.

## Success metrics (starting hypotheses — set real targets after Phase 0 baseline)

| Metric | Phase | Hypothesis |
|---|---|---|
| Activation (signup → first real agentic workflow) | 1 | ≥ 40% |
| Time-to-aha | 1 | < 10 min |
| Trial (credit grant) → paid | 1–2 | 5–15% |
| Credit-burn per trial (cost ceiling) | 0 | baseline, then cap |
| Viral coefficient (k) | 2 | > 0.5 early; 1.0+ = self-sustaining |
| Manual interventions per signup | 1 | 0 |
| Bill-shock complaints | 1–2 | ~0 (guardrails working) |
| Logos | 0 / 1 / 2 | convert existing → 20–50 beta → open |

---

## Key risks & mitigations

- **AI cost on trials/free users** → capped one-time grant, scriptable demo, metered after, BYOK option.
- **Bill-shock churn from metered AI** → spend caps + per-action transparency + per-tier included allowance (guardrails 2–4).
- **PLG loops slow to ignite** → referral credits + content/ecosystem as secondary; don't bet solely on virality.
- **Provisioning infra scaling** for self-serve volume (GitHub/Vercel/Cloudflare coupling in `lib/website-provisioner.ts`) → may need a shared-hosting path.
- **New-category education cost** → demo-first proof; concrete "vs HubSpot" framing.
- **Exposing public signup** → rate-limiting, abuse protection on the free-credit grant, email verification; token-encryption only when import ships.

## Open decisions / follow-ups

1. Lock real tier prices + the credit→dollar rate and per-tier allowances (Phase 0).
2. Decide whether Phase 1 trial requires a card at signup (default: no card, rely on credit cap; flip if abuse bites).
3. Niche-first sub-play? (wealth-advisory template exists) vs horizontal pro-services.
4. How tier plans reconcile with the existing à-la-carte `services` catalog + Starter/Growth/Scale `plan-gate` (one pricing page, modules underneath).
5. Streaming/mobile chat tool loop (`/stream`) — Phase 1 or Phase 2?

## Related

[[Per-Domain SaaS Billing & BYOK]] · [[Billing & Stripe]] · [[Company Brain & AI]] · [[Agency, Onboarding & Branding]] · [[Auth & Security]] · board: [[GTM Launch Board]]
