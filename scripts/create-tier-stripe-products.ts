// Create (or reuse) the Stripe Product + monthly recurring Price for each
// pricing TIER (Starter / Growth / Scale). One tier = one product = one price;
// the app subscribes to that single price and grants the tier's whole domain
// set via getClientEntitlements (entitlements.ts), so tiers do NOT need a price
// per module.
//
// Idempotent: keyed on a per-tier price `lookup_key` (e.g. 'plan-growth-monthly').
// Re-running reuses the existing price instead of minting a duplicate.
//
// After running, paste the printed stripeProductId / stripePriceId into the
// matching TIERS entry in lib/billing/domain-catalog.ts, then run
// scripts/seed-tiers.ts to attach them to the plan-* service rows.
//
// Run: STRIPE_SECRET_KEY=sk_test_... tsx scripts/create-tier-stripe-products.ts

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('STRIPE_SECRET_KEY is not set — cannot create Stripe products.');
    console.error('Run with: STRIPE_SECRET_KEY=sk_test_... tsx scripts/create-tier-stripe-products.ts');
    process.exit(1);
  }
  if (stripeKey.startsWith('sk_live_')) {
    console.error('Refusing to run against a LIVE Stripe key. Use a test key (sk_test_...).');
    process.exit(1);
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(stripeKey);
  const { TIERS } = await import('../lib/billing/domain-catalog');

  const results: { slug: string; productId: string; priceId: string }[] = [];

  for (const tier of TIERS) {
    const lookupKey = `${tier.slug}-monthly`;

    // Reuse an existing price by lookup_key if present.
    const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1, expand: ['data.product'] });
    if (existing.data.length > 0) {
      const price = existing.data[0];
      const productId = typeof price.product === 'string' ? price.product : price.product.id;
      console.log(`  =  ${tier.slug}: reused price ${price.id} (product ${productId})`);
      results.push({ slug: tier.slug, productId, priceId: price.id });
      continue;
    }

    const product = await stripe.products.create({
      name: `SimplerDevelopment — ${tier.name}`,
      description: tier.tagline,
      metadata: { tier: tier.key, slug: tier.slug, kind: 'plan_tier' },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: tier.monthlyPriceCents,
      currency: 'usd',
      recurring: { interval: 'month' },
      lookup_key: lookupKey,
      nickname: `${tier.name} (monthly)`,
      metadata: { tier: tier.key, slug: tier.slug },
    });

    console.log(`  +  ${tier.slug}: created price ${price.id} (product ${product.id}) — $${(tier.monthlyPriceCents / 100).toFixed(0)}/mo`);
    results.push({ slug: tier.slug, productId: product.id, priceId: price.id });
  }

  console.log('\n── Paste these into the matching TIERS entries in lib/billing/domain-catalog.ts ──\n');
  for (const r of results) {
    console.log(`  // ${r.slug}`);
    console.log(`  stripeProductId: '${r.productId}',`);
    console.log(`  stripePriceId: '${r.priceId}',\n`);
  }
  console.log('Then run:  tsx scripts/seed-tiers.ts');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
