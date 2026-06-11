/**
 * Wire a recommendation engine into the cardiff-business-apply survey.
 *
 * Two offerings:
 *   - "approved"  — pre-qualified, specialist follow-up
 *   - "declined"  — not a fit right now
 *
 * Three vote questions (annual_revenue, time_in_business, credit_score) +
 * two hard overrides (us_citizen=No → declined; bank account=No → declined).
 *
 * Three is intentional: odd number eliminates 2-2 ties. avg_bank_balance is
 * NOT a vote (deliberately — some strong businesses keep low cash for tax
 * reasons and shouldn't be auto-declined for it).
 *
 * Applied to BOTH local-dryrun AND metro so re-migrations don't diverge.
 *
 * Idempotent — overwrites recommendation config in place.
 *
 * Run:  npx tsx scripts/migrations/cardiff/_add-survey-recommendation.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { readFileSync } from 'fs';
import postgres from 'postgres';

const SLUG = 'cardiff-business-apply';
const LOCAL_URL = 'postgresql://127.0.0.1/simplerdev_realprod_dryrun';

function metroUrl(): string {
  const env = readFileSync('.env.local', 'utf8');
  const line = env.split('\n').find((l) => /@metro\.proxy\.rlwy\.net/.test(l));
  if (!line) throw new Error('metro URL not found in .env.local');
  return line.replace(/^# */, '').split(' ')[0].replace(/^DATABASE_URL=/, '');
}

const recommendation = {
  offerings: [
    {
      key: 'approved',
      name: "You're pre-qualified!",
      tagline:
        "A Cardiff funding specialist will reach out within one business day to walk through your funding options.",
      youGet: [
        '✓ A personalized funding offer matched to your revenue',
        '✓ Decisions in as little as 24 hours',
        '✓ Funds in your account in 1–3 business days',
      ].join('\n'),
      price: '',
      duration: '24 hours',
    },
    {
      key: 'declined',
      name: 'Not the right fit right now',
      tagline:
        "Based on your responses, we can't extend a funding offer at this time — but here are next steps to qualify down the road.",
      youGet: [
        "✓ A free copy of Cardiff's How to Qualify guide",
        '✓ A specialist will reach out with concrete steps to improve qualification',
        "✓ Re-apply anytime — we'll save your information for 12 months",
      ].join('\n'),
      price: '',
      duration: '—',
    },
  ],
  // Three vote questions — each maps each answer text → the offering it votes
  // for. Three (odd) prevents 2-2 ties. The vote tally + first-match-wins on
  // ties means a clean 3-0 sweep flags "high confidence", a 2-1 still picks a
  // primary (no secondary card shown unless not a clean sweep).
  questions: [
    {
      fieldId: 'annual_revenue',
      optionToOffering: {
        'Less than $100K': 'declined',
        '$100K–$250K': 'approved',
        '$250K–$500K': 'approved',
        '$500K–$1M': 'approved',
        '$1M–$5M': 'approved',
        '$5M+': 'approved',
      },
      context: {
        'Less than $100K': 'your revenue is currently below our standard minimum',
        '$100K–$250K': 'your revenue meets our funding criteria',
        '$250K–$500K': 'your revenue is a strong match',
        '$500K–$1M': 'your revenue is a strong match',
        '$1M–$5M': 'your revenue is an excellent match',
        '$5M+': 'your revenue is an excellent match',
      },
    },
    {
      fieldId: 'time_in_business',
      optionToOffering: {
        'Less than 1 year': 'declined',
        '1–2 years': 'approved',
        '2–5 years': 'approved',
        '5–10 years': 'approved',
        '10+ years': 'approved',
      },
      context: {
        'Less than 1 year': "your business hasn't yet hit our minimum operating history",
        '1–2 years': 'you have an established operating history',
        '2–5 years': 'you have a solid operating history',
        '5–10 years': 'you have an excellent operating history',
        '10+ years': 'you have a long-established operating history',
      },
    },
    {
      fieldId: 'credit_score',
      optionToOffering: {
        'Excellent (720+)': 'approved',
        'Good (680–719)': 'approved',
        'Fair (620–679)': 'approved',
        'Poor (Below 620)': 'declined',
        'Not sure': 'approved',
      },
      context: {
        'Excellent (720+)': 'your credit profile is excellent',
        'Good (680–719)': 'your credit profile is strong',
        'Fair (620–679)': 'your credit profile works for our flexible products',
        'Poor (Below 620)': 'your credit profile is below our standard threshold',
        'Not sure': "we'll work through your credit together",
      },
    },
  ],
  // Hard overrides — any match forces "declined" regardless of vote tally.
  // First match wins (only one path here, but the order is the array order).
  overrides: [
    {
      whenAnyAnswer: [{ fieldId: 'us_citizen', values: ['No'] }],
      forceOfferingKey: 'declined',
    },
    {
      whenAnyAnswer: [{ fieldId: 'has_business_bank_account', values: ['No'] }],
      forceOfferingKey: 'declined',
    },
  ],
  bookUrl: '/contact-us',
  eyebrow: 'Your pre-qualification result',
  narrativeTemplate:
    'Based on what you shared — {{time_in_businessContext}}, {{annual_revenueContext}}, and {{credit_scoreContext}} — **{{primary}}**.',
};

async function applyOne(url: string, label: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    const [row] = await sql<Array<{ id: number; slug: string }>>`
      SELECT id, slug FROM surveys WHERE slug = ${SLUG}
    `;
    if (!row) {
      console.log(`[${label}] no survey '${SLUG}' — skipping`);
      return;
    }
    await sql`
      UPDATE surveys
         SET recommendation = ${recommendation as object}::json,
             updated_at = now()
       WHERE id = ${row.id}
    `;
    console.log(`[${label}] recommendation engine applied to survey id=${row.id}`);
  } finally {
    await sql.end();
  }
}

async function main() {
  await applyOne(LOCAL_URL, 'local-dryrun');
  await applyOne(metroUrl(), 'metro');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
