// Seed the three pricing-tier rows in the `services` catalog. Idempotent: if
// a row with the slug already exists we skip (we do NOT update price /
// usageLimits — those are touched explicitly in the admin UI when product
// changes).
//
// Run: tsx scripts/seed-pricing-tiers.ts
//
// Tiers reflect the pivot away from per-service AI credit metering toward
// BYOK + bundled monthly subscription. The `usageLimits` JSON encodes the
// soft caps a tier promises (sites, seats, contacts, brain GB, automations
// per month). The pricing-byok-foundation brief deliberately leaves the
// runtime enforcement of these caps out of scope — they are advertised here
// so the admin plan-picker UI can render them.

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

interface TierDef {
  slug: string;
  name: string;
  price: number; // cents
  description: string;
  features: string[];
  usageLimits: Record<string, number | string>;
}

const TIERS: TierDef[] = [
  {
    slug: 'tier-starter',
    name: 'Starter',
    price: 9_900,
    description: 'Single site, small team, BYOK AI. The on-ramp tier.',
    features: [
      '1 client website',
      '2 portal seats',
      '1,000 CRM contacts',
      'Bring-your-own AI key (Anthropic / OpenAI)',
      'Up to 5 active automations',
      'Email community support',
    ],
    usageLimits: {
      sites: 1,
      seats: 2,
      contacts: 1_000,
      brainGb: 1,
      automations: 5,
      tier: 'starter',
    },
  },
  {
    slug: 'tier-growth',
    name: 'Growth',
    price: 29_900,
    description: 'Growing studios — multi-site, larger team, brain RAG, more automation headroom.',
    features: [
      '5 client websites',
      '10 portal seats',
      '10,000 CRM contacts',
      'Bring-your-own AI key (Anthropic / OpenAI)',
      'Up to 25 active automations',
      '5 GB Company Brain storage',
      'Priority email support',
    ],
    usageLimits: {
      sites: 5,
      seats: 10,
      contacts: 10_000,
      brainGb: 5,
      automations: 25,
      tier: 'growth',
    },
  },
  {
    slug: 'tier-scale',
    name: 'Scale',
    price: 59_900,
    description: 'Agencies running many client sites with deep brain + automation needs.',
    features: [
      '20 client websites',
      'Unlimited portal seats (fair-use)',
      '100,000 CRM contacts',
      'Bring-your-own AI key (Anthropic / OpenAI)',
      'Unlimited active automations (fair-use)',
      '25 GB Company Brain storage',
      'Slack-shared support channel',
    ],
    usageLimits: {
      sites: 20,
      seats: 9_999, // sentinel — UI renders as "Unlimited"
      contacts: 100_000,
      brainGb: 25,
      automations: 9_999,
      tier: 'scale',
    },
  },
];

async function seedPricingTiers() {
  const { db } = await import('../lib/db');
  const { services } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  let inserted = 0;
  let skipped = 0;

  for (const tier of TIERS) {
    const [existing] = await db.select({ id: services.id }).from(services).where(eq(services.slug, tier.slug)).limit(1);
    if (existing) {
      console.log(`  skip  ${tier.slug} (already present, id=${existing.id})`);
      skipped += 1;
      continue;
    }
    await db.insert(services).values({
      slug: tier.slug,
      name: tier.name,
      description: tier.description,
      category: 'subscription',
      price: tier.price,
      billingCycle: 'monthly',
      features: tier.features,
      usageLimits: tier.usageLimits as Record<string, number>, // numeric subset stored; tier label is informational
      includedAiCredits: 0, // BYOK tiers do not bundle credits
      active: true,
    });
    inserted += 1;
    console.log(`  +     ${tier.slug} ($${(tier.price / 100).toFixed(2)}/mo)`);
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}.`);
  process.exit(0);
}

seedPricingTiers().catch((err) => {
  console.error('Failed to seed pricing tiers:', err);
  process.exit(1);
});
