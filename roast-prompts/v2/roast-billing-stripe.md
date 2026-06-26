# Roast V2: Billing & Stripe — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

SimplerDevelopment's Billing & Stripe domain is the money layer for a multi-tenant agency SaaS. Its load-bearing asset is `recomputeClientSubscription()` — a single, auditable Stripe writer that computes correct line items via `price_data` (not coupon objects), making volume discounts, comp overrides, and seat-line items coexist cleanly and remain legible to an auditor. Layered on top: per-site Stripe Connect so agencies run their own clients' commerce through SD without co-mingling funds, with a platform application fee giving SD a GMV take-rate. AI credits are a native billing primitive — ledgered append-only, metered per client, surfaced alongside SaaS module charges. Four MCP tools (`invoices_list`, `invoices_get`, `ai_credits_balance`, `ai_credits_ledger`) let agents query billing state; an admin panel gives the founder comp discounts, seat overrides, and BYOK-eligibility grants per client without touching Stripe manually.

**Customer-facing packaging pivot (adopted):** The à-la-carte 12-SKU + 4/8/12 volume ladder + capped per-seat formula is being replaced with three fixed published tiers (Starter / Growth / Scale). The existing single reconciler and `price_data` engine stay intact — only the storefront simplifies. The pricing headline shifts from "seat algebra" to "Stripe Connect GMV take-rate": agencies earn SD's billing infrastructure by virtue of running client commerce through the platform.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies subscribing to SD as an all-in-one OS; they pay one predictable bill (fixed tier) and run their clients' ecommerce, bookings, and invoicing through per-site Stripe Connect.
- **End user:** Agency staff consuming AI credits and modules; their clients are the end consumers of per-site commerce.
- **Monetization:** Recurring SaaS subscription (three published tiers — Starter / Growth / Scale — computed underneath by the existing reconciler) + AI-credit top-ups (prepaid bundles or pay-as-you-go) + platform application fee on Stripe Connect GMV. BYOK keys are a contact-sales lever that reduces platform COGS on high-usage accounts. Metered overages (email sends, voice minutes, upscales) are wired but not yet fully live.

## The edge

- **One reconciler, zero coupon spaghetti — the only defensible moat.** `recomputeClientSubscription()` is the single Stripe writer for the entire platform. Volume discounts live in computed `price_data` line items, so comp overrides and volume adjustments coexist and are independently auditable. No incumbent SaaS billing provider offers a multi-tenant agency operating model where this reconciler is also the engine behind per-site Connect GMV and AI-credit metering in a single ledger.
- **Stripe Connect GMV take-rate as the pricing story.** Agencies don't just subscribe to a tier — they earn SD's billing infrastructure by routing client commerce through the platform. SD captures a platform application fee on every client transaction. This is the differentiator no fixed-tier SaaS competitor pitches; it aligns SD's revenue with agency growth.
- **AI credits as a native billing primitive.** Token consumption is ledgered append-only, metered per client, and surfaced as a usage bar alongside SaaS module charges — not an afterthought add-on that requires a third-party credits API.
- **Admin override rails for enterprise ops.** Founder/sales can set seat-count overrides, comp-discount %, and BYOK eligibility per client without touching Stripe manually — a real ops lever for closing bespoke agency deals without billing-system rework.
- **BYOK AI keys reduce platform COGS on top accounts.** When a client brings their own Anthropic/OpenAI key, token metering for that client is waived — a pricing wedge with high-usage clients that also protects the platform's gross margin.

## Constraints

- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the tools agencies already pay for: Stripe Billing (native), Chargebee, Recurly, Lago, Paddle. **The answer is not feature parity — it is deep cross-domain integration (CRM, Brain, modules) that point tools cannot replicate.**
- Time-to-first-dollar and maintainability by a tiny team both matter.
- **GO-LIVE BLOCKER (open, not closed):** Automated test coverage on `recomputeClientSubscription()` — specifically, golden-master / property tests replaying the four known edge cases (seat change mid-cycle, proration collision, cron race, volume-threshold crossing) asserting correct Stripe line items — does not yet exist. This is a committed, scoped blocker that must pass before any real agency is charged a dollar. Until it passes, the reconciler's correctness is asserted by manual inspection only, which is not an acceptable posture for a solo founder running production billing. This is a genuine 48-hour engineering job, not a positioning tweak, and is represented here accurately.

## Roast it on two lenses

1. **Earns its place in the suite?** The module is suite INFRA — the thing that makes every other module billable. The question is whether the reconciler is robust enough to trust with real paying accounts (it is not yet, pending the blocker above), and whether three fixed tiers + GMV take-rate is a sharper wedge than the prior à-la-carte ladder for agencies evaluating consolidation.

2. **No standalone ambition — bundled billing infra layer.** This is not a Stripe / Chargebee / Lago competitor. Pitched standalone, it is DOA: those incumbents have compliance, scale, and distribution SD cannot match, and the "edge" features (Stripe Connect per-site, AI-credit metering, module-aware pricing) only exist inside the SD monorepo's cross-domain context. The only question on this lens is whether the current constraints make the bundled billing layer a liability (a risky, untested reconciler) or an asset (an auditable, single-writer engine that pays for itself via GMV take-rate). The council should roast on that narrow axis, not on standalone viability.

## Riskiest assumption to pressure-test

That the three-tier fixed-pricing storefront — backed by the existing single reconciler — is compelling enough to convert agencies off the incumbent pattern of Stripe Billing direct, *without* first shipping automated edge-case coverage on `recomputeClientSubscription()`. The de-risked posture is: the reconciler test harness is the load-bearing gate; once it passes, the pricing story (fixed tiers + GMV take-rate) is straightforward to validate via a fake-door pricing page against 5 agency prospects before a single real account is charged. The assumption the council should challenge is not "will agencies prefer fixed tiers?" (cheaply testable) but "will a solo founder actually prioritize the test harness over shipping the next feature?" — because if not, the one failure mode that can end the business (silent billing error on a live account) remains live.
