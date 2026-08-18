---
type: spec
domain: storefront
status: proposed
date: 2026-06-22
sources:
  - lib/db/schema/store.ts
  - lib/automation/engine.ts
  - lib/automation/event-bus.ts
  - app/api/storefront/[siteId]/checkout/route.ts
  - app/api/storefront/[siteId]/cart/route.ts
  - app/api/stripe/webhook/ecommerce/route.ts
  - lib/stripe/site-stripe.ts
  - app/api/cron/process-scheduled-automations/route.ts
---

# Feature: Storefront Conversion — Abandoned-Cart Recovery + Auto Tax

## Overview

Two conversion improvements: (1) detect carts left with items but no completed order and enroll them in a triggered recovery email sequence; (2) replace the flat global `taxRate` with per-address jurisdiction tax at checkout (Stripe Tax or a jurisdiction table).

## Domain context

Read first: [[Storefront Commerce E2E Audit]]. `carts` (`lib/db/schema/store.ts` ~line 243): `status` ('active'|'converted'), `customerEmail`, `sessionId`, `customerId`, unused `expiresAt` — **no 'abandoned' status**. `cartItems`: cartId/productId/variantId/quantity/unitPrice. Tax today (`checkout/route.ts` ~307): `taxableAmount * parseFloat(store.taxRate)` — single flat `store_settings.taxRate` + `taxInclusive`. `orders.taxTotal` (cents) exists; `order_items` has no per-line tax. Automation engine via `emitEvent(name, clientId, userId, payload)`; `'order.paid'` is emitted in the ecommerce webhook; **`'order.placed'` is declared in `AUTOMATION_EVENTS` but never emitted** (latent). Scheduled rules: `process-scheduled-automations` (per-minute, CAS-claimed). Actions dispatch via `executePortalTool`.

## Problem

1. Carts that stall before payment are invisible — no detection, recovery email, or re-engagement.
2. Tax is a single flat manual rate — wrong/zero tax across jurisdictions, compliance risk.

## Goal

- Detect abandoned carts (items, no paid order, N hours elapsed) → recovery email sequence with a one-click cart-restore link.
- Compute tax from ship-to/bill-to jurisdiction at checkout, stored on the order, shown in the cart.

## Design

### Abandoned-cart recovery

`carts` migration: extend `status` to include `'abandoned'`; add `recoveryToken` varchar(100) unique, `recoveryTokenExpiresAt` timestamp, `recoveryEmailSentAt` timestamp.

New cron `app/api/cron/cart-abandonment/route.ts` (every 30 min; cron auth like the others): `status='active' AND updated_at < now()-1h AND customer_email IS NOT NULL`, has ≥1 `cart_items`, no paid `orders` for that website+email after `updated_at` → set `status='abandoned'`, mint `recoveryToken` (+7d TTL), `emitEvent('cart.abandoned', websiteId, 0, {cartId, customerEmail, recoveryToken, itemCount, cartValue})`. Register `'cart.abandoned'` in `event-bus.ts`.

Recovery route `app/api/storefront/[siteId]/cart/recover/route.ts` (GET `?token=`): cart by token WHERE abandoned + not expired → `status='active'`, clear token, redirect to cart `?recovered=1`.

Automation: `'cart.abandoned'` is a new triggerable event; ship a default rule for enabled stores (immediate `send_email` + 24h follow-up), template vars `{{event.customerEmail}}`/`{{event.recoveryToken}}`/`{{event.cartValue}}`, recovery URL `https://<storeDomain>/cart/recover?token={{event.recoveryToken}}`.

### Auto jurisdiction tax

Add `store_settings.taxMode` varchar(20) default 'flat' ('flat'|'stripe_tax'|'table'). **Stripe Tax path:** checkout PaymentIntent passes `automatic_tax:{enabled:true}` + `customer_details.address` from shipping/billing; finalize `orders.taxTotal` from the `payment_intent.succeeded` webhook (Stripe Tax authoritative only post-success). **Table fallback:** new `store_tax_rates` (websiteId, country, state, rate, active) queried by state→country→`store_settings.taxRate` fallback; extend the shipping-estimate route to return estimated tax for the cart preview. `orders.taxTotal` unchanged (cents).

## Phasing

- **Phase 1 (local)** — carts abandonment schema + register `'cart.abandoned'` + cron + recovery route + **fix the missing `emitEvent('order.placed')`** in checkout (same PR).
- **Phase 2 (local, depends on P1)** — default recovery email template + the default rule (immediate + 24h) + cart `?recovered=1` banner + abandoned-cart dashboard widget.
- **Phase 3 (external: Stripe Tax registration)** — `taxMode` + `store_tax_rates` + checkout branch (Stripe Tax via webhook / table query) + shipping-estimate tax + tax settings UI (gated behind tenant Stripe Tax onboarding).

## Key decisions (ADR-style)

- **Cron detection** (not the `payment_intent.canceled` webhook) — covers guest carts that never reached a PaymentIntent.
- **Token-in-URL recovery** (single-use, 7d TTL) — guest carts have no account.
- **Stripe Tax primary, jurisdiction table fallback** (no new vendor; TaxJar/Avalara out of scope).
- **Finalize tax from the webhook** for Stripe Tax (post-success authoritative; the order row is already created there).

## Open questions

1. Make the 1h abandonment window per-store configurable, or fixed for v1?
2. Stripe Tax requires per-jurisdiction registration in the tenant's Stripe dashboard — link-out + status, or in-app wizard?
3. Seed a US state rate table for `'table'` mode, or fully manual?
4. Meter recovery emails against the Resend quota, or treat as transactional/unmetered?
5. `order.placed` emit timing — at order-row creation vs payment confirmation? (Changes behavior for any existing `order.placed` rule.)

## Verification plan

- Unit: abandonment logic (carts with paid orders not flagged; no-email guests skipped; token minted once/idempotent); tax branches (flat = current; stripe_tax sets flag; table = state→country→fallback).
- Integration (tenancy): abandonment query + recovery-token lookup scoped to the right `websiteId`.
- E2E `@critical`: add cart → abandon (time mock) → recovery email → click link → cart restored → checkout → `orders.taxTotal` correct.
- Manual: enable Stripe Tax on a test account, US-address checkout, confirm `taxTotal` matches Stripe's automatic_tax line.
