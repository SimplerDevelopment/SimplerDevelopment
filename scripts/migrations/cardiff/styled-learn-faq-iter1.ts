/**
 * Iter 1 — Learn FAQ page (post 820).
 *
 * Biggest visual gap: the port has only 5 paragraphs in `sec-1`, whereas
 * cardiff.co/learn/faq/ shows a full 20-item accordion of Q&A pairs on a
 * light-blue page background with white card chrome, blue uppercase
 * titles and a + chevron toggle.
 *
 * Fix: replace `sec-1` with a single html-render block that uses
 * <details>/<summary> (no JS needed) and a `data-repeat="items"` array
 * of {question, answer} so editors can manage Q&As inline.
 *
 * Idempotent: re-runs replace the existing `faq-acc` block if present.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 820;

const FAQ_HTML = `
<style>
  .cd-faq { background: #eef3f8; padding: 64px 24px 88px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-faq__inner { max-width: 880px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
  .cd-faq__item { background: #ffffff; border-radius: 4px; box-shadow: 0 1px 3px rgba(28,51,112,0.08); overflow: hidden; }
  .cd-faq__item > summary { list-style: none; cursor: pointer; padding: 22px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; font-weight: 700; color: #25418b; letter-spacing: -0.005em; line-height: 1.35; }
  .cd-faq__item > summary::-webkit-details-marker { display: none; }
  .cd-faq__item > summary::after { content: '+'; font-size: 1.5rem; font-weight: 400; color: #25418b; line-height: 1; flex-shrink: 0; transition: transform 0.2s ease; }
  .cd-faq__item[open] > summary::after { content: '–'; }
  .cd-faq__item[open] > summary { border-bottom: 1px solid #e6ecf3; }
  .cd-faq__a { padding: 18px 28px 24px 28px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 600px) {
    .cd-faq { padding: 40px 16px 56px 16px; }
    .cd-faq__item > summary { padding: 18px 20px; font-size: 0.95rem; }
    .cd-faq__a { padding: 16px 20px 20px 20px; }
  }
</style>
<section class="cd-faq">
  <div class="cd-faq__inner">
    <details class="cd-faq__item" data-repeat="items">
      <summary data-field="question">{{items.question}}</summary>
      <p class="cd-faq__a" data-field="answer">{{items.answer}}</p>
    </details>
  </div>
</section>
`.trim();

const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
  { question: 'What is Cardiff?', answer: 'Cardiff is a small business lender based in San Diego, California that provides fast and easy financing to businesses across America.' },
  { question: 'Can I get a Cardiff loan?', answer: 'While we cannot guarantee that everyone gets approved, taking the time to hand-review each application we receive is part of the Cardiff promise.' },
  { question: 'Why should I borrow with Cardiff?', answer: 'At Cardiff, we believe in borrowing better. That means an easy process, personalized customer service, and, most importantly, fast funding. In fact, many applicants receive funding the same day.' },
  { question: 'How much can I get?', answer: 'Cardiff loans range from $5,000 to $250,000 based on your business qualifications and needs.' },
  { question: 'How do I apply?', answer: 'Click here to begin your application.' },
  { question: 'What qualifications do I need to get approved?', answer: 'While we review each submission on a case-by-case basis, approved applicants typically have a 600 personal credit score, at least one year time-in-business, and make $20,000 in monthly revenue.' },
  { question: 'What is a Plaid statement submission?', answer: 'Plaid is a fintech service provider that allows Cardiff to securely access business bank statements for evaluation without sharing your login information with us.' },
  { question: 'Will applying affect my credit?', answer: 'The initial application will not impact your credit score. Once you are matched with a representative, you can specify whether you’ll allow a credit pull. Please note that refusing a hard pull may limit your financing options.' },
  { question: 'How is my rate determined?', answer: 'Your rate is determined by a variety of factors, including your personal credit, business history, as well as your revenues and industry type.' },
  { question: 'Are there penalties for paying off a loan or advance early?', answer: 'NEVER. At Cardiff, we want you to succeed. So much so, that we offer a discount for paying off early.' },
  { question: 'How does Cardiff Early Payback work?', answer: 'Once you’re approved for a loan, speak with your representative regarding early payoff options you may be eligible for.' },
  { question: 'If approved, how do I receive funding?', answer: 'Once the process is complete, you will receive funds via ACH bank transfer. We can also wire your bank account directly. (A small fee may apply.)' },
  { question: 'How do I pay back my loan?', answer: 'Paying back is simple — we draft payments from your business checking account automatically.' },
  { question: 'How can I track my payment progress?', answer: 'Our terms are very clearly outlined in your documents. If you are unsure of something, please contact your representative via email, phone, or text message.' },
  { question: 'What is invoice factoring?', answer: 'Invoice factoring is another service Cardiff provides. It allows you to cash in on your accounts receivable much faster than normal, enabling you to keep investing in your business without waiting.' },
  { question: 'What is asset-based lending?', answer: 'Cardiff’s asset-based lending program enables business owners who have equipment to borrow its value in cash at a great rate, while continuing to use the machine.' },
  { question: 'Does Cardiff offer equipment financing or equipment leasing?', answer: 'Yes! Cardiff has a fully-fledged equipment financing program, offering competitive rates, fast approvals, and even prefunding. We can finance new or used, lease or purchase equipment pieces for a variety of industries.' },
  { question: 'Can I get additional financing?', answer: 'Yes! We are happy to add to or renew your loan once you’ve started the payback process. Reach out to your representative for help.' },
  { question: 'What if I need help with my loan?', answer: 'We are always happy to help — just reach out to your representative with whatever issue you may be facing.' },
  { question: 'I have some other questions.', answer: 'Go ahead and apply here to be connected to a representative. Or, email us at team@cardiff.co.' },
];

const faqBlock = {
  id: 'faq-acc',
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

  // Idempotent: replace existing faq-acc, otherwise swap out sec-1 at idx 1.
  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'faq-acc');
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = faqBlock;
    console.log(`Replaced existing faq-acc at index ${existingIdx} (re-run).`);
  } else {
    const sec1Idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sec-1');
    if (sec1Idx < 0) {
      console.error(`Post ${POST_ID}: could not find sec-1 to replace`);
      process.exit(1);
    }
    parsed.blocks.splice(sec1Idx, 1, faqBlock);
    console.log(`Replaced sec-1 at index ${sec1Idx} with faq-acc.`);
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
