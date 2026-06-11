// Ensure the module/bundle Products + monthly Prices exist in WHATEVER Stripe
// account/mode STRIPE_SECRET_KEY points at, and write the resulting IDs onto
// the matching `services` rows in DATABASE_URL's database. Idempotent —
// products are matched by metadata.moduleSlug, prices by (recurring monthly,
// unit_amount). Run once per environment:
//
//   npx tsx scripts/billing/sync-stripe-products.ts
//
// This is the canonical provisioning path: live mode (prod DB) and test mode
// (local/staging DBs with sk_test_ keys) each get their own IDs. The IDs
// hardcoded in lib/billing/domain-catalog.ts are the live-mode set, used as
// seed defaults only.

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  const Stripe = (await import('stripe')).default;
  const { db } = await import('../../lib/db');
  const { services } = await import('../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { FEATURE_DOMAINS, BUNDLE } = await import('../../lib/billing/domain-catalog');

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const mode = key.startsWith('sk_test_') ? 'TEST' : 'LIVE';
  const stripe = new Stripe(key);

  console.log(`Stripe mode: ${mode}`);

  const entries = [
    ...FEATURE_DOMAINS.map((d) => ({
      slug: d.slug,
      name: d.name,
      description: d.tagline,
      priceCents: d.monthlyPriceCents,
    })),
    {
      slug: BUNDLE.slug,
      name: BUNDLE.name,
      description: BUNDLE.tagline,
      priceCents: BUNDLE.monthlyPriceCents,
    },
  ];

  for (const entry of entries) {
    // 1. Product — match by metadata.moduleSlug.
    const found = await stripe.products.search({
      query: `metadata['moduleSlug']:'${entry.slug}' AND active:'true'`,
    });
    let product = found.data[0];
    if (!product) {
      product = await stripe.products.create({
        name: entry.name,
        description: entry.description,
        metadata: { moduleSlug: entry.slug },
      });
      console.log(`  + product ${entry.slug} → ${product.id}`);
    }

    // 2. Monthly recurring price at the catalog amount.
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 20 });
    let price = prices.data.find(
      (p) => p.recurring?.interval === 'month' && p.unit_amount === entry.priceCents && p.currency === 'usd',
    );
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: entry.priceCents,
        recurring: { interval: 'month' },
      });
      console.log(`  + price   ${entry.slug} → ${price.id} ($${(entry.priceCents / 100).toFixed(2)}/mo)`);
    }

    // 3. Write IDs onto the services row.
    const updated = await db
      .update(services)
      .set({ stripeProductId: product.id, stripePriceId: price.id, updatedAt: new Date() })
      .where(eq(services.slug, entry.slug))
      .returning({ id: services.id });
    console.log(`  ✓ ${entry.slug.padEnd(26)} ${price.id}${updated.length ? '' : '  (no services row — run seed-domain-modules first)'}`);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('sync-stripe-products failed:', err);
  process.exit(1);
});
