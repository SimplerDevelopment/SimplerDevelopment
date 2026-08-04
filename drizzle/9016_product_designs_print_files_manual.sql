-- Print-ready render URLs for saved product designs, keyed by side.
--
-- Idempotent and re-runnable: the statement is guarded, so applying this to a
-- database that already has the column is a no-op. Additive only (ADD COLUMN),
-- so the "Prod schema sync (additive)" workflow can apply it on merge to main
-- without a hand-run against metro.
--
-- Shape: { "front": "https://…/print-12-front.png", "back": "…" }
--
-- These are artwork-only, transparent, print-resolution PNGs written by
-- POST /api/storefront/[siteId]/designs/[designId]/print-file, read at checkout
-- into order_items.print_ready_url, and submitted to Printful from there.
--
-- They are deliberately NOT thumbnail_url and NOT a composite mockup. A mockup
-- is artwork stamped onto a blank product photo (lib/printing/composite.ts);
-- sending one to Printful prints a picture of the garment onto the garment.
-- lib/fulfillment/pod.ts now refuses to submit an item without a real print file.

ALTER TABLE product_designs
  ADD COLUMN IF NOT EXISTS print_files jsonb DEFAULT '{}'::jsonb;
