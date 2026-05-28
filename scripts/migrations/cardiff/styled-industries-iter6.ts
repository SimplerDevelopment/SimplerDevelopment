/**
 * Iter 6: Industries hub (post id 818) — append an FAQ accordion section
 * to round out the page.
 *
 * Iters 1-5 produced: minimal hero -> 4-up trust band -> 10 alternating
 * industry strips. The page currently ends abruptly at the last strip
 * (Agriculture) with no answers to the obvious objections a visitor
 * arrives with ("can I qualify if my industry isn't listed?", "how fast
 * is funding?", "what about credit?"). This iter appends ONE new block —
 * `industries-faq` (html-render) — to give the page a natural closing
 * beat that pre-empts the most common questions before the user has to
 * scroll back up to the trust band or jump to apply.
 *
 * Pattern follows `scripts/migrations/cardiff/restyle-home-faq.ts` and
 * `styled-industries-iter4.ts`: html-render with a `data-repeat="faqs"`
 * loop where each repeated node uses `{{faqs.field}}` placeholders, so
 * the editor can add, remove, or re-order Q/A pairs without code edits.
 * Uses native <details>/<summary> for accordion behavior — no JS, no
 * external dep, accessible by default, and renders identically to the
 * AccordionBlockRender styling on the home page (white card chrome,
 * navy chevron, Raleway question + Open Sans answer).
 *
 * Idempotent: detects existing `industries-faq` by id; rewrites html +
 * fields if present (preserving user-edited values when shape matches),
 * otherwise appends to end. Re-running converges. Re-sequences `order`
 * across all blocks so the editor stays tidy.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 818;
const FAQ_BLOCK_ID = 'industries-faq';

const FAQ_HTML = `
<style>
  .cd-ind-faq {
    background: #f8fafd;
    padding: 72px 24px 80px 24px;
    border-top: 1px solid #e6ecf5;
  }
  .cd-ind-faq__inner { max-width: 880px; margin: 0 auto; }
  .cd-ind-faq__eyebrow {
    text-align: center;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #ef6632;
    margin: 0 0 10px 0;
  }
  .cd-ind-faq__title {
    text-align: center;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 2rem;
    font-weight: 800;
    color: #1c3370;
    letter-spacing: -0.015em;
    line-height: 1.2;
    margin: 0 auto 12px auto;
    max-width: 720px;
  }
  .cd-ind-faq__sub {
    text-align: center;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1rem;
    color: #525f7f;
    line-height: 1.6;
    margin: 0 auto 36px auto;
    max-width: 640px;
  }
  .cd-ind-faq__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .cd-ind-faq__item {
    background: #ffffff;
    border: 1px solid #e6ecf5;
    border-radius: 12px;
    box-shadow: 0 6px 18px rgba(28,51,112,0.05);
    overflow: hidden;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .cd-ind-faq__item[open] {
    border-color: #25418b;
    box-shadow: 0 10px 26px rgba(28,51,112,0.10);
  }
  .cd-ind-faq__q {
    list-style: none;
    cursor: pointer;
    padding: 20px 24px;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.0625rem;
    font-weight: 700;
    color: #1c3370;
    letter-spacing: -0.005em;
    line-height: 1.35;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .cd-ind-faq__q::-webkit-details-marker { display: none; }
  .cd-ind-faq__chev {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(37,65,139,0.08);
    color: #25418b;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.25s ease, background 0.2s ease;
  }
  .cd-ind-faq__chev .material-icons { font-size: 22px; }
  .cd-ind-faq__item[open] .cd-ind-faq__chev {
    transform: rotate(180deg);
    background: #25418b;
    color: #ffffff;
  }
  .cd-ind-faq__a {
    padding: 0 24px 22px 24px;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.9375rem;
    line-height: 1.65;
    color: #525f7f;
  }
  @media (max-width: 720px) {
    .cd-ind-faq { padding: 56px 16px 64px 16px; }
    .cd-ind-faq__title { font-size: 1.65rem; }
    .cd-ind-faq__q { padding: 16px 18px; font-size: 1rem; }
    .cd-ind-faq__a { padding: 0 18px 18px 18px; }
  }
</style>
<section class="cd-ind-faq">
  <div class="cd-ind-faq__inner">
    <p class="cd-ind-faq__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-ind-faq__title" data-field="title">{{title}}</h2>
    <p class="cd-ind-faq__sub" data-field="subtitle">{{subtitle}}</p>
    <div class="cd-ind-faq__list">
      <details class="cd-ind-faq__item" data-repeat="faqs">
        <summary class="cd-ind-faq__q">
          <span data-field="question">{{faqs.question}}</span>
          <span class="cd-ind-faq__chev"><span class="material-icons">expand_more</span></span>
        </summary>
        <div class="cd-ind-faq__a" data-field="answer">{{faqs.answer}}</div>
      </details>
    </div>
  </div>
</section>
`.trim();

const FAQ_DEFAULTS = {
  eyebrow: 'COMMON QUESTIONS',
  title: 'Funding answers for every industry we serve.',
  subtitle:
    "Whether you're a first-time borrower or a returning operator, here's what most business owners want to know before they apply.",
  faqs: [
    {
      question: "My industry isn't listed above — can I still qualify?",
      answer:
        "Yes. The verticals above are our top-funded industries, but Cardiff funds 25+ industries across the U.S. If your business has been operating for at least 6 months with consistent monthly revenue, there's a strong chance we can help. The fastest way to find out is to apply — it's free and won't impact your credit.",
    },
    {
      question: 'How fast can I actually get funded?',
      answer:
        'Most approvals happen the same business day you apply, and funded deals typically wire within 24-72 hours of signing. Equipment financing and SBA-style products take longer because of third-party vendor and underwriting steps, but our revenue-based working-capital options are built for speed.',
    },
    {
      question: 'What credit score do I need?',
      answer:
        "We weight the health of your business — not just your personal FICO. Strong monthly revenue, time in business, and a clean banking record can offset a credit score in the 500s. We also offer products specifically designed for owners rebuilding credit, so don't self-disqualify before talking to us.",
    },
    {
      question: 'How much can I borrow for my industry?',
      answer:
        'Approvals are sized to your trailing revenue and the use of funds. Trucking averages around $65,000, restaurants around $95,000, and equipment-heavy industries like manufacturing and contracting often approve higher. Your funding specialist will quote a range based on the last 3-6 months of bank statements.',
    },
    {
      question: 'Do I have to put up collateral?',
      answer:
        "Most of our working-capital products are unsecured — no collateral required, no liens on real estate or personal assets. Equipment financing is naturally secured by the equipment itself. We'll always tell you up-front which structure you're being offered before you sign anything.",
    },
    {
      question: 'What documents do I need to apply?',
      answer:
        "The basics: a one-page application, your last 3 months of business bank statements, and a copy of your driver's license. Larger deals or specialty products (SBA, equipment, real estate) may ask for tax returns or vendor invoices, but the initial application is intentionally short.",
    },
  ],
};

const faqBlock = {
  id: FAQ_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 999, // re-sequenced below
  html: FAQ_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: FAQ_DEFAULTS.eyebrow },
    { name: 'title', label: 'Title', type: 'textarea' as const, default: FAQ_DEFAULTS.title },
    { name: 'subtitle', label: 'Subtitle', type: 'textarea' as const, default: FAQ_DEFAULTS.subtitle },
    {
      name: 'faqs',
      label: 'FAQ items',
      type: 'array' as const,
      itemFields: [
        { name: 'question', label: 'Question', type: 'text' as const, default: '' },
        { name: 'answer', label: 'Answer', type: 'textarea' as const, default: '' },
      ],
      default: FAQ_DEFAULTS.faqs,
    },
  ],
  values: { ...FAQ_DEFAULTS },
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

  const existingIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === FAQ_BLOCK_ID,
  );

  let action: 'appended' | 'updated';

  if (existingIdx !== -1) {
    const existing = parsed.blocks[existingIdx];
    parsed.blocks[existingIdx] = {
      ...existing,
      type: 'html-render',
      width: 'full',
      html: FAQ_HTML,
      fields: faqBlock.fields,
      values:
        existing.values && Array.isArray(existing.values.faqs) && existing.values.faqs.length > 0
          ? existing.values
          : faqBlock.values,
    };
    action = 'updated';
  } else {
    parsed.blocks.push(faqBlock);
    action = 'appended';
  }

  // Re-sequence order across all blocks so the editor stays tidy.
  parsed.blocks.forEach((b: { order?: number }, i: number) => {
    b.order = i;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));

  console.log(
    `Post ${POST_ID}: ${action} "${FAQ_BLOCK_ID}" FAQ accordion. Block count now: ${parsed.blocks.length}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
