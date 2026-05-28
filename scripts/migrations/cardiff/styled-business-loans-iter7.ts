/**
 * Iter 7: Restyle the FAQ section (sec-10) on post 800 (business-loans).
 *
 * Current state: sec-10 contains ONLY a centered "Frequently Asked
 * Questions" heading + the orange divider rule. No actual Q&A items —
 * the original cardiff.co/business-loans page emits the same empty
 * heading. That leaves the biggest unstyled gap on the page: a section
 * that visually promises a FAQ but delivers nothing.
 *
 * Fix: append a single html-render block (`sec-10-faq-acc`) inside
 * sec-10 using <details>/<summary> + data-repeat="items" — same idiom
 * as styled-learn-faq-iter1.ts so editors can manage Q&As inline.
 * Questions are derived from content already asserted elsewhere on the
 * page (loan size, funding speed, qualification floor, repayment,
 * Plaid, early payback, additional financing).
 *
 * Idempotent: re-running detects existing html-render at id
 *   `sec-10-faq-acc` inside sec-10 and rewrites it; otherwise appends.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 800;

const FAQ_HTML = `
<style>
  .cd-bl-faq { max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-bl-faq__item { background: #ffffff; border-radius: 10px; box-shadow: 0 2px 10px rgba(37,65,139,0.06); border: 1px solid #e8edf6; overflow: hidden; transition: box-shadow .2s ease; }
  .cd-bl-faq__item[open] { box-shadow: 0 8px 22px rgba(28,51,112,0.10); }
  .cd-bl-faq__item > summary { list-style: none; cursor: pointer; padding: 22px 26px; display: flex; align-items: center; justify-content: space-between; gap: 16px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; font-weight: 700; color: #25418b; letter-spacing: -0.005em; line-height: 1.35; }
  .cd-bl-faq__item > summary::-webkit-details-marker { display: none; }
  .cd-bl-faq__item > summary::after { content: '+'; font-size: 1.5rem; font-weight: 400; color: #ef6632; line-height: 1; flex-shrink: 0; transition: transform 0.2s ease; }
  .cd-bl-faq__item[open] > summary::after { content: '–'; color: #25418b; }
  .cd-bl-faq__item[open] > summary { border-bottom: 1px solid #eef2f8; }
  .cd-bl-faq__a { padding: 18px 26px 24px 26px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 600px) {
    .cd-bl-faq__item > summary { padding: 18px 20px; font-size: 0.95rem; }
    .cd-bl-faq__a { padding: 16px 20px 20px 20px; }
  }
</style>
<div class="cd-bl-faq">
  <details class="cd-bl-faq__item" data-repeat="items">
    <summary data-field="question">{{items.question}}</summary>
    <p class="cd-bl-faq__a" data-field="answer">{{items.answer}}</p>
  </details>
</div>
`.trim();

const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
  {
    question: 'How much can I borrow with a Cardiff small business loan?',
    answer:
      'Cardiff loans range from $10,000 to $250,000. Your offer is sized to your business — we look at revenue, time-in-business, and your funding goal rather than forcing you into a one-size-fits-all bracket.',
  },
  {
    question: 'How fast can I get funded?',
    answer:
      'Approvals typically come back in minutes. In many cases, approved applicants receive funds the same day, so you can act on payroll, inventory, or growth opportunities without waiting weeks for a bank decision.',
  },
  {
    question: 'What qualifications do I need to get approved?',
    answer:
      'We hand-review every application, but most approved business owners have a 600+ personal credit score, at least one year in business, and roughly $20,000 in monthly revenue. Strong cash flow or assets can offset a softer credit profile.',
  },
  {
    question: 'Will applying hurt my credit score?',
    answer:
      'The initial application is a soft inquiry and will not affect your credit score. If you choose to move forward with a specific offer, your representative will discuss whether a hard pull is needed.',
  },
  {
    question: 'What is the Plaid connection used for?',
    answer:
      'Plaid lets Cardiff securely read your business bank statements directly from your bank — no PDFs to upload, no login credentials shared with us. It is the fastest way to get an accurate offer.',
  },
  {
    question: 'Are there penalties for paying off my loan early?',
    answer:
      'Never. Cardiff actually offers a discount for paying off early. We want funding to fuel momentum, not lock you into interest you no longer need.',
  },
  {
    question: 'Can I get additional capital after my first loan?',
    answer:
      'Yes. Once you are in good standing on your repayment plan, your representative can renew or add to your line. Many Cardiff customers come back for follow-on capital as their business scales.',
  },
  {
    question: 'What if a traditional term loan is not the right fit?',
    answer:
      'Beyond standard small business loans, Cardiff offers invoice financing, revenue-based repayment, short-term working capital, equipment financing, and asset-based lending — so we can match the product to your situation instead of the other way around.',
  },
];

const faqBlock = {
  id: 'sec-10-faq-acc',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
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

  const sec10Idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sec-10');
  if (sec10Idx < 0) {
    console.error(`Post ${POST_ID}: could not find sec-10`);
    process.exit(1);
  }

  const sec10 = parsed.blocks[sec10Idx];
  if (!Array.isArray(sec10.blocks)) sec10.blocks = [];

  // Widen the section so the accordion has room without overflowing the
  // tiny 880px column the empty heading was sitting in.
  sec10.maxWidth = '1000px';

  const existingIdx = sec10.blocks.findIndex(
    (b: { id?: string }) => b?.id === 'sec-10-faq-acc',
  );
  if (existingIdx >= 0) {
    sec10.blocks[existingIdx] = faqBlock;
    console.log(
      `Replaced existing sec-10-faq-acc at sec-10.blocks[${existingIdx}] (re-run).`,
    );
  } else {
    sec10.blocks.push(faqBlock);
    console.log(
      `Appended sec-10-faq-acc to sec-10 (now ${sec10.blocks.length} sub-blocks).`,
    );
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(`Updated post ${POST_ID}: sec-10 FAQ accordion (${FAQ_ITEMS.length} items).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
