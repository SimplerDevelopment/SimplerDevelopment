---
type: domain-map
domain: storefront
status: active
date: 2026-06-10
sources:
  - lib/storefront/
  - lib/db/schema/store.ts
  - lib/db/schema/productDesigner.ts
---

# Domain: Storefront & Commerce

## Purpose

Provides a full white-label e-commerce layer that any tenant website can enable. Covers product catalogue, variants, product designer (custom print-on-demand), cart, checkout, Stripe payment, order management, shipping (manual flat-rate or EasyPost live labels), print-on-demand fulfillment (Printful), customer accounts, wishlists, reviews, and discount codes. Every table is `websiteId`-scoped — a single platform hosts many independent storefronts.

## Key entry points

| File / Dir | Role |
|---|---|
| `lib/db/schema/store.ts` | All commerce tables (products, variants, carts, orders, customers, designs, webhooks) |
| `lib/storefront/mcp-sdk-adapter.ts` | MCP tool implementations (re-exported by `lib/mcp/tools/storefront.ts`) |
| `lib/storefront/customer-auth.ts` | Customer session register/login/logout/password-reset |
| `lib/storefront/designer-auth.ts` | Resolves designer caller: bearer token, guest cookie, or anonymous |
| `lib/storefront/portal-staff-auth.ts` | Third auth path — NextAuth + `x-portal-staff: 1` for store owners editing designs |
| `app/api/storefront/[siteId]/` | Public storefront API (products, cart, checkout, account, designs) |
| `app/api/portal/websites/[siteId]/store/` | Portal management API (products, orders, settings, shipping, fulfillment) |
| `app/portal/websites/[siteId]/store/` | Portal UI (products, orders, categories, discounts, shipping, settings) |
| `app/sites/[domain]/` | Public-facing storefront pages (product pages, designer, account, checkout flow) |
| `app/api/stripe/webhook/ecommerce/route.ts` | Stripe webhook — payment confirmation, POD order submission trigger |
| `app/api/webhooks/printful/route.ts` | Printful fulfillment status events (idempotent via `printful_events`) |
| `app/api/webhooks/easypost/route.ts` | EasyPost tracking events (idempotent via `easypost_events`) |
| `lib/fulfillment/pod.ts` | `submitPODOrder` + `getPODShippingRates` — Printful integration |
| `lib/fulfillment/providers/printful.ts` | Printful REST client |
| `lib/shipping/providers/easypost.ts` | EasyPost fetch-based client (rates, buy label, webhook HMAC verify) |
| `lib/shipping/providers/types.ts` | Shared carrier-provider interface |
| `lib/printing/upscale.ts` | AI image upscaling before print submission |

## Data model (products, orders, fulfillment, shipping)

All tables in `lib/db/schema/store.ts`. Tenancy key: `websiteId` on every table.

**Catalogue**
- `store_settings` — per-website feature flags, Stripe mode (`connect` | `byok`), shipping/fulfillment provider selection, tax, parcel defaults.
- `product_categories` — hierarchical (self-referencing `parentId`).
- `products` — prices in cents, status `draft|active|archived`, `designable` flag, optional `printfulVariantId`.
- `product_options` / `product_option_values` / `product_variants` — option matrix; each variant carries its own price, SKU, inventory, optional `printfulVariantId`.
- `product_images`, `bulk_pricing_rules`.
- `payment_methods` — client-scoped (`clientId`) Stripe card records (`brand`, `last4`, `expMonth`/`Year`, `isDefault`); used for platform billing, not storefront customer checkout.

**Product designer (custom print) — store.ts tables (older / Magamommy-era)**
- `product_design_surfaces` — named print surfaces per product (front/back/sleeve), canvas dimensions, print-area bounds, DPI.
- `designs` — UUID PK; `layersBySurface` (JSONB keyed by surface slug); owned by a `storeCustomer` or a guest `sessionId`. `isTemplate` flag for site-wide reusable templates.
- `design_assets` — S3 URLs for user-uploaded art within a design (cleaned up on delete).

**Product designer (custom print) — productDesigner.ts tables (current subsystem)**

Defined in `lib/db/schema/productDesigner.ts`. These tables back the newer per-product style/color-picker designer (used by `app/sites/[domain]/design/[productSlug]/` and the portal style-management routes). They are schema-separate from the older `designs` table above.

