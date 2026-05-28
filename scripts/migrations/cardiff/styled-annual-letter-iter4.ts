/**
 * Annual Letter iter 4 — Style the "Frequently Asked Questions" section
 * (sec-9) on post 794. This is the single largest unstyled section
 * remaining: 29 sub-blocks comprising one H2, 9 H4+paragraph FAQ pairs,
 * and 3 trailing testimonial triplets — rendered as a bare wall of text.
 *
 * Iter 4 replaces sec-9 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter1/iter2/iter3).
 *   2. A single html-render FAQ accordion driven by data-repeat="faqs",
 *      using native <details>/<summary> so it works without JS. Each
 *      item gets a brand-blue chevron rotation, hover lift, and brand
 *      card chrome — pattern lifted from styled-equipment-leasing-iter3.
 *   3. A 3-up testimonial card grid (data-repeat="quotes") below the
 *      FAQ, rotating brand accent colors across cards.
 *
 * Brand: #1c3370 / #25418b deep blue, #5ac96f green, #ef6632 orange,
 * Raleway + Open Sans. Material Icons only — no emojis.
 *
 * Idempotent: re-running rewrites sec-9.blocks wholesale from the
 * templates defined below; safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 794;
const TARGET_BLOCK_ID = 'sec-9';

const FAQ_HTML = `<div class="cdal-faq">
  <details class="cdal-faq__item" data-repeat="faqs">
    <summary class="cdal-faq__q">
      <span class="cdal-faq__qtext" data-field="question">{{faqs.question}}</span>
      <span class="cdal-faq__chev material-icons">expand_more</span>
    </summary>
    <div class="cdal-faq__a" data-field="answer">{{faqs.answer}}</div>
  </details>
  <style>
    .cdal-faq { max-width: 920px; margin: 8px auto 0 auto; display: flex; flex-direction: column; gap: 14px; }
    .cdal-faq__item { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; box-shadow: 0 6px 18px rgba(28,51,112,0.06); overflow: hidden; transition: box-shadow .25s ease, transform .25s ease; }
    .cdal-faq__item:hover { box-shadow: 0 14px 32px rgba(28,51,112,0.12); transform: translateY(-2px); }
    .cdal-faq__item[open] { border-color: #c9d4ec; box-shadow: 0 14px 36px rgba(28,51,112,0.14); }
    .cdal-faq__q { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 22px 26px; cursor: pointer; list-style: none; font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 1.05rem; line-height: 1.4; color: #1c3370; letter-spacing: -0.005em; }
    .cdal-faq__q::-webkit-details-marker { display: none; }
    .cdal-faq__qtext { flex: 1 1 auto; }
    .cdal-faq__chev { flex: 0 0 auto; color: #ef6632; font-size: 26px; transition: transform .25s ease; }
    .cdal-faq__item[open] .cdal-faq__chev { transform: rotate(180deg); }
    .cdal-faq__a { padding: 0 26px 24px 26px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; border-top: 1px solid #f0f3fa; padding-top: 18px; margin-top: -2px; }
    @media (max-width: 620px) {
      .cdal-faq__q { padding: 18px 20px; font-size: 0.98rem; }
      .cdal-faq__a { padding: 16px 20px 20px 20px; }
    }
  </style>
</div>`;

const QUOTES_HTML = `<div class="cdal-quotes">
  <div class="cdal-quotes__row">
    <figure class="cdal-quotes__card" data-repeat="quotes">
      <span class="cdal-quotes__mark material-icons">format_quote</span>
      <blockquote class="cdal-quotes__body" data-field="quote">{{quotes.quote}}</blockquote>
      <figcaption class="cdal-quotes__cite">
        <span class="cdal-quotes__name" data-field="name">{{quotes.name}}</span>
        <span class="cdal-quotes__note" data-field="note">{{quotes.note}}</span>
      </figcaption>
    </figure>
  </div>
  <style>
    .cdal-quotes { max-width: 1200px; margin: 56px auto 0 auto; }
    .cdal-quotes__row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
    .cdal-quotes__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 34px 26px 26px 26px; margin: 0; box-shadow: 0 10px 28px rgba(28,51,112,0.08); display: flex; flex-direction: column; gap: 18px; border-top: 4px solid #1c3370; }
    .cdal-quotes__card:nth-child(2) { border-top-color: #ef6632; }
    .cdal-quotes__card:nth-child(3) { border-top-color: #5ac96f; }
    .cdal-quotes__mark { position: absolute; top: 14px; right: 18px; font-size: 38px; color: rgba(28,51,112,0.10); }
    .cdal-quotes__card:nth-child(2) .cdal-quotes__mark { color: rgba(239,102,50,0.14); }
    .cdal-quotes__card:nth-child(3) .cdal-quotes__mark { color: rgba(58,168,86,0.14); }
    .cdal-quotes__body { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.65; color: #2f3a55; margin: 0; font-style: italic; }
    .cdal-quotes__cite { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid #f0f3fa; padding-top: 14px; font-style: normal; }
    .cdal-quotes__name { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.98rem; color: #1c3370; letter-spacing: -0.005em; }
    .cdal-quotes__note { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; color: #8694b0; }
    @media (max-width: 980px) {
      .cdal-quotes__row { grid-template-columns: 1fr; }
    }
  </style>
</div>`;

const FAQ_DEFAULTS = {
  faqs: [
    {
      question: 'What is alternative business lending?',
      answer:
        'Alternative business lending refers to financing options offered outside traditional banks. These funding tools include unsecured loans, merchant financing, cash flow loans, and revenue-based funding. They often offer faster approval and more flexible qualification criteria, making them a top choice for small or growing businesses or those with past credit problems.',
    },
    {
      question: 'How do unsecured business loans work?',
      answer:
        "Unsecured business loans require no collateral. Lenders base approval for these loans on other factors, such as your business's performance, cash flow, and overall financial health. These loans can help you access fast capital without putting assets at risk.",
    },
    {
      question: 'Can I get funding even with a low credit score?',
      answer:
        'Yes. While banks often deny loans because of a low credit score, alternative business lenders, like Cardiff, look at the bigger picture. They specialize in business credit options for owners with lower credit scores and focus on real-time revenue trends and business performance, not just your credit history.',
    },
    {
      question: 'What types of businesses use merchant financing?',
      answer:
        'Merchant financing is a popular financing option among businesses with steady credit card sales, such as retail stores, beauty salons, restaurants, and auto repair shops. It allows businesses to repay as a percentage of daily transactions, keeping payments low if sales slump and accelerating payoff when business booms. Fixed payments are also an option.',
    },
    {
      question: 'How fast can I get approved for a business loan?',
      answer:
        'It depends on the lender. The application, approval, and underwriting process with traditional lenders can take days or weeks, depending on the loan product. However, online lenders, such as Cardiff, make the process much faster. Many applicants receive a decision within hours of submitting a completed application. Once approved, you may receive funds the same day.',
    },
    {
      question: 'What documents do I need to apply for a business loan?',
      answer:
        "You'll need basic business information, personal identification, tax statements, and proof of revenue. You can use a secure Plaid connection to provide access to recent bank statements. Online applications for short-term business funding can be brief. However, lenders may request additional documentation depending on your loan type and business needs.",
    },
    {
      question: "What's the difference between a revenue-based loan and a cash flow loan?",
      answer:
        'Revenue-based loans tie your repayment to revenue, offering flexibility during slower periods. Cash flow loans focus on predictable revenue patterns to help smooth over timing gaps in expenses and income. Payments are a set amount for a pre-defined term. They offer less flexibility but more stability.',
    },
    {
      question: 'Are business loans good for expansion?',
      answer:
        'Absolutely. Seizing growth opportunities, weathering storms, or ordering inventory for your busy season all require financing. Business loans can cover everything from new equipment to hiring staff or opening another location. Non-traditional lenders can even provide fast access to funds, so you can answer when opportunity knocks.',
    },
    {
      question: 'Is there a penalty for paying off my loan early?',
      answer:
        'Not with Cardiff. We offer interest-free early payoff options on our business loans for eligible clients. By paying your loan off early, you can reduce your overall borrowing cost. And with less debt on your books, you improve your chances of qualifying for business loans in the future.',
    },
  ],
};

const QUOTES_DEFAULTS = {
  quotes: [
    {
      quote:
        '"These guys were great to work with in obtaining financing for our mobile truck business, which is a very specialized and difficult niche to get financing for. Everyone we worked with was professional, knowledgable, courteous, and efficient. They expedited our needs and we were able to meet the deadline for our first event!"',
      name: 'Chad Smith',
      note: '*Actual customer testimonials. Photos are illustrative only.',
    },
    {
      quote:
        '"I worked with Jerry Stone on a used truck deal. He couldn\'t have been better to work with for me and the customer. I would recommend anyone looking for financing to reach out to Jerry at Cardiff."',
      name: 'Bo Burgarello',
      note: '*Actual customer testimonials. Photos are illustrative only.',
    },
    {
      quote:
        '"Ryan and Denis are first class. They helped us get financing when we had no other options. If you\'re looking to expand, revamp, or start your business, you NEED to give them a call."',
      name: 'Eric Goldberg',
      note: '*Actual customer testimonials. Photos are illustrative only.',
    },
  ],
};

const faqBlock = {
  id: 'sec-9-faq',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: FAQ_HTML,
  fields: [
    {
      name: 'faqs',
      label: 'FAQ items',
      type: 'array',
      itemFields: [
        { name: 'question', type: 'text', label: 'Question' },
        { name: 'answer', type: 'textarea', label: 'Answer' },
      ],
    },
  ],
  values: { ...FAQ_DEFAULTS },
};

const quotesBlock = {
  id: 'sec-9-quotes',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: QUOTES_HTML,
  fields: [
    {
      name: 'quotes',
      label: 'Customer testimonials',
      type: 'array',
      itemFields: [
        { name: 'quote', type: 'textarea', label: 'Quote' },
        { name: 'name', type: 'text', label: 'Name' },
        { name: 'note', type: 'text', label: 'Footnote' },
      ],
    },
  ],
  values: { ...QUOTES_DEFAULTS },
};

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

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

  const idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }

  // Widen + give the section a subtle tinted band so it reads as a discrete unit.
  sec.maxWidth = '1240px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '88px',
    paddingBottom: '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-9-title',
    order: 1,
    level: 2,
    content: 'Frequently Asked Questions',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.18',
      margin: '0 auto 14px auto',
      maxWidth: '900px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-9-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  sec.blocks = [headerBlock, dividerBlock, faqBlock, quotesBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-9 -> styled 9-item FAQ accordion + 3-up testimonial grid.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
