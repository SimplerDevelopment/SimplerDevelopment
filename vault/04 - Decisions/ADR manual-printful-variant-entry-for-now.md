---
type: adr
domain: storefront
status: accepted
date: 2026-08-05
sources:
  - lib/fulfillment/matchPrintfulVariants.ts — normalizeColor, matchVariants
  - lib/fulfillment/providers/printful.ts — provider surface (no catalog call)
  - lib/fulfillment/pod.ts — submitPODOrder throws without printfulVariantId
  - components/portal/store/PrintfulFulfillmentPanel.tsx — the Print tab
  - app/portal/websites/[siteId]/store/products/[productId]/page.tsx — variants table
---

# ADR: Printful variant IDs stay hand-entered — make the gap loud instead of guessing

## Status

Accepted 2026-08-05 (PODR-006). Shipped in `a5e337b2e`. The matcher it defers to
shipped in `753fca649`.

## Context

`products.printfulVariantId` and `product_variants.printfulVariantId` are the join
to Printful's catalog. `submitPODOrder` throws without one — and it throws at
**fulfilment** time, long after the customer has paid.

`lib/fulfillment/providers/printful.ts` exposes `estimateShipping`, `createOrder`,
`getOrder`, `cancelOrder` and `parseWebhook`. There is no catalog listing, so every
ID is typed in by hand. That is fine for five products and unworkable for fifty —
the Gildan Softstyle tee alone opts in with 303 variants (62 colourways × 9 sizes).

The card offered two routes: add a catalog-browse call plus a portal picker, or
accept manual entry and make the field impossible to miss.

## Decision

**Take manual entry now; make the missing ID loud.** The Print tab counts active
variants with no ID, the per-variant input borders amber when empty, and a link
points at Printful's Catalog API reference — the portal previously had no Printful
link anywhere.

The automated path is *not* abandoned. `matchPrintfulVariants.ts` already exists
and is unit-tested: it expands the abbreviations the InkSoft import produces
(`Hthr Irish Grn` → `Heather Irish Green`), reconciles `2XL`/`XXL`/`2X`, and
**refuses ambiguous matches rather than guessing**, because a wrong ID prints the
wrong garment.

## Why not build the catalog sync now

Writing `listCatalogVariants()` means committing to Printful's v2 response envelope
with no way to exercise it — v1 wraps results in `result`, v2 in `data`, and the
existing provider uses the `result` shape against v2 paths. Untestable code against
a guessed contract fails on first real use, which is precisely when a real store is
being onboarded. It is blocked on a live API key, not on effort.

## Consequences

- Onboarding a large POD catalog is still manual. Acceptable at current scale;
  revisit before a 50+ product store.
- A forgotten ID now surfaces in the editor instead of at fulfilment. It is still
  possible to save a product with unmapped variants — the panel warns, it does not
  block. Blocking would strand merchants who legitimately sell non-POD variants.
- When the key arrives, the review UI for unmatched variants builds on this panel;
  the matcher supplies the pairing and the panel already renders the "unmapped"
  state.

## Related

- [[ADR print-file-is-artwork-not-mockup]] — the other half of a fulfillable order
- [[Storefront & Commerce]]