- `product_styles` — designable color/colorway variants of a product; each carries an optional price override, swatch hex, and thumbnail URL.
- `product_sides` — per-style mockup images with printable-area bounds (x/y/width/height in image pixels); supports front/back/sleeve and custom sides.
- `product_designs` — saved customer designs; `layers` (JSON array), `styleOverrides` (JSON), UUID share key, soft-delete via `deletedAt`. Owned by a `storeCustomer` or a guest `sessionId`.
- `philaprints_design_assets` — per-website icon/art library; entries are either react-icons references (`type=icon`, `iconName`/`iconPack`) or hosted SVG/PNG assets (`type=art`, `imageUrl`).

**Cart & orders**
- `carts` / `cart_items` — `cartItems.designId` FK deferred at runtime (avoids circular ref).
- `orders` — full address snapshot, Stripe PaymentIntent + charge IDs, EasyPost shipment/label fields, Printful order ID, fulfillment status.
- `order_items` — `designSnapshot` (JSONB) freezes layer state at checkout so deleting the design does not break fulfillment.
- `order_status_history` — append-only audit trail.
- `discount_codes` — percent / fixed / free-shipping; `applicableTo` covers store and/or booking.

**Customer portal**
- `store_customers` + `store_customer_sessions` — standalone auth (bcrypt password, email verify, password-reset tokens); separate from NextAuth.
- `store_wishlists` / `store_wishlist_items`.
- `store_customer_messages` / `store_customer_message_replies` — support inbox.
- `store_product_reviews` — status `pending|approved|rejected`.

**Shipping**
- `shipping_zones` / `shipping_rates` — each rate is `manual` (fixed/weight/price-tier) or `easypost` (live-rate service filter). Mixed zones are supported.

**Webhook ingestion**
- `printful_events` — idempotent by `eventId` (unique index).
- `easypost_events` — idempotent by `eventId` (unique index).

## API surface

**Public (storefront consumer)**

`/api/storefront/[siteId]/` — no portal auth; authenticated via customer bearer token or guest session cookie.

| Route | Purpose |
|---|---|
| `products/`, `products/[slug]/` | Catalogue reads |
| `categories/` | Category tree |
| `cart/` | Cart CRUD |
| `checkout/` | Create Stripe PaymentIntent + order |
| `shipping/` | Rate quotes (manual or EasyPost live) |
| `discount/validate/` | Coupon check |
| `auth/` | Customer register/login/logout |
| `account/` | Profile, orders, wishlist, support |
| `orders/[orderNumber]/` | Guest order status lookup — verified by `email` query param; includes EasyPost tracking data |
| `products/[slug]/styles/` | Lists `product_styles` with nested `product_sides` for the designer canvas color/style picker |
| `designs/` + `designs/[designId]/` | Save/load/finalize designs; AI text/image generation; thumbnail generation |

**Portal management (tenant staff)**

`/api/portal/websites/[siteId]/store/` — NextAuth session required; `[siteId]` cross-checked against resolver.

Products, variants, options, bulk pricing, design surfaces, styles, categories, orders (status + notes + EasyPost label purchase + Printful submit), shipping zones/rates, discounts, analytics, settings, Stripe Connect onboarding + BYOK config, design-asset management.

Diagnostic / integration-test routes (operators use these to validate API keys after configuration):
- `store/stripe/test` — Stripe key connectivity test
- `store/easypost/test` — EasyPost key connectivity test

## MCP tools

Registered via `lib/mcp/tools/storefront.ts` → `lib/storefront/mcp-sdk-adapter.ts`.

Scopes: `store:read` / `store:write`.

**Read tools (`store:read`):** `store_products_list`, `store_products_get`, `store_categories_list`, `store_orders_list`, `store_orders_get`, `store_customers_list`, `store_customers_get`, `store_discounts_list`, `store_reviews_list`, `store_customer_messages_list`, `store_settings_get`.

