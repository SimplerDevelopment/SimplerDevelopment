-- Retire the legacy storefront designer's tables.
--
-- The cart, orders, and fulfilment all moved onto `product_designs` (see vault
-- ADR consolidate-on-product-designs-via-uuid), and every route/component that
-- read these tables was deleted in the same change. What remains is dead
-- storage.
--
-- NOT additive — the "Prod schema sync (additive)" workflow cannot apply a DROP.
-- This must be hand-applied to metro at release, AFTER confirming the guard
-- below reports zero rows.
--
-- SELF-GUARDING and re-runnable: the drop only happens when `designs` is empty.
-- On a database that still holds legacy designs this is a no-op that raises a
-- NOTICE telling you how many rows are in the way, so applying it early cannot
-- destroy customer artwork. Re-running after the table is gone is also a no-op.
--
-- Check before applying:
--   SELECT count(*) FROM designs;              -- expect 0
--   SELECT count(*) FROM order_items WHERE design_id IS NOT NULL;
--
-- Note: order_items.design_id / cart_items.design_id are NOT dropped. They now
-- hold product_designs.uuid and are still live. Only the legacy tables go.

DO $$
DECLARE
  legacy_count bigint;
BEGIN
  IF to_regclass('public.designs') IS NULL THEN
    RAISE NOTICE 'designs table already absent — nothing to drop';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM designs' INTO legacy_count;

  IF legacy_count > 0 THEN
    RAISE NOTICE 'designs still holds % row(s) — refusing to drop. Migrate or archive them first.', legacy_count;
    RETURN;
  END IF;

  -- design_assets FKs to designs, so it goes first.
  DROP TABLE IF EXISTS design_assets;
  DROP TABLE IF EXISTS designs;
  DROP TABLE IF EXISTS product_design_surfaces;

  RAISE NOTICE 'legacy designer tables dropped';
END$$;
