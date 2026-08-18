---
type: adr
domain: storefront
status: accepted
date: 2026-08-04
sources:
  - drizzle/9019_products_drop_is_designable_manual.sql
  - lib/db/schema/store.ts — products.designable
  - app/sites/[domain]/design/[productSlug]/page.tsx
  - app/portal/websites/[siteId]/store/products/[productId]/designer/page.tsx
---

# ADR: Collapse the two `designable` flags on products into one

## Status

Accepted 2026-08-04, shipped in `b3b1430b4` with migration `9019`. Recorded
2026-08-05 — the reasoning existed only in commit history until the Storefront
domain map was migrated and this turned out to have no home.

## Context

`products` carried two live boolean flags, read by different code paths:

- `designable` — gated the Print Designer: the customer-facing
  `/design/[productSlug]` route and the storefront designs API. This is what
  `lib/catalog/opt-in.ts` set.
- `is_designable` — gated the legacy Fabric designer and the portal product API.

Neither was authoritative. A product flagged in the portal was invisible to the
customer-facing designer, and vice versa. That split-brain cost a live
debugging session: the designer 404'd for a product whose `is_designable` was
`true`, because the page checks the other column. Four overlapping controls in
the portal UI could set one, the other, or neither.

## Decision

Keep **`designable`** and drop `is_designable`.

`designable` won because it is the column the customer-facing path already
used — the one whose value a shopper can actually observe. Migrating the
customer path to follow the portal's column would have meant changing observable
behaviour to preserve an internal flag, which is backwards.

Migration `9019` backfills **before** dropping:

```sql
UPDATE products SET designable = true
 WHERE is_designable = true AND designable = false;
```

Order is load-bearing. Dropping first would silently un-designate every product
flagged only the old way. The whole statement is guarded by an
`information_schema` check so a re-run is a no-op.

## Consequences

- Not additive — the prod schema-sync workflow cannot drop a column, so `9019`
  is hand-applied to metro at release, alongside `9018`.
- The public API contract changed: `docs/api/commerce.md` and
  `public/openapi.yaml` advertised both fields and now advertise one. That was
  missed at the time and fixed a day later in `1ff352aa0` — the published
  schema promised a field the API had stopped returning.
- One redirect comment was left mangled by the same commit (a sentence had its
  middle deleted). Fixed 2026-08-05. Worth noting as a pattern: a mechanical
  removal pass can corrupt prose, and nothing in the toolchain checks comment
  grammar.

## Related

- [[ADR consolidate-on-product-designs-via-uuid]]
- [[ADR code-is-the-source-of-truth]]
