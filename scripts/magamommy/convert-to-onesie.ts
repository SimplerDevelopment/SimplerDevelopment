/**
 * Convert an adult/kids t-shirt product into a baby onesie:
 *   - rename + update description to onesie language
 *   - delete all existing variants (adult + kids sizes)
 *   - delete the existing Size option values
 *   - insert onesie sizes (NB / 3M / 6M / 12M / 18M / 24M) as new size values
 *   - re-generate the variant matrix (sizes × existing colors) at $24
 *
 * NOTE: This is destructive on the variants table for the target product.
 * Any pending carts referencing the old variants will need replanning. Safe
 * for the local dryrun DB; double-check before running against staging/prod.
 *
 *   bun scripts/magamommy/convert-to-onesie.ts                       # defaults to product 66
 *   bun scripts/magamommy/convert-to-onesie.ts --product-id=66
 *   bun scripts/magamommy/convert-to-onesie.ts --product-id=66 --price=2400
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const ONESIE_SIZES = ['NB', '3M', '6M', '12M', '18M', '24M'] as const;
const ONESIE_PRICE_DEFAULT = 2400; // $24
const ONESIE_QTY_PER_VARIANT = 10;

interface Args {
  productId: number;
  price: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(`--${k}=`.length);
  return {
    productId: Number(get('product-id') ?? 66),
    price: Number(get('price') ?? ONESIE_PRICE_DEFAULT),
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
  console.log(`[convert-to-onesie] productId=${args.productId} price=${args.price}c`);

  const { db } = await import('../../lib/db');
  const {
    products,
    productOptions,
    productOptionValues,
    productVariants,
  } = await import('../../lib/db/schema/store');
  const { and, eq, asc, inArray } = await import('drizzle-orm');

  // ── Resolve options ──────────────────────────────────────────────────────
  const opts = await db
    .select({ id: productOptions.id, name: productOptions.name })
    .from(productOptions)
    .where(eq(productOptions.productId, args.productId));
  const sizeOpt = opts.find((o) => /^size$/i.test(o.name));
  const colorOpt = opts.find((o) => /^colou?r$/i.test(o.name));
  if (!sizeOpt || !colorOpt) {
    throw new Error(`Product ${args.productId} missing Size or Color option.`);
  }

  // ── Delete every existing variant on this product ───────────────────────
  const deletedVariants = await db
    .delete(productVariants)
    .where(eq(productVariants.productId, args.productId))
    .returning({ id: productVariants.id });
  console.log(`[convert-to-onesie] deleted ${deletedVariants.length} existing variants`);

  // ── Delete every existing size value ────────────────────────────────────
  const deletedSizes = await db
    .delete(productOptionValues)
    .where(eq(productOptionValues.optionId, sizeOpt.id))
    .returning({ id: productOptionValues.id });
  console.log(`[convert-to-onesie] deleted ${deletedSizes.length} existing size values`);

  // ── Insert onesie size values ───────────────────────────────────────────
  const newSizeRows: Array<{ value: string; id: number }> = [];
  for (let i = 0; i < ONESIE_SIZES.length; i += 1) {
    const v = ONESIE_SIZES[i];
    const [row] = await db
      .insert(productOptionValues)
      .values({
        optionId: sizeOpt.id,
        value: v,
        label: `${v} (Onesie)`,
        order: i,
      })
      .returning({ id: productOptionValues.id });
    newSizeRows.push({ value: v, id: row.id });
    console.log(`  size ${v.padEnd(3)} created id=${row.id}`);
  }

  // ── Load existing colors ────────────────────────────────────────────────
  const colors = await db
    .select({ id: productOptionValues.id, value: productOptionValues.value })
    .from(productOptionValues)
    .where(eq(productOptionValues.optionId, colorOpt.id))
    .orderBy(asc(productOptionValues.order));

  // ── Insert onesie variants ──────────────────────────────────────────────
  let inserted = 0;
  for (const size of newSizeRows) {
    for (const color of colors) {
      await db.insert(productVariants).values({
        productId: args.productId,
        name: `${size.value} / ${color.value}`,
        sku: `MAGM-ONESIE-${skuCode(size.value)}-${skuCode(color.value)}`,
        price: args.price,
        compareAtPrice: Math.round(args.price * 1.2),
        quantity: ONESIE_QTY_PER_VARIANT,
        weight: '90', // onesies are very light
        optionValues: [
          { optionId: sizeOpt.id, valueId: size.id },
          { optionId: colorOpt.id, valueId: color.id },
        ],
        active: true,
      });
      inserted += 1;
    }
  }
  console.log(`[convert-to-onesie] inserted ${inserted} onesie variant(s) at $${(args.price / 100).toFixed(2)} each`);

  // ── Update the product's name + description + price + weight ────────────
  await db
    .update(products)
    .set({
      // Keep the slogan clean — the "Baby Onesie" descriptor lives in tags +
      // shortDescription so it doesn't bloat the hero headline.
      // (Cleaned 2026-05-20.)
      shortDescription: 'A bedtime onesie for the next generation of MAGA mommies. 100% cotton, snap closure.',
      description:
        'A bedtime onesie for the next generation of MAGA mommies. 100% combed-ring-spun cotton, side-snap closure for easy changes, printed in Pennsylvania.\n\nMatching adult tees coming back soon — this run is onesies only.',
      price: args.price,
      compareAtPrice: Math.round(args.price * 1.2),
      weight: '90',
      // Reset stock so it reflects the new variant count
      quantity: ONESIE_QTY_PER_VARIANT * newSizeRows.length * colors.length,
      tags: ['baby', 'onesie', 'maga-mommy-classic'],
      updatedAt: new Date(),
    })
    .where(eq(products.id, args.productId));
  console.log(`[convert-to-onesie] renamed product ${args.productId} → "Make Bedtime Great Again. (Baby Onesie)"`);

  console.log('\n✓ Product is now a baby onesie.');
  console.log('  Next: run scripts/magamommy/regenerate-lifestyle-hero.ts --product-id=' + args.productId);
  console.log('  to swap the woman-in-shirt photo for a baby-in-onesie photo (after updating');
  console.log('  the lifestyle-photo prompt in lib/magamommy/agents/designer.ts).');
  process.exit(0);
}

main().catch((err) => {
  console.error('[convert-to-onesie] FAILED:', err);
  process.exit(1);
});
