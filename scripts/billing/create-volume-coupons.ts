// Provision the à-la-carte volume-discount coupons in WHATEVER Stripe
// account/mode STRIPE_SECRET_KEY points at. One forever-duration percent_off
// coupon per VOLUME_TIERS entry, with a deterministic id (`volume-<percent>`)
// so the checkout / add-item routes can reference it without an env lookup.
//
// Idempotent — an existing coupon with the same id is left untouched (a
// percent_off mismatch is reported, since Stripe coupon discounts are
// immutable and would need a NEW id). Run once per environment:
//
//   npx tsx scripts/billing/create-volume-coupons.ts
//
// Live mode (prod key) and test mode (sk_test_ key) each get their own coupons.

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  const Stripe = (await import('stripe')).default;
  const { VOLUME_TIERS } = await import('../../lib/billing/domain-catalog');

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const mode = key.startsWith('sk_test_') ? 'TEST' : 'LIVE';
  const stripe = new Stripe(key);

  console.log(`Stripe mode: ${mode}\n`);

  for (const tier of VOLUME_TIERS) {
    const id = `volume-${tier.percentOff}`;
    const name = `Volume discount — ${tier.percentOff}% off (${tier.minModules}+ modules)`;

    let existing: Awaited<ReturnType<typeof stripe.coupons.retrieve>> | null = null;
    try {
      existing = await stripe.coupons.retrieve(id);
    } catch (err) {
      if (!(err instanceof Stripe.errors.StripeError && err.code === 'resource_missing')) throw err;
    }

    if (existing) {
      const ok = existing.percent_off === tier.percentOff && existing.duration === 'forever';
      console.log(
        `• ${id}: already exists (${existing.percent_off}% off, ${existing.duration})${ok ? '' : '  ⚠ MISMATCH vs catalog — mint a new id to change it'}`,
      );
      continue;
    }

    const created = await stripe.coupons.create({
      id,
      name,
      percent_off: tier.percentOff,
      duration: 'forever',
      metadata: { kind: 'volume_discount', minModules: String(tier.minModules) },
    });
    console.log(`✓ ${created.id}: created (${created.percent_off}% off, forever)`);
  }

  console.log('\nDone. Volume-discount coupons are ready.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
