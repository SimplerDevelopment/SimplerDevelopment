-- QAD / POD: map each colourway to its Printful catalogue variant.
--
-- Printful models colour as a distinct variant — "Black / L" and "White / L"
-- are different variant IDs of the same catalogue product — so the mapping
-- belongs on product_styles, not on products. products.printful_variant_id
-- stays as the fallback for non-designable items with a single variant.
--
-- Additive and idempotent: the "Prod schema sync (additive)" workflow applies
-- this automatically on merge to main. Nothing reads the column until a style
-- is mapped, so it is safe to apply before or after the deploy.
--
-- Written by hand rather than generated because `drizzle-kit generate` needs an
-- interactive TTY to resolve its rename-vs-new-column prompt, which is not
-- available here. This matches how 9016-9020 shipped.

ALTER TABLE "product_styles"
  ADD COLUMN IF NOT EXISTS "printful_variant_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'product_styles'
       AND column_name = 'printful_variant_id'
  ) THEN
    RAISE EXCEPTION 'product_styles.printful_variant_id was not created';
  END IF;
  RAISE NOTICE 'product_styles.printful_variant_id present';
END$$;
