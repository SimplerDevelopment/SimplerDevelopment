// Seed the per-domain module SKUs + the Everything bundle into the `services`
// catalog, from lib/billing/domain-catalog.ts. Idempotent: existing slugs are
// skipped (price/feature edits after first seed happen in the admin UI /
// Stripe, not by re-running this).
//
// Run: tsx scripts/seed-domain-modules.ts

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function seedDomainModules() {
  const { db } = await import('../lib/db');
  const { services } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { FEATURE_DOMAINS, BUNDLE, sumOfModulePricesCents } = await import('../lib/billing/domain-catalog');

  let inserted = 0;
  let skipped = 0;
  let backfilled = 0;

  // Existing rows keep their (possibly admin-edited) price/features, but a
  // null stripePriceId is backfilled from the catalog so checkout works on
  // DBs seeded before the Stripe products existed.
  async function backfillStripeIds(rowId: number, slug: string, productId?: string, priceId?: string) {
    if (!priceId) return false;
    const [row] = await db.select({ stripePriceId: services.stripePriceId }).from(services).where(eq(services.id, rowId)).limit(1);
    if (row?.stripePriceId) return false;
    await db.update(services)
      .set({ stripePriceId: priceId, stripeProductId: productId ?? null, updatedAt: new Date() })
      .where(eq(services.id, rowId));
    console.log(`  ~     ${slug} backfilled stripePriceId=${priceId}`);
    return true;
  }

  for (const domain of FEATURE_DOMAINS) {
    const [existing] = await db.select({ id: services.id }).from(services).where(eq(services.slug, domain.slug)).limit(1);
    if (existing) {
      const updated = await backfillStripeIds(existing.id, domain.slug, domain.stripeProductId, domain.stripePriceId);
      if (updated) backfilled += 1;
      else console.log(`  skip  ${domain.slug} (already present, id=${existing.id})`);
      skipped += 1;
      continue;
    }
    await db.insert(services).values({
      slug: domain.slug,
      name: domain.name,
      description: domain.tagline,
      category: domain.key, // hasServiceAccess / entitlements key on category
      price: domain.monthlyPriceCents,
      billingCycle: 'monthly',
      features: domain.features,
      includedAiCredits: domain.includedAiCredits,
      usageLimits: Object.fromEntries(domain.meters.map((m) => [m.resource, m.includedPerMonth])),
      stripeProductId: domain.stripeProductId ?? null,
      stripePriceId: domain.stripePriceId ?? null,
      active: true,
    });
    inserted += 1;
    console.log(`  +     ${domain.slug} ($${(domain.monthlyPriceCents / 100).toFixed(2)}/mo)`);
  }

  const [existingBundle] = await db.select({ id: services.id }).from(services).where(eq(services.slug, BUNDLE.slug)).limit(1);
  if (existingBundle) {
    const updated = await backfillStripeIds(existingBundle.id, BUNDLE.slug, BUNDLE.stripeProductId, BUNDLE.stripePriceId);
    if (updated) backfilled += 1;
    else console.log(`  skip  ${BUNDLE.slug} (already present, id=${existingBundle.id})`);
    skipped += 1;
  } else {
    await db.insert(services).values({
      slug: BUNDLE.slug,
      name: BUNDLE.name,
      description: BUNDLE.tagline,
      category: 'bundle',
      price: BUNDLE.monthlyPriceCents,
      billingCycle: 'monthly',
      features: [
        `Every module included (worth $${(sumOfModulePricesCents() / 100).toFixed(0)}/mo separately)`,
        '2M pooled AI tokens monthly',
        'Higher included usage on every meter',
        'Priority support',
      ],
      includedAiCredits: BUNDLE.includedAiCredits,
      usageLimits: Object.fromEntries(
        FEATURE_DOMAINS.flatMap((d) => d.meters.filter((m) => m.bundleIncludedPerMonth > 0))
          .map((m) => [m.resource, m.bundleIncludedPerMonth]),
      ),
      stripeProductId: BUNDLE.stripeProductId ?? null,
      stripePriceId: BUNDLE.stripePriceId ?? null,
      active: true,
    });
    inserted += 1;
    console.log(`  +     ${BUNDLE.slug} ($${(BUNDLE.monthlyPriceCents / 100).toFixed(2)}/mo)`);
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}, backfilled ${backfilled} Stripe IDs.`);
  process.exit(0);
}

seedDomainModules().catch((err) => {
  console.error('Failed to seed domain modules:', err);
  process.exit(1);
});
