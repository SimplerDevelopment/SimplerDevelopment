# Roast: Storefront & Commerce — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SD's Storefront & Commerce domain is a full white-label e-commerce layer any tenant website can enable. It covers product catalogue (with variants, options, bulk pricing), a dual-path custom product designer (Printful print-on-demand with AI text/image generation on design canvases), cart, checkout (Stripe Connect or BYOK), order management, EasyPost live shipping rates and label purchase, customer accounts with standalone auth, wishlists, reviews, discount codes, and a support inbox. Every table is `websiteId`-scoped — a single SD platform hosts many independent storefronts, each invisible to the others. Design layers are frozen into an `order_items.designSnapshot` JSONB field at checkout, so Printful fulfillment is decoupled from post-purchase design mutations.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies that build client websites on SD and whose clients sell products — physical goods, print-on-demand merch, or custom-designed items.
- **End user:** The client's customers — shoppers who browse, design, and buy through the white-label storefront.
- **Monetization:** Storefront is a paid module gated by `hasServiceAccess('store')` — an add-on tier on top of the base SD subscription. Stripe Connect mode enables a platform fee (`store_settings.platformFeePercent`) taken on each transaction, creating a revenue-share layer on top of subscription revenue. BYOK Stripe mode waives platform fees but requires admin approval (`stripeByokAllowed`).

## The edge
- **AI-powered product designer baked in.** The `designs` API endpoints expose AI text and AI image generation directly on design canvases — customers can generate artwork for their custom merch without leaving the storefront. No Shopify app required; no third-party design tool.
- **Many independent storefronts, one admin.** Because tenancy is `websiteId`-scoped, a single agency account can host dozens of client storefronts in isolation, all managed from one SD admin panel, one billing relationship, and one MCP connection. The aggregate management surface is something no per-client Shopify setup can match.
- **Stripe Connect revenue-share model.** SD can take a platform fee on every sale across all hosted storefronts — a business model not available to agencies running each client on their own Shopify account.
- **Design snapshot → POD fulfillment integrity.** Freezing `layersBySurface` + `canvasSize` at checkout into `order_items.designSnapshot` means designers can mutate or delete their design post-purchase without breaking the Printful order. This is a non-trivial correctness guarantee that a custom-built POD integration typically misses.
- **MCP-controllable store ops.** AI agents can read and write products, orders, discounts, reviews, and customer messages through the 400+ MCP tool surface — enabling autonomous storefront management (inventory adjustments, reply to customer messages, moderate reviews) that point tools don't expose to agent clients.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: Shopify, WooCommerce, BigCommerce, Squarespace Commerce.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
Agencies will recommend SD's storefront to clients who want to sell products online, rather than defaulting to Shopify — which those clients already know by name, whose app ecosystem is mature, and whose checkout conversion is the industry benchmark — purely because SD bundles it alongside the CMS and CRM the agency uses internally.
