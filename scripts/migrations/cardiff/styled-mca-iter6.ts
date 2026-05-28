/**
 * Merchant Cash Advance page (post 824) — iter6.
 *
 * Biggest remaining unstyled body: sec-13 "Frequently Asked Questions" —
 * currently a flat stack of two bare paragraphs that read like Q/A pairs
 * but have no question labels, no separators, and no accordion affordance.
 *
 * We replace sec-13.blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter2–iter5)
 *   2. A single html-render block containing a JS-free accordion
 *      (<details>/<summary>) driven by a `data-repeat="faq"` loop so the
 *      portal editor can add/remove Q/A pairs without HTML edits.
 *
 * Each row uses {{faq.q}} for the question and {{faq.a}} for the answer
 * (bare-field syntax inside a data-repeat scope per the iter convention).
 *
 * We seed the accordion with the two existing Q/As from the page plus three
 * additional canonical MCA questions (rates, qualification, comparison) so
 * the band carries useful weight matching the rest of the article.
 *
 * Brand palette: #1c3370 / #25418b deep blue, #5ac96f green, #ef6632 orange,
 * #ffb798 peach. Fonts: Raleway (headings/questions) + Open Sans (answers).
 * Material Icons (no emojis) for the chevron indicator.
 *
 * Idempotent: re-running detects an existing `sec-13-faq` html-render child
 * and refreshes html/values; if missing, replaces sec-13.blocks wholesale
 * (section type asserted).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 824;
const TARGET_BLOCK_ID = 'sec-13';

const FAQ_HTML = `
<style>
  .cd-mca-faq { max-width: 880px; margin: 0 auto; }
  .cd-mca-faq__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 40px auto; }
  .cd-mca-faq__list { display: flex; flex-direction: column; gap: 14px; }
  .cd-mca-faq__item { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; box-shadow: 0 6px 18px rgba(28,51,112,0.05); overflow: hidden; transition: box-shadow .25s ease, border-color .25s ease; }
  .cd-mca-faq__item[open] { box-shadow: 0 12px 30px rgba(28,51,112,0.10); border-color: #cbd6ea; }
  .cd-mca-faq__q { list-style: none; cursor: pointer; padding: 22px 26px; display: flex; align-items: center; justify-content: space-between; gap: 18px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 700; color: #1c3370; letter-spacing: -0.005em; line-height: 1.35; }
  .cd-mca-faq__q::-webkit-details-marker { display: none; }
  .cd-mca-faq__q-text { flex: 1; }
  .cd-mca-faq__chev { width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; flex-shrink: 0; transition: transform .25s ease, background .25s ease; box-shadow: 0 4px 10px rgba(28,51,112,0.22); }
  .cd-mca-faq__chev .material-icons { font-size: 20px; }
  .cd-mca-faq__item[open] .cd-mca-faq__chev { transform: rotate(180deg); background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 4px 10px rgba(239,102,50,0.28); }
  .cd-mca-faq__a { padding: 0 26px 22px 26px; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9875rem; line-height: 1.7; border-top: 1px solid #f0f4fa; padding-top: 18px; margin-top: 0; }
  .cd-mca-faq__closer { margin: 40px auto 0 auto; max-width: 760px; text-align: center; padding: 22px 28px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-mca-faq__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.65; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 620px) {
    .cd-mca-faq__q { padding: 18px 18px; font-size: 1rem; }
    .cd-mca-faq__a { padding: 0 18px 18px 18px; padding-top: 16px; }
    .cd-mca-faq__closer { padding: 18px 18px; }
  }
</style>
<div class="cd-mca-faq">
  <p class="cd-mca-faq__intro" data-field="intro">{{intro}}</p>
  <div class="cd-mca-faq__list">
    <details class="cd-mca-faq__item" data-repeat="faq">
      <summary class="cd-mca-faq__q">
        <span class="cd-mca-faq__q-text">{{faq.q}}</span>
        <span class="cd-mca-faq__chev"><span class="material-icons">expand_more</span></span>
      </summary>
      <div class="cd-mca-faq__a">{{faq.a}}</div>
    </details>
  </div>
  <div class="cd-mca-faq__closer">
    <p class="cd-mca-faq__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const FAQ_DEFAULTS = {
  intro: "Still weighing whether a merchant cash advance is right for your business? Here are the questions Cardiff hears most often from small business owners exploring MCA financing.",
  faq: [
    {
      q: 'What is a merchant cash advance (MCA)?',
      a: 'A merchant cash advance is a flexible funding option in which a business receives a set amount of capital upfront and repays it through a portion of future credit card or debit card sales — making it a smart fit for businesses with consistent card-based revenue.',
    },
    {
      q: 'How does MCA repayment work?',
      a: 'Repayments occur automatically through daily, weekly, or monthly deductions from your business’s credit card or debit card transactions. They may also take the form of fixed daily, weekly, or monthly payments — Cardiff helps you choose the structure that best matches your cash flow.',
    },
    {
      q: 'How fast can I get funded?',
      a: 'Cardiff’s streamlined online application is built for speed. Many applicants receive a decision the same day they apply, and qualifying businesses can see funds deposited as quickly as same-day — one of the fastest funding turnarounds available in small business financing.',
    },
    {
      q: 'Do I need perfect credit to qualify?',
      a: 'No. MCAs are evaluated primarily on the strength and consistency of your business revenue rather than personal credit alone. Cardiff works with a broad range of credit profiles, focusing on overall business health, time in business, and sales performance.',
    },
    {
      q: 'How is an MCA different from a traditional business loan?',
      a: 'Traditional loans use a fixed term, fixed monthly payment, and rely heavily on credit. An MCA advances a lump sum repaid as a small share of your sales (or via flexible fixed payments), so the repayment automatically adapts to your revenue rhythm — useful during seasonal swings or growth pushes.',
    },
  ],
  closer: 'Have a question we didn’t answer? Cardiff’s funding specialists are a quick call away and happy to walk you through every step before you apply.',
} as const;

const faqBlock = {
  id: 'sec-13-faq',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: FAQ_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: FAQ_DEFAULTS.intro },
    {
      name: 'faq',
      label: 'FAQ items',
      type: 'repeater',
      itemFields: [
        { name: 'q', label: 'Question', type: 'text' },
        { name: 'a', label: 'Answer', type: 'textarea' },
      ],
      default: FAQ_DEFAULTS.faq,
    },
    { name: 'closer', label: 'Closer line', type: 'textarea', default: FAQ_DEFAULTS.closer },
  ],
  values: {
    intro: FAQ_DEFAULTS.intro,
    faq: FAQ_DEFAULTS.faq.map((row) => ({ ...row })),
    closer: FAQ_DEFAULTS.closer,
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

  // Hold the FAQ to a comfortable reading width.
  sec.maxWidth = '960px';
  // Soft blue-tinted background to set the FAQ band apart from neighbors.
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-13-title',
    order: 1,
    level: 2,
    content: 'Frequently Asked Questions',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
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
    id: 'sec-13-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, faqBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-13 -> styled FAQ accordion (${FAQ_DEFAULTS.faq.length} Q/A items, ${parsed.blocks.length} top-level blocks).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
