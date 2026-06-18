// Provision the single "Additional seats" Stripe Product the per-seat line item
// is priced against. The seat AMOUNT is dynamic per account (min(M, $30)), so the
// Price is created inline via price_data at billing time — only the Product is
// stable, and it's matched by metadata.kind = 'platform_seat' so this is
// idempotent. Run once per Stripe environment:
//
//   npx tsx scripts/billing/create-seat-product.ts
//
// Then paste the printed product id into SEAT_SKU.stripeProductId in
// lib/billing/domain-catalog.ts. Until that id is set, the seat line is omitted
// (modules still bill correctly) — so seats simply don't charge until provisioned.

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  const Stripe = (await import('stripe')).default;
  const { SEAT_SKU } = await import('../../lib/billing/domain-catalog');

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const mode = key.startsWith('sk_test_') ? 'TEST' : 'LIVE';
  const stripe = new Stripe(key);

  console.log(`Stripe mode: ${mode}\n`);

  // Idempotent: reuse an existing seat product if one is already tagged.
  const search = await stripe.products.search({
    query: "metadata['kind']:'platform_seat'",
    limit: 1,
  });
  const existing = search.data[0];
  if (existing) {
    console.log(`• Seat product already exists: ${existing.id}`);
    console.log(`\nSet SEAT_SKU.stripeProductId = '${existing.id}' in lib/billing/domain-catalog.ts`);
    return;
  }

  const product = await stripe.products.create({
    name: SEAT_SKU.name,
    metadata: { kind: 'platform_seat', slug: SEAT_SKU.slug },
  });
  console.log(`✓ Created seat product: ${product.id}`);
  console.log(`\nSet SEAT_SKU.stripeProductId = '${product.id}' in lib/billing/domain-catalog.ts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
