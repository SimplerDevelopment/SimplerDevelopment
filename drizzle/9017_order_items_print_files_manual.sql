-- Per-side print-ready renders on an order item.
--
-- Idempotent and re-runnable: the statement is guarded, so applying this to a
-- database that already has the column is a no-op. Additive only (ADD COLUMN),
-- so the "Prod schema sync (additive)" workflow can apply it on merge to main
-- without a hand-run against metro.
--
-- Shape: { "front": "https://…/design-12-front.png", "back": "…" }
--
-- order_items.print_ready_url stays as the front-side shorthand so existing
-- readers keep working; this map is what lib/fulfillment/pod.ts expands into one
-- Printful file per placement. Both are frozen at checkout from
-- product_designs.print_files, so editing or deleting a design after purchase
-- cannot change what actually gets printed.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS print_files jsonb DEFAULT '{}'::jsonb;
