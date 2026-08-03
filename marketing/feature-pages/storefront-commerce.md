---
phase: 8
feature: Storefront & Commerce
slug: /features/storefront-commerce
status: spec-draft
date: 2026-06-27
sources:
  - vault/05 - Feature Specs/FEATURE-INVENTORY-domains.md (domain 9)
  - docs/agents/ai-overview.md
  - docs/agents/glossary.md
---

# Storefront & Commerce — Marketing Spec

## Hero

**Headline:** White-label e-commerce on every client website — products, checkout, orders, and fulfillment from one portal.

**Subhead:** Each tenant website gets a Stripe-connected storefront: product catalogue, variants, discount codes, customer accounts, product reviews, and EasyPost live shipping labels.

---

## Problem

Agencies that add e-commerce to client sites typically bolt on a separate platform — a different login, different analytics, and a brand experience that doesn't match the rest of the site. Keeping a third-party store in sync with the client's website design, navigation, and content requires ongoing manual effort across two systems.

When clients need to fulfill an order, generate a shipping label, or respond to a customer question, they leave the portal and work in a separate tool — breaking the agency's single-pane-of-glass promise.

---

## Solution

SimplerDevelopment bakes a complete storefront into every client website. Product pages, cart, and Stripe checkout run on the same domain as the rest of the site, sharing the same branding and navigation structure. The portal gives the merchant a product manager, order tracker, discount engine, and customer messaging inbox — all without leaving the platform.

EasyPost generates live shipping labels at fulfillment time. Printful handles print-on-demand fulfillment for eligible products. Stripe connects via the client's own keys or a platform-managed account. Every store management action is also available through 25+ MCP tools for AI-driven automation.

---

## Key Benefits

- **Stripe checkout on the client's own domain** — customers never leave the site; cart and payment run natively with BYOK Stripe keys or platform-managed credentials.
- **Product variants and inventory** — each product supports multiple option types (size, color, material) with per-variant pricing and stock tracking.
- **Discount codes** with toggle-on/off control, customer-facing cart application, and a discount manager in the portal.
- **EasyPost live shipping labels** generated at order fulfillment; shipping zones and rates configured per store.
- **Printful print-on-demand fulfillment** for products that are printed and shipped by a third party — configure per product in store settings.
- **Customer accounts, wishlists, reviews, and order history** on the public-facing site; moderation and customer messages managed from the portal.

---

## How It Works

1. **Configure the store:** Connect Stripe (or use your own keys), set up shipping zones and rates, and enable EasyPost or Printful in store settings from the portal.
2. **Add products:** Create products with variants, pricing, inventory counts, categories, and images from the portal or via the `store_products_*` MCP tools. Product pages publish to the client's public site automatically.
3. **Customers shop:** Visitors browse product pages, add to cart, and complete Stripe checkout — all on the client's domain. Order confirmation and customer account management are included.
4. **Fulfill orders:** Update order status, generate EasyPost shipping labels, message customers, and review and moderate product reviews from the orders screen in the portal.

---

## FAQs

**Q: Does checkout happen on the client's domain or a third-party page?**
Checkout runs on the client's own domain using Stripe's embedded payment flow — customers complete their purchase without being redirected away from the site.

**Q: Can I sell products with multiple options like size and color?**
Yes. Products support multiple option types (e.g. size, color, material) with per-option-value variants. Each variant can have its own price and inventory count.

**Q: How does print-on-demand fulfillment work?**
Connect a Printful account in store settings. When an order is placed for a Printful-enabled product, the order is forwarded to Printful for production and direct shipment to the customer.

**Q: How do I generate shipping labels for orders I fulfill myself?**
EasyPost integration generates live shipping labels from the order detail screen in the portal. Shipping zones and rates are configured per store.

**Q: Can an AI agent manage store products and orders?**
Yes. 25+ MCP tools cover products, product options, product variants, inventory, categories, orders, customers, discounts, reviews, customer messages, and store settings.

---

## SEO Block

| Field | Value |
|---|---|
| **Page title** | White-Label E-Commerce for Agency Clients \| SimplerDevelopment |
| **Meta description** | Full storefront per client website — Stripe checkout on your domain, product variants, discount codes, EasyPost shipping, Printful fulfillment, and 25+ AI tools. |
| **URL slug** | /features/storefront-commerce |
| **Primary keyword** | white-label e-commerce for agencies |
| **Secondary keywords** | agency client storefront, Stripe embedded checkout, per-tenant online store, EasyPost shipping labels, Printful integration e-commerce |

---

## Structured Data

Apply both types to this page:

**SoftwareApplication**
- `name`: "SimplerDevelopment – Storefront & Commerce"
- `applicationCategory`: "BusinessApplication"
- `featureList`: ["Stripe checkout on client's own domain", "Product variants with per-variant pricing and inventory", "Discount codes", "EasyPost live shipping label generation", "Printful print-on-demand fulfillment", "Customer accounts, wishlists, and reviews", "25+ MCP tools for AI agents"]
- `operatingSystem`: "Web"

**FAQPage**
- Wrap each FAQ Q&A pair in `mainEntity` → `Question` / `acceptedAnswer` → `Answer`.

---

## Internal Links

- [AI overview — integrations (Stripe, EasyPost, Printful)](../../docs/agents/ai-overview.md)
- [Glossary: Site](../../docs/agents/glossary.md#site)
- [Glossary: BYOK](../../docs/agents/glossary.md#byok-bring-your-own-key)
- Sibling feature pages: [Sites, CMS & Visual Editor](./websites-cms-visual-editor.md) · [CRM](./crm.md) · [Company Brain](./company-brain.md)

---

## Media Requirements

Capture these assets in Phase 5/6:

| Asset | Screen / Workflow | Notes |
|---|---|---|
| Screenshot | Product list in portal — showing variant indicator and inventory count column | At least 6 products visible |
| Screenshot | Product detail/settings — options and variant matrix visible | Show at least two option types (e.g. size + color) |
| Screenshot | Order list with status column, customer name, and fulfillment action button | |
| Screenshot | Order detail — EasyPost "Generate shipping label" action visible | |
| Screenshot | Discount codes manager — list of codes with toggle switches | |
| Screenshot | Public-facing product page on a client site — product images, variants picker, and add-to-cart | Use example.com domain; no real brand |
| GIF | Adding a product with two variants and publishing it to the storefront | ~8 seconds; show the variant matrix being filled in |

---

## CTA

**Primary:** "Add a storefront to your client site" → `[portal URL]/websites`

**Secondary:** "See all Commerce tools" → `[docs URL]/agents/tool-reference.md` (filter to `store_*`)

---

## Capability Scope Note (internal)

The print-on-demand product designer canvas (Fabric.js, routes `/designer/` and `/design/`) exists in the codebase but has an explicitly open fate decision (invest / defer / cut). It is **not marketed** in this spec. If the fate decision resolves as "ship," this spec needs a "Product Customization" key benefit and FAQ added in a follow-up edit.
