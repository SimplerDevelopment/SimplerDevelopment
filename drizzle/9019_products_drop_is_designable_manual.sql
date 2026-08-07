-- Collapse the two designable flags on products into one.
--
-- `products.designable` gates the Print Designer (the customer-facing route and
-- the storefront designs API). `products.is_designable` gated the legacy
-- designer, which was retired in 9018. Keeping both meant a product could be
-- flagged in the portal and invisible on the storefront — that split-brain cost
-- a live debugging session before it was understood.
--
-- NOT additive — the "Prod schema sync (additive)" workflow cannot DROP a
-- column. Hand-apply to metro at release.
--
-- Re-runnable: the backfill is idempotent and the drop is guarded by
-- IF EXISTS, so applying twice is a no-op.
--
-- ORDER MATTERS. The backfill runs FIRST: any product flagged only the old way
-- would otherwise silently stop being designable the moment the column goes.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_designable'
  ) THEN
    -- Carry the old flag forward. OR, never overwrite: a product already
    -- marked designable must stay designable.
    UPDATE products
       SET designable = true
     WHERE is_designable = true
       AND designable = false;

    RAISE NOTICE 'backfilled designable from is_designable; dropping the old column';
    ALTER TABLE products DROP COLUMN is_designable;
  ELSE
    RAISE NOTICE 'products.is_designable already absent — nothing to do';
  END IF;
END$$;
