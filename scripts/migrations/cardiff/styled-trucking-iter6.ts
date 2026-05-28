/**
 * Iter 6 — post 817 (Industries · Trucking). After iters 1-5 (hero, stats,
 * loan-products grid, customer testimonials, "why choose Cardiff" 4-up band)
 * the page closes straight into the final CTA with no FAQ. Sibling Cardiff
 * vertical pages (SBA Loans, Equipment Leasing, Learn) all carry a styled
 * accordion FAQ above the close — its absence here is the single biggest
 * remaining visual + content gap.
 *
 * This inserts a new html-render block id `trucking-faq-acc` immediately
 * before `final-cta`. Same visual chrome as the SBA FAQ (iter4): light-blue
 * band, white card details, blue Raleway title, orange +/- chevron, data-
 * repeat="items" so an editor can manage Q&A inline.
 *
 * FAQ copy is trucking-specific (loan types, qualification, fuel/repair,
 * seasonality, owner-operator vs fleet, funding speed) — derived from the
 * existing styled loan-products section + Cardiff's general trucking FAQ
 * tone.
 *
 * Idempotent: re-running replaces an existing `trucking-faq-acc` in place;
 * otherwise splices it in just before `final-cta`.
 *
 * Brand palette: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798. Raleway
 * + Open Sans.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const FAQ_ID = 'trucking-faq-acc';
const INSERT_BEFORE_ID = 'final-cta';

const FAQ_HTML = `
<style>
  .cd-trk-faq { background: #eef3f8; padding: 80px 24px 88px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-trk-faq__head { max-width: 880px; margin: 0 auto 36px auto; text-align: center; }
  .cd-trk-faq__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.25rem; font-weight: 800; color: #1c3370; letter-spacing: -0.015em; line-height: 1.18; margin: 0 0 14px 0; }
  .cd-trk-faq__rule { width: 56px; height: 3px; background: #ef6632; margin: 0 auto; border-radius: 2px; }
  .cd-trk-faq__inner { max-width: 880px; margin: 32px auto 0 auto; display: flex; flex-direction: column; gap: 14px; }
  .cd-trk-faq__item { background: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(28,51,112,0.08); border: 1px solid #e8edf6; overflow: hidden; transition: box-shadow 0.2s ease; }
  .cd-trk-faq__item[open] { box-shadow: 0 4px 14px rgba(28,51,112,0.12); }
  .cd-trk-faq__item > summary { list-style: none; cursor: pointer; padding: 22px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; font-weight: 700; color: #25418b; letter-spacing: -0.005em; line-height: 1.35; }
  .cd-trk-faq__item > summary::-webkit-details-marker { display: none; }
  .cd-trk-faq__item > summary::after { content: '+'; font-size: 1.6rem; font-weight: 400; color: #ef6632; line-height: 1; flex-shrink: 0; transition: transform 0.2s ease; }
  .cd-trk-faq__item[open] > summary::after { content: '–'; }
  .cd-trk-faq__item[open] > summary { border-bottom: 1px solid #e6ecf3; }
  .cd-trk-faq__a { padding: 18px 28px 24px 28px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 600px) {
    .cd-trk-faq { padding: 56px 16px 64px 16px; }
    .cd-trk-faq__title { font-size: 1.65rem; }
    .cd-trk-faq__item > summary { padding: 18px 20px; font-size: 0.95rem; }
    .cd-trk-faq__a { padding: 16px 20px 20px 20px; }
  }
</style>
<section class="cd-trk-faq">
  <div class="cd-trk-faq__head">
    <h2 class="cd-trk-faq__title">Trucking Loan FAQs</h2>
    <div class="cd-trk-faq__rule"></div>
  </div>
  <div class="cd-trk-faq__inner">
    <details class="cd-trk-faq__item" data-repeat="items">
      <summary data-field="question">{{items.question}}</summary>
      <p class="cd-trk-faq__a" data-field="answer">{{items.answer}}</p>
    </details>
  </div>
</section>
`.trim();

const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
  {
    question: 'What types of loans are available for trucking businesses?',
    answer:
      'Cardiff offers short-term loans for rapid growth and cash flow, business lines of credit for recurring or seasonal needs, equipment financing for new trucks and trailer repairs, and SBA loans for owners who want longer repayment terms.',
  },
  {
    question: 'How fast can I get funded for my trucking company?',
    answer:
      'Most qualified trucking applicants receive a decision in minutes and can have funds deposited the same day. We built our underwriting around the realities of owner-operators and fleets so you can keep wheels turning instead of waiting on a bank.',
  },
  {
    question: 'Do I need perfect credit to qualify?',
    answer:
      'No. We look at the overall health of your trucking business — revenue, time in business, and operating history — not just your credit score. Many of our funded customers were turned down elsewhere because of credit alone.',
  },
  {
    question: 'Can I use a Cardiff loan for fuel, repairs, or maintenance?',
    answer:
      'Yes. Working capital from a short-term loan or line of credit can be used for fuel, repairs, maintenance, insurance premiums, payroll, or any other operating expense your trucking business runs into.',
  },
  {
    question: 'Will a Cardiff loan finance a new truck or trailer?',
    answer:
      'Yes. Our equipment-friendly financing is designed to help you expand your fleet, replace an aging tractor, or finance a trailer without tying up all of your working capital. Terms are matched to the useful life of the equipment.',
  },
  {
    question: 'How does seasonal trucking revenue affect repayment?',
    answer:
      'We offer repayment plans that adapt to revenue patterns common in trucking — slower winter months, surges during peak freight season, and uneven receivables from brokers. Talk to a specialist about a structure that fits your route mix.',
  },
  {
    question: 'Is collateral required?',
    answer:
      'For loans up to $250,000, Cardiff offers unsecured financing for qualified trucking businesses — no collateral and no requirement to pledge a truck. Larger or longer-term products may have different requirements; a specialist can walk you through them.',
  },
  {
    question: 'How do I apply?',
    answer:
      'Submitting an application takes only a few minutes online. Once submitted, a Cardiff specialist will reach out to confirm details and present the financing options that fit your trucking business best.',
  },
];

const faqBlock = {
  id: FAQ_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: FAQ_HTML,
  fields: [
    {
      name: 'items',
      label: 'FAQ items',
      type: 'array' as const,
      itemFields: [
        { name: 'question', label: 'Question', type: 'text' as const },
        { name: 'answer', label: 'Answer', type: 'textarea' as const },
      ],
    },
  ],
  values: {
    items: FAQ_ITEMS,
  },
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }

  // Idempotent: replace an existing FAQ block in place.
  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === FAQ_ID);
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = { ...faqBlock, order: parsed.blocks[existingIdx].order ?? existingIdx + 1 };
    console.log(`Replaced existing ${FAQ_ID} at index ${existingIdx}.`);
  } else {
    const ctaIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === INSERT_BEFORE_ID);
    if (ctaIdx < 0) {
      console.error(`Post ${POST_ID}: could not find ${INSERT_BEFORE_ID} to insert before`);
      process.exit(1);
    }
    const ctaOrder = parsed.blocks[ctaIdx].order ?? ctaIdx + 1;
    parsed.blocks.splice(ctaIdx, 0, { ...faqBlock, order: ctaOrder });
    // Bump the CTA's order so it stays last.
    parsed.blocks[ctaIdx + 1].order = ctaOrder + 1;
    console.log(`Inserted ${FAQ_ID} at index ${ctaIdx} (before ${INSERT_BEFORE_ID}).`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: ${parsed.blocks.length} blocks.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