**Write tools (`store:write`):** `store_products_create`, `store_products_update`, `store_products_delete`, `store_products_adjust_inventory`, `store_product_options_create`, `store_product_option_values_create`, `store_product_variants_create`, `store_product_variants_update`, `store_categories_create`, `store_orders_update_status`, `store_orders_add_note`, `store_discounts_create`, `store_discounts_toggle`, `store_discounts_delete`, `store_reviews_moderate`, `store_customer_messages_reply`.

All tools verify `websiteId` belongs to the authenticated client before querying.

## UI surfaces

**Portal (store owner)**

`app/portal/websites/[siteId]/store/` — wrapped by `layout.tsx` which injects `StoreSubNav` (persistent sub-navigation across all store pages, added in commit `3d38e73c`).

Pages: `page.tsx` (overview), `products/`, `products/[productId]/`, `products/[productId]/designer/`, `orders/`, `orders/[orderId]/`, `categories/`, `discounts/`, `shipping/`, `settings/` (god-file: ~1551 lines).

**Public storefront**

`app/sites/[domain]/` — domain-resolved public pages. Storefront-relevant sub-routes: `[[...slug]]` (block-rendered product/shop pages), `designer/[productSlug]/` (older designer using `DesignerClient` + `productDesignSurfaces`/`designs` tables), `design/[productSlug]/` (current designer using `ProductDesigner` + `productDesigner.ts` tables — `product_styles`/`product_sides`/`product_designs`), `account/` tree (login, register, profile, orders, wishlist, support, designs). Both designer routes are live; `design/` uses the newer `productDesigner.ts` schema.

## Tests & gates

Unit tests in `tests/unit/`:
- `tests/unit/storefront-mcp-sdk-adapter.test.ts` — full MCP tool registration + scope-filter assertions.
- `tests/unit/api-storefront-checkout-route.test.ts` — checkout input validation and cart resolution paths.
- `tests/unit/api-storefront-cart-route.test.ts` — cart API.
- `tests/unit/api-storefront-auth-route.test.ts` — customer auth routes.
- `tests/unit/api-storefront-ai-text-route.test.ts` — AI text tool on designs.
- `tests/unit/api-storefront-ai-image-route.test.ts` — AI image generation tool on designs.
- `tests/unit/api-storefront-designs-id-route.test.ts` — designs-by-ID route.
- `tests/unit/api-trigger-links-and-storefront-products-routes.test.ts` — products route.
- `tests/unit/lib-portal-and-storefront-auth.test.ts` — customer-auth helpers.
- `tests/unit/designer-canvas-store-coverage.test.ts` — designer canvas state (coverage variant).
- `tests/unit/lib-designer-canvas-store.test.ts` — designer canvas store helpers.
- `tests/unit/designer-canvas-store.test.ts` — designer canvas store core.

E2E specs in `tests/e2e/`:
- `tests/e2e/portal-ecommerce.spec.ts` (745 lines, `@ecommerce @critical`) — portal store CRUD: products, orders, categories, discounts, shipping, settings.
- `tests/e2e/portal-websites-store-mutations.spec.ts` — portal store mutation flows.
- `tests/e2e/product-designer-api.spec.ts` — product designer API integration.
- `tests/e2e/product-designer-ui.spec.ts` — product designer UI flows.
- `tests/e2e/qa-portal-c-store.spec.ts` — QA portal commerce scenarios.

Note: `portal-ecommerce.spec.ts` covers portal management, not the customer-facing add-to-cart → Stripe confirm flow. No dedicated E2E spec for the checkout golden path yet — noted as a coverage gap in `lib/magamommy/README.md`. Run `bun test:tenancy` after any data-access change (all tables are `websiteId`-scoped and must not leak across tenants).

## Cross-domain dependencies

