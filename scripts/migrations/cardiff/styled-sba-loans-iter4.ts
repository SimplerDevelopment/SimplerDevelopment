/**
 * Iter 4 — SBA Loans page (post 829).
 *
 * Biggest remaining visual gap: the "Small Business Administration Loan FAQs"
 * section (sec-5) is a plain vertical stack of <h3> questions, most of which
 * have no answer body at all. cardiff.co/business-loans/products/sba-loans/
 * renders these as a styled accordion (white card chrome, blue Raleway title,
 * orange +/- chevron, soft shadow) over a light-blue band.
 *
 * Fix: replace `sec-5` with a single html-render block (id `sba-faq-acc`)
 * that uses <details>/<summary> + data-repeat="items" so editors can manage
 * the Q&A list inline. Full answer copy lifted from the live cardiff.co page
 * (all 10 questions).
 *
 * Idempotent: re-runs replace an existing `sba-faq-acc` if present, otherwise
 * swap out `sec-5`.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 829;

const FAQ_HTML = `
<style>
  .cd-sba-faq { background: #eef3f8; padding: 72px 24px 88px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-sba-faq__head { max-width: 880px; margin: 0 auto 36px auto; text-align: center; }
  .cd-sba-faq__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2rem; font-weight: 800; color: #25418b; letter-spacing: -0.015em; line-height: 1.2; margin: 0 0 16px 0; }
  .cd-sba-faq__rule { width: 48px; height: 3px; background: #ef6632; margin: 0 auto; border-radius: 2px; }
  .cd-sba-faq__inner { max-width: 880px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
  .cd-sba-faq__item { background: #ffffff; border-radius: 6px; box-shadow: 0 1px 3px rgba(28,51,112,0.08); border: 1px solid #e8edf6; overflow: hidden; transition: box-shadow 0.2s ease; }
  .cd-sba-faq__item[open] { box-shadow: 0 4px 14px rgba(28,51,112,0.10); }
  .cd-sba-faq__item > summary { list-style: none; cursor: pointer; padding: 22px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; font-weight: 700; color: #25418b; letter-spacing: -0.005em; line-height: 1.35; }
  .cd-sba-faq__item > summary::-webkit-details-marker { display: none; }
  .cd-sba-faq__item > summary::after { content: '+'; font-size: 1.6rem; font-weight: 400; color: #ef6632; line-height: 1; flex-shrink: 0; transition: transform 0.2s ease; }
  .cd-sba-faq__item[open] > summary::after { content: '–'; }
  .cd-sba-faq__item[open] > summary { border-bottom: 1px solid #e6ecf3; }
  .cd-sba-faq__a { padding: 18px 28px 24px 28px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 600px) {
    .cd-sba-faq { padding: 48px 16px 64px 16px; }
    .cd-sba-faq__title { font-size: 1.6rem; }
    .cd-sba-faq__item > summary { padding: 18px 20px; font-size: 0.95rem; }
    .cd-sba-faq__a { padding: 16px 20px 20px 20px; }
  }
</style>
<section class="cd-sba-faq">
  <div class="cd-sba-faq__head">
    <h2 class="cd-sba-faq__title">Small Business Administration Loan FAQs</h2>
    <div class="cd-sba-faq__rule"></div>
  </div>
  <div class="cd-sba-faq__inner">
    <details class="cd-sba-faq__item" data-repeat="items">
      <summary data-field="question">{{items.question}}</summary>
      <p class="cd-sba-faq__a" data-field="answer">{{items.answer}}</p>
    </details>
  </div>
</section>
`.trim();

const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
  {
    question: 'What is an SBA loan?',
    answer:
      'An SBA loan is a type of business financing that is guaranteed by the U.S. Small Business Administration. These loans are issued by approved SBA lenders and are designed to offer competitive terms and rates to help small businesses grow.',
  },
  {
    question: 'What is the easiest SBA loan to get?',
    answer:
      'The SBA Express Loan is generally considered the easiest SBA loan to qualify for. It offers a streamlined application process and quicker approval times, although it typically has a lower maximum loan amount compared to other SBA loan types.',
  },
  {
    question: 'How much money do you need to get an SBA loan?',
    answer:
      'The amount of money you need to secure an SBA loan varies depending on the type of loan and your business needs. However, SBA loans can range from small amounts to as much as $5 million.',
  },
  {
    question: 'How much money does the SBA give you?',
    answer:
      'The SBA itself does not give you money; it guarantees the loan provided by the lender. The amount you can borrow depends on various factors including your business needs, creditworthiness, and the specific SBA loan program you choose.',
  },
  {
    question: 'Is getting an SBA loan a good idea?',
    answer:
      "Obtaining an SBA loan can be a good idea for many businesses due to the competitive interest rates and flexible repayment terms. However, it's important to carefully assess your business's financial situation and consult with a financial advisor to determine if it's the right option for you.",
  },
  {
    question: 'What credit score does SBA require?',
    answer:
      'The credit score requirements for an SBA loan can vary by lender and loan type, but generally, a credit score of 680 or higher is preferred.',
  },
  {
    question: 'What options do I have to finance my business?',
    answer:
      "While SBA loans offer various benefits, they can often take weeks or even months for approval and disbursement. If your business needs capital more quickly, Cardiff provides compelling alternatives. One of Cardiff's key advantages is the speed at which we can provide funding. We specialize in same-day approvals and funding, enabling you to access the capital you need almost immediately.",
  },
  {
    question: 'Does everyone qualify for SBA loan?',
    answer:
      "Not everyone will qualify for an SBA loan. Eligibility criteria can include your business's age, its financial health, your credit score, and the specific requirements of the SBA loan program you're applying for.",
  },
  {
    question: 'How long does it take to get an SBA loan?',
    answer:
      'The time it takes to get an SBA loan can vary widely depending on the type of loan and the lender. Some SBA Express Loans can be approved in a matter of days, while more complex loans like the SBA 7(a) may take several weeks or even months for approval and disbursement.',
  },
  {
    question: 'Why do I need to connect my business checking account with Plaid™?',
    answer:
      "Connecting your business checking account with Plaid™ allows us to streamline the application and verification process. It enables us to securely and quickly verify your business's financial information, saving you time and effort. This connection ensures a seamless experience, allowing us to assess your eligibility and provide you with financing options efficiently.",
  },
];

const faqBlock = {
  id: 'sba-faq-acc',
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

  // Idempotent: replace existing sba-faq-acc, else swap out sec-5.
  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sba-faq-acc');
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = faqBlock;
    console.log(`Replaced existing sba-faq-acc at index ${existingIdx} (re-run).`);
  } else {
    const sec5Idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sec-5');
    if (sec5Idx < 0) {
      console.error(`Post ${POST_ID}: could not find sec-5 to replace`);
      process.exit(1);
    }
    parsed.blocks.splice(sec5Idx, 1, faqBlock);
    console.log(`Replaced sec-5 at index ${sec5Idx} with sba-faq-acc.`);
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
