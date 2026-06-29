// Seed the three pricing TIERS (Starter / Growth / Scale) into the `services`
// catalog from lib/billing/domain-catalog.ts. A tier is a single Stripe
// Product/Price represented as a service row whose `category` equals the tier
// slug (e.g. 'plan-growth') — that is the contract getClientEntitlements()
// keys on (entitlements.ts) to grant the tier's whole domain set + BYOK.
//
// Idempotent: existing tier slugs are skipped, but a NULL stripePriceId is
// backfilled from the catalog so checkout starts working the moment the Stripe
// prices exist (run scripts/create-tier-stripe-products.ts first to mint them
// and paste the IDs into TIERS in domain-catalog.ts).
//
// Run: tsx scripts/seed-tiers.ts   (DATABASE_URL must point at the target DB)

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function seedTiers() {
  const { db } = await import('../lib/db');
  const { services } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { TIERS } = await import('../lib/billing/domain-catalog');

  let inserted = 0;
  let skipped = 0;
  let backfilled = 0;

  for (const tier of TIERS) {
    const [existing] = await db
      .select({ id: services.id, stripePriceId: services.stripePriceId })
      .from(services)
      .where(eq(services.slug, tier.slug))
      .limit(1);

    if (existing) {
      // Backfill a missing Stripe price id from the catalog (e.g. the row was
      // seeded before the Stripe products were created).
      if (!existing.stripePriceId && tier.stripePriceId) {
        await db
          .update(services)
          .set({
            stripePriceId: tier.stripePriceId,
            stripeProductId: tier.stripeProductId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(services.id, existing.id));
        console.log(`  ~     ${tier.slug} backfilled stripePriceId=${tier.stripePriceId}`);
        backfilled += 1;
      } else {
        console.log(`  skip  ${tier.slug} (already present, id=${existing.id})`);
      }
      skipped += 1;
      continue;
    }

    await db.insert(services).values({
      slug: tier.slug,
      name: tier.name,
      description: tier.tagline,
      // category === slug is the entitlements contract (getTierByCategory).
      category: tier.slug,
      price: tier.monthlyPriceCents,
      billingCycle: 'monthly',
      features: tier.features,
      includedAiCredits: tier.includedAiCredits,
      stripeProductId: tier.stripeProductId ?? null,
      stripePriceId: tier.stripePriceId ?? null,
      active: true,
    });
    inserted += 1;
    const priced = tier.stripePriceId ? '' : '  (no Stripe price yet — checkout disabled until minted)';
    console.log(`  +     ${tier.slug} ($${(tier.monthlyPriceCents / 100).toFixed(2)}/mo)${priced}`);
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}, backfilled ${backfilled} Stripe IDs.`);
  process.exit(0);
}

seedTiers().catch((err) => {
  console.error(err);
  process.exit(1);
});
