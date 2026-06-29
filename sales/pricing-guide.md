---
type: sales-collateral
audience: buyer, procurement, sales-ae
status: internal-draft
date: 2026-06-27
sources: FEATURE-INVENTORY-domains.md (Billing & Stripe domain)
note: No dollar amounts are stated here. All figures are "configurable / see current pricing." This document describes the pricing MODEL only.
---

# Pricing Guide — Model Overview

> Internal draft. This document describes the pricing **structure and model** only. No specific prices, rates, or thresholds are listed — those are configurable per go-to-market and are available in the current pricing sheet. Do not add invented figures to this document.

---

## Model Summary

SimplerDevelopment uses a **modular subscription model** with four pricing dimensions that compose independently: à-la-carte module subscriptions, volume discounts, per-seat charges, and AI credits. An all-in-one bundle option is also available.

---

## Dimension 1 — À-la-Carte Module Subscriptions

The platform is divided into independently purchasable modules. Buyers activate only the capabilities they need. The portal plans/pricing page presents **12 module cards** covering the platform's major product domains:

| Module area | What it covers |
|---|---|
| Sites & Publishing | Website management, custom domains, block CMS, publishing workflows |
| CRM | Contacts, companies, deals, proposals, e-signed contracts |
| Company Brain (AI) | Per-tenant AI knowledge base, RAG search, decisions, playbooks |
| Projects & Kanban | Sprint boards, tickets, time logging, reports |
| Email & Campaigns | Subscriber lists, campaign builder, analytics, automations |
| Storefront & Commerce | Products, orders, Stripe checkout, shipping, discount codes |
| Bookings & Services | Scheduling pages, calendar sync, Stripe payments |
| Surveys | Multi-page forms, branching logic, CRM routing |
| Pitch Decks | AI-authored slide decks, public viewer, HTML import |
| Automations | Event-driven rules, visual workflow builder |
| Agency White-Label | Custom portal domain, branding overrides (Scale tier) |
| Plugins & Extensions | Plugin federation, browser extension |

Specific per-module pricing is configurable and available in the current pricing sheet.

---

## Dimension 2 — Volume Discounts

A volume-discount strip is displayed on the plans/pricing page. Buyers who activate multiple modules or reach usage thresholds are eligible for reduced rates. Volume discounts are applied automatically at checkout and reflected in the subscription line items. Specific discount tiers and thresholds are configurable; see the current pricing sheet.

---

## Dimension 3 — Per-Seat Pricing

A separate seat line item governs the number of users with portal access. Seats are metered and billed as a standalone subscription product, separate from module subscriptions. The seat product requires one-time setup in the billing configuration per environment.

**Roles and seat counting:** Portal users hold `admin` or `editor` sub-roles within a tenant. Both count as seats unless otherwise configured. Staff (`admin`/`employee` global roles) do not count against tenant seat allocations.

---

## Dimension 4 — AI Credits

AI features (Company Brain, portal chatbot, meeting processing, email AI) consume **AI credits** tracked in a per-tenant ledger. Credits can be:

- **Granted** by the platform (for example, on plan activation or as a promotional grant)
- **Purchased** by the tenant on demand
- Viewed via a **real-time balance** and **transaction ledger** in the portal billing settings, and accessible via MCP tools (`ai_credits_balance`, `ai_credits_ledger`)

Credit consumption is metered per AI call. A monthly credit re-grant cron is on the roadmap (not yet active in production); current grants are manual or purchase-initiated.

### Bring Your Own Key (BYOK)

Tenants who supply their own Anthropic or OpenAI API keys are not charged AI credits for usage routed through their own keys. BYOK keys are encrypted at rest (AES-256-GCM) and managed from `/portal/settings/ai`. The platform's AI plan gate enforces that starter-tier tenants without BYOK receive a 402/403 before consuming platform credits.

---

## Dimension 5 — All-In-One Bundle

A bundle upsell option is available on the plans/pricing page, consolidating all module subscriptions at a single rate. This is intended for buyers who want the full platform without à-la-carte selection. Bundle pricing is configurable; see the current pricing sheet.

---

## Billing Infrastructure

- **Payment processor:** Stripe Checkout + webhooks. Tenants are billed via Stripe-managed subscriptions.
- **Invoice access:** Tenants can view and download invoices from `/portal/invoices/`. The `invoices_list` and `invoices_get` MCP tools expose invoice data to automation clients.
- **Usage metering:** Subscription usage is metered and rolled up for billing. Usage alerts and threshold notifications are part of the billing domain.
- **Admin overrides:** Platform staff can apply billing overrides, adjust plans, and manage credits from the admin panel (`app/admin/clients/[id]/plan/`, `app/admin/ai-credits/`).

---

## Pricing Roadmap Notes

The following billing features are in progress and not yet active in production:

- **Monthly credit re-grant cron** — automated re-grant on billing cycle is a roadmap item; grants are currently manual or purchase-triggered.
- **Seat product provisioning** — requires a one-time per-environment script (`scripts/billing/create-seat-product.ts`) before seat billing can go live. This is a go-live dependency.

---

## For Current Pricing

Dollar amounts, specific tier thresholds, volume discount tables, and seat rates are intentionally omitted from this document. Refer to the current pricing sheet or contact the sales team.
