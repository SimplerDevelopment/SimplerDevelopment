/**
 * Add kids' sizes to an existing Magamommy product.
 *
 * Appends new option values (2T, 4T, 6, 8, 10, 12) to the product's "Size"
 * option, then generates new productVariants for each kids-size × existing-
 * color combination at a kids-friendly price ($22 vs the adult $29).
 *
 * Idempotent — skips option values + variants that already exist.
 *
 *   bun scripts/magamommy/add-kids-sizes.ts                    # defaults to product 66
 *   bun scripts/magamommy/add-kids-sizes.ts --product-id=66
 *   bun scripts/magamommy/add-kids-sizes.ts --product-id=66 --price=2000
 *
 * After running, the product detail page's Size selector will show adult
 * sizes (S–XXL) and kids sizes (2T–12) in the same picker. The variant
 * matrix expands from 15 → 33 rows.
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const KIDS_SIZES = ['2T', '4T', '6', '8', '10', '12'] as const;
const KIDS_PRICE_DEFAULT = 2200; // cents — $22
const KIDS_QTY_PER_VARIANT = 12; // start with a small stock per kids variant

interface Args {
  productId: number;
  price: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const hit = argv.find((a) => a.startsWith(`--${k}=`));
    return hit?.slice(`--${k}=`.length);
  };
  return {
    productId: Number(get('product-id') ?? 66),
    price: Number(get('price') ?? KIDS_PRICE_DEFAULT),
  };
}

function skuCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function main() {
  const args = parseArgs();
  if (!Number.isInteger(args.productId) || args.productId <= 0) {
    throw new Error(`Invalid --product-id: ${args.productId}`);
  }
  console.log(`[add-kids-sizes] productId=${args.productId} price=${args.price}c`);

  const { db } = await import('../../lib/db');
  const {
    productOptions,
    productOptionValues,
    productVariants,
  } = await import('../../lib/db/schema/store');
  const { and, eq, asc, inArray } = await import('drizzle-orm');

  // ── Resolve the product's options ────────────────────────────────────────
  const opts = await db
    .select({ id: productOptions.id, name: productOptions.name })
    .from(productOptions)
    .where(eq(productOptions.productId, args.productId))
    .orderBy(asc(productOptions.order));
  if (opts.length === 0) {
    throw new Error(`No options found on product ${args.productId} — bootstrap or publisher hasn't run yet?`);
  }
  const sizeOpt = opts.find((o) => /^size$/i.test(o.name));
  const colorOpt = opts.find((o) => /^colou?r$/i.test(o.name));
  if (!sizeOpt || !colorOpt) {
    throw new Error(
      `Product ${args.productId} missing Size or Color option — got [${opts.map((o) => o.name).join(', ')}]`,
    );
  }

  // ── Resolve existing color values ────────────────────────────────────────
  const colors = await db
    .select({ id: productOptionValues.id, value: productOptionValues.value })
    .from(productOptionValues)
    .where(eq(productOptionValues.optionId, colorOpt.id))
    .orderBy(asc(productOptionValues.order));
  console.log(`[add-kids-sizes] product has ${colors.length} colors: ${colors.map((c) => c.value).join(', ')}`);

  // ── Find existing kids size values; insert the missing ones ──────────────
  const existingSizes = await db
    .select({ id: productOptionValues.id, value: productOptionValues.value, order: productOptionValues.order })
    .from(productOptionValues)
    .where(eq(productOptionValues.optionId, sizeOpt.id));
  const existingByValue = new Map(existingSizes.map((s) => [s.value, s]));
  const adultCount = existingSizes.length;

  const kidsSizeRows: Array<{ value: string; id: number }> = [];
  for (let i = 0; i < KIDS_SIZES.length; i += 1) {
    const v = KIDS_SIZES[i];
    if (existingByValue.has(v)) {
      const e = existingByValue.get(v)!;
      kidsSizeRows.push({ value: v, id: e.id });
      console.log(`  size ${v.padEnd(3)} skipping (already exists) id=${e.id}`);
      continue;
    }
    const [row] = await db
      .insert(productOptionValues)
      .values({
        optionId: sizeOpt.id,
        value: v,
        label: `${v} (Kids)`,
        order: adultCount + i,
      })
      .returning({ id: productOptionValues.id });
    kidsSizeRows.push({ value: v, id: row.id });
    console.log(`  size ${v.padEnd(3)} created id=${row.id}`);
  }

  // ── Find existing variants so we don't double-insert ─────────────────────
  const existingVariants = await db
    .select({ optionValues: productVariants.optionValues })
    .from(productVariants)
    .where(eq(productVariants.productId, args.productId));
  const existingKey = new Set(
    existingVariants.map((v) =>
      JSON.stringify(
        ((v.optionValues ?? []) as Array<{ optionId: number; valueId: number }>)
          .map((x) => [x.optionId, x.valueId])
          .sort(),
      ),
    ),
  );

  // ── Insert missing kids variants ─────────────────────────────────────────
  let inserted = 0;
  for (const size of kidsSizeRows) {
    for (const color of colors) {
      const key = JSON.stringify(
        [[sizeOpt.id, size.id], [colorOpt.id, color.id]].sort(),
      );
      if (existingKey.has(key)) {
        continue;
      }
      await db.insert(productVariants).values({
        productId: args.productId,
        name: `Kids ${size.value} / ${color.value}`,
        sku: `MAGM-KIDS-${skuCode(size.value)}-${skuCode(color.value)}`,
        price: args.price,
        compareAtPrice: Math.round(args.price * 1.2),
        quantity: KIDS_QTY_PER_VARIANT,
        weight: '150', // kids tees are lighter
        optionValues: [
          { optionId: sizeOpt.id, valueId: size.id },
          { optionId: colorOpt.id, valueId: color.id },
        ],
        active: true,
      });
      inserted += 1;
    }
  }
  console.log(`[add-kids-sizes] inserted ${inserted} kids variant(s) at $${(args.price / 100).toFixed(2)} each`);
  console.log('\n✓ Product now has both adult and kids sizes available.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[add-kids-sizes] FAILED:', err);
  process.exit(1);
});