- **[[Billing & Stripe]]** — `store_settings.stripeAccountId` / `stripeMode` links each storefront to either a Stripe Connect account (platform-managed) or a BYOK secret key. The ecommerce webhook `app/api/stripe/webhook/ecommerce/route.ts` triggers POD order submission after payment. Platform fee percent is stored on `store_settings.platformFeePercent`.
- **`lib/crypto/api-key.ts`** — AES-256-GCM encryption for `stripeSecretKeyEncrypted`, `stripeWebhookSecretEncrypted`, `easypostApiKeyEncrypted`, `printfulApiKeyEncrypted`. Never store these plaintext.
- **`lib/db/schema/sites.ts`** (`clientWebsites`, `clients`) — storefront tables FK to `clientWebsites.id`; tenancy is site-scoped not client-scoped.
- **`lib/db/schema/auth.ts`** (`users`) — `order_status_history.changedBy` FKs to the portal `users` table.
- **EasyPost** (`lib/shipping/providers/easypost.ts`) — fetch-based, no SDK; live rate quotes and label purchase wired per-order from the portal orders UI.
- **Printful** (`lib/fulfillment/providers/printful.ts`) — POD fulfillment; `printfulVariantId` on both `products` and `product_variants` maps to Printful's catalog.
- **S3 / `lib/printing/upscale.ts`** — design assets and print-ready renders stored in S3; upscale called before Printful submission.

## Invariants & gotchas

- **`lib/magamommy/` is a client-specific autonomous pipeline, not a shared utility.** It drives a single tenant site (`magamommy.simplerdevelopment.com`) that drops one politically-themed shirt every Monday via a Vercel cron (`app/api/cron/magamommy-weekly-drop/route.ts`, schedule `0 14 * * 1`). The pipeline (researcher → concept-writer → designer → publisher) writes to `lib/db/schema/magamommy.ts` tables (`magamommy_briefs`, `magamommy_concepts`, `magamommy_drops`) and then publishes into the standard `products` + `designs` tables. This is the one sanctioned exception to the "no client-specific code paths" rule: the pipeline is self-contained in `lib/magamommy/`, its tables are isolated in `lib/db/schema/magamommy.ts`, and it uses shared platform primitives (products, designs, store settings) as its output. Do not replicate this pattern for other clients — any future autonomous-shop need should be extracted into a generic plugin.
- **Blocks vs. store pages:** The "blocks are universal, never client-specific" rule applies to `lib/blocks/`. Store-rendering pages (`app/sites/[domain]/`) are *not* block-composed — they are purpose-built Next.js pages that call the storefront API. Product detail pages and the cart/checkout are standalone, not block types.
- **Stripe mode duality:** `store_settings.stripeMode` is `connect` (default, SD platform collects and disburses via Stripe Connect) or `byok` (tenant's own Stripe keys). BYOK is admin-gated (`stripeByokAllowed` flag). The BYOK secret key is AES-256-GCM encrypted in `stripeSecretKeyEncrypted`; never log or echo it.
- **Design snapshot at checkout:** `order_items.designSnapshot` (JSONB) freezes the full `layersBySurface` + `canvasSize` at checkout time. Deleting a design after purchase does not break fulfillment data — the snapshot is what gets sent to Printful.
- **Webhook idempotency:** Both `printful_events` and `easypost_events` have unique indexes on `eventId`. Duplicate webhook deliveries are silently no-op'd.
- **Magamommy schema migration is hand-applied:** `drizzle/0116_magamommy_autoshop.sql` — the platform's migration tracker is out of sync with disk in prod; standard `bun run db:migrate` against prod fails. See `lib/magamommy/README.md`.
- **No magamommy tests yet:** `lib/magamommy/README.md` explicitly notes zero unit/integration/E2E coverage for the autonomous pipeline. The gap is tracked there as a phase-2 item.

## Planning notes

- EasyPost and Printful integrations are complete but not yet covered by integration tests — add tenancy regression tests for both webhook ingestion tables.
- The checkout golden-path E2E (add-to-cart → checkout → Stripe confirm → order created) is missing from `tests/e2e/`. Candidate for `/e2e-writer`.
- Magamommy phase-2 items: Printful/Gelato wire-up for manual orders, hi-fi mockup photography, email-on-drop announcement, custom domain DNS, full-pipeline E2E with mocked AI providers.
- `store_settings.settings/page.tsx` is a 1551-line god-file — do not read into the main thread; spawn an `Explore` subagent.

## Related

- [[Billing & Stripe]] — Stripe Connect, BYOK, platform fees
- [[CMS & Blocks]] — block-rendered pages that surface store CTAs (blocks are universal; store pages are not block-composed)
- [[Visual Editor]] — portal product-designer page shares design-surface primitives with the block editor infrastructure
- `lib/magamommy/README.md` — full autonomous-shop runbook and tracing guide
