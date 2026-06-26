# Roast: Billing & Stripe — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SimplerDevelopment's Billing & Stripe domain is the money layer for a multi-tenant agency SaaS: it handles à-la-carte module subscriptions (12 SKUs + bundle) with a volume-discount ladder (4→10%, 8→20%, 12→30%), per-seat pricing computed as post-discount module subtotal + (seats − 1) × min(subtotal, $30/seat), AI-credit grants and metered pay-as-you-go top-ups, usage rollup to Stripe Subscription Items via cron, and per-site Stripe Connect / BYOK Stripe keys for each agency's own commerce. Agents can query billing state via 4 MCP tools (`invoices_list`, `invoices_get`, `ai_credits_balance`, `ai_credits_ledger`), and an admin panel gives the founder comp discounts, seat overrides, and BYOK-eligible grants per client.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies who subscribe to SD modules à la carte; they pay one bill for the whole platform and bill their clients separately through per-site Stripe Connect.
- **End user:** Agency staff (portal users) consuming AI credits and modules; their clients are the end consumers of per-site commerce.
- **Monetization:** Recurring SaaS subscription (per active module × volume discount + per-extra-seat fee), topped up by AI-credit purchases (prepaid token bundles or pay-as-you-go). BYOK is contact-sales, not a self-serve up-sell. Metered overages (email sends, voice minutes, Replicate upscales) are future-wired but not yet fully live.

## The edge
- **Agency-to-client pass-through commerce is first-class.** Per-site Stripe Connect (with platform application fee) and BYOK Stripe keys mean agencies can run their clients' ecommerce, bookings, and invoicing through SD without co-mingling funds — most agency tools don't touch this layer at all.
- **AI credits are a native billing primitive.** Token consumption is ledgered append-only, metered per client, and surfaced as a usage bar alongside SaaS module charges — not bolted on as an afterthought.
- **One reconciler, no coupon spaghetti.** `recomputeClientSubscription()` is the single Stripe writer; volume discount lives in computed `price_data` line items (not coupons), so comp discounts and volume discounts coexist cleanly and remain auditable.
- **Admin override rails are built.** Founder/sales can set seat-count overrides, comp-discount %, and BYOK eligibility per client without touching Stripe manually — a real ops lever for a small team running enterprise deals.
- **BYOK AI keys reduce platform COGS on top accounts.** When a client brings their own Anthropic/OpenAI key, the token metering for that client is waived (only AI, email, e-sign are waivable; infra never is) — gives the founder a pricing wedge with high-usage clients.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed tools agencies already pay for: Stripe Billing (native), Chargebee, Recurly, Lago, Paddle.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That the volume-discount ladder + per-seat model is compelling enough to convert agencies off the incumbent pattern of a fixed-price tier (Starter/Growth/Scale), given that the current implementation has no automated tests covering seat counts, the reconciler, or seat-line item generation — so any billing bug in a paying account is a manual-fix-in-prod event for a solo founder.
