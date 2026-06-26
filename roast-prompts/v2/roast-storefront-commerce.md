# Roast V2: Storefront & Commerce — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

SD's Storefront & Commerce domain is a white-label e-commerce layer any tenant website can enable — but its pitch has been reframed. The prior V1 positioned this as a Shopify competitor on checkout conversion and feature breadth. That framing is dead; this brief buries it. The reframed thesis: SD earns a cut of every client sale across all hosted storefronts, managed from one admin, through one billing relationship, on one MCP surface — an **agency P&L play**, not a merchant feature race.

The module covers product catalogue (variants, options, bulk pricing), a POD-niche AI design canvas (Printful print-on-demand + AI text/image generation), cart, checkout (Stripe Connect or BYOK), order management, EasyPost live shipping rates and label purchase, customer accounts, wishlists, reviews, discount codes, and a support inbox. Every table is `websiteId`-scoped; design layers are frozen into `order_items.designSnapshot` JSONB at checkout, decoupling Printful fulfillment from post-purchase mutations.

The ICP is now explicit: **light commerce** — 5–50 SKUs, print-on-demand merch, a store that is incidental to the client's main site. Serious-commerce clients (high-SKU, high-GMV, complex logistics) should go to Shopify. A Shopify-embed escape hatch is on the near-term roadmap so the agency relationship survives when a client outgrows SD rather than forcing a binary choice.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies on SD whose clients want a light store without a separate Shopify subscription — especially POD/merch use cases. The value pitch is to the **agency P&L**: they earn a platform-fee cut on every client transaction, passively, without managing a separate billing relationship per client.
- **End user:** The client's customers — shoppers on the white-label storefront.
- **Monetization:** Add-on subscription tier (gated by `hasServiceAccess('store')`) plus a **1–2% platform fee** taken on each transaction via `store_settings.platformFeePercent`. BYOK Stripe mode waives the platform fee (admin-approved via `stripeByokAllowed`). This is the business model: recurring SaaS + GMV take-rate, not a one-time setup fee. The platform fee is the differentiating revenue stream — nothing in a per-client Shopify setup produces it.

## The edge

- **Platform-fee revenue-share + one-admin multi-tenant aggregation (lead claim).** A single SD agency account hosts dozens of client storefronts in isolation, all managed from one admin panel, one billing relationship, one MCP connection — and earns a cut of GMV across all of them automatically. No per-client Shopify account, no per-client billing ops, no separate MCP endpoints. This aggregate commercial surface is the defensible asset; it is structurally unavailable to any per-client Shopify setup.
- **MCP-controllable store ops.** AI agents can read and write products, orders, discounts, reviews, and customer messages through the shared MCP surface — enabling autonomous multi-storefront management (bulk inventory adjustments, reply to customer messages, moderate reviews across all client stores in a single agent session) that point tools do not expose.
- **Design snapshot → POD fulfillment integrity.** Freezing `layersBySurface` + `canvasSize` at checkout into `order_items.designSnapshot` means designers can mutate or delete their design post-purchase without breaking the Printful order. This is a non-trivial correctness guarantee that a custom-built POD integration typically misses.
- **AI design canvas (POD-niche, not the differentiator).** The `designs` API exposes AI text and image generation on design canvases for the merch/POD use case. Investment in this feature is capped; it supports the POD ICP but is not the purchase driver, and is not pitched against general-purpose design tools.
- **Shopify-embed escape hatch (roadmap).** For clients who outgrow SD's light-commerce scope, a Shopify-embed path (GoHighLevel's own 2025 move) preserves the agency relationship and the CRM/Brain/billing stack without forcing a full re-platform. This is a near-term roadmap item, not a shipped feature.

## Constraints

- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- **ICP is explicitly scoped.** This module is not designed to beat Shopify on checkout conversion, app ecosystem depth, or SKU scale. Serious-commerce clients are actively referred to Shopify. Staying in this lane is a constraint, not a gap.
- **GO-LIVE BLOCKER — multi-tenant auth/Connect/label-purchase hardening (open, not closed):** The Contrarian's surviving point is real. Standalone customer auth, PCI-adjacent Stripe Connect flows, and EasyPost label purchase across dozens of `websiteId`-isolated tenants is a one-breach-loses-every-client surface. Before scaling tenant count or promoting the module externally, the hardening work must close: (a) threat-model and tighten the standalone customer auth paths under multi-tenant isolation, (b) review Stripe Connect payouts and webhook scoping per-`websiteId` for misrouting risk, (c) scope-gate EasyPost label purchase so one tenant's API key cannot be leveraged for another's. This is real code and security work — it is committed scope, currently in progress, and is a non-negotiable gate before external promotion.
- Time-to-first-dollar and maintainability by a tiny team both matter. The revenue-share model creates passive GMV income, which is the only monetization path compatible with a small team's support capacity.

## Roast it on two lenses

1. **Earns its place in the suite?** Does the platform-fee revenue-share + one-admin aggregation model create real, incremental value for the agency that the per-client Shopify alternative cannot replicate — or is the take-rate too small to change behavior, and is the bundled store so far below Shopify that agencies lose client trust by recommending it?
2. **Could it stand alone? No standalone ambition — bundled retention layer.** This lens is closed by design. The platform-fee model is entirely derivative of multi-tenant co-location; there is no revenue-share wedge outside the suite. The ICP (light/POD commerce incidental to a client website) has no reason to exist as a standalone product against Shopify, BigCommerce, or WooCommerce. Roast the bundled positioning itself: is the platform-fee cut compelling enough that agencies actively choose to land clients here rather than Shopify, or does it just mean they accept the fee when a client asks for a store?

## Riskiest assumption to pressure-test

**Commercial, not technical.** The reframe shifts risk from "will the module work?" (it ships) to "will agencies accept the platform-fee model and flip the gate on a real client store?" The assumption: existing SD agencies will (a) accept a 1–2% take-rate in exchange for multi-tenant management convenience, and (b) actively recommend this over Shopify for at least their light-commerce clients — not because the feature set is better, but because the aggregate P&L impact of earning a cut across all hosted stores is worth the ICP trade-off.

**Cheapest test (no code required):** In 48 hours, take a one-pager offering the platform-fee revenue-share + multi-tenant store to 5–10 existing SD agencies and see if even one will (a) accept the fee split and (b) flip the gate on a real, even tiny, client store. One yes validates the reframed GTM; zero yeses means the fee model is the BYOK trapdoor — agencies refuse the take-rate the moment a client has volume, and the whole P&L pitch collapses.
