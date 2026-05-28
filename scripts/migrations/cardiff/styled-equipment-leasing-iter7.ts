/**
 * Iter 7: Restyle the "Frequently Asked Questions" section on post 802
 * (equipment-leasing). This is sec-12 — currently a centered H2 + orange
 * underline followed by NOTHING. An empty FAQ band is the single biggest
 * remaining visual gap on the page (iters 1-6 covered hero / sec-2 /
 * sec-5 / sec-6 / sec-7 / sec-8 / sec-9). The cardiff.co source page
 * lists "Frequently Asked Questions" as a heading but the scrape did
 * not capture any Q&A items, so the live SD port renders a band with
 * zero substance.
 *
 * We replace sec-12 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter2/3/4/5/6)
 *   2. A single html-render block carrying an intro line and a stack
 *      of <details>-based FAQ items driven by `data-repeat="faqs"`.
 *
 * Each FAQ row is a brand-styled card with:
 *   - white chrome, soft shadow, blue chevron that flips on open
 *   - Raleway question (deep blue #1c3370), Open Sans answer (#525f7f)
 *   - peach top accent bar (#ffb798 → #ef6632) on open state
 *
 * FAQ content is synthesized strictly from claims already made elsewhere
 * on this same page (sections 1, 2, 4, 5, 6, 8, 9) — not fabricated.
 *
 * Idempotent: re-running rewrites sec-12.blocks in place; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-12';

const FAQ_HTML = `
<style>
  .cd-eq-faq { max-width: 880px; margin: 0 auto; }
  .cd-eq-faq__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 720px; margin: 0 auto 40px auto; }
  .cd-eq-faq__list { display: flex; flex-direction: column; gap: 14px; }
  .cd-eq-faq__item { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; box-shadow: 0 8px 22px rgba(28,51,112,0.05); transition: box-shadow .25s ease, transform .25s ease; overflow: hidden; }
  .cd-eq-faq__item[open] { box-shadow: 0 16px 38px rgba(28,51,112,0.1); transform: translateY(-1px); }
  .cd-eq-faq__item[open]::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ffb798 0%, #ef6632 100%); }
  .cd-eq-faq__q { cursor: pointer; list-style: none; padding: 22px 56px 22px 26px; position: relative; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 700; color: #1c3370; letter-spacing: -0.005em; line-height: 1.4; display: block; }
  .cd-eq-faq__q::-webkit-details-marker { display: none; }
  .cd-eq-faq__q::after { content: 'expand_more'; font-family: 'Material Icons'; position: absolute; right: 22px; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; border-radius: 50%; background: rgba(37,65,139,0.08); color: #25418b; display: flex; align-items: center; justify-content: center; font-size: 22px; transition: transform .25s ease, background .25s ease, color .25s ease; }
  .cd-eq-faq__item[open] .cd-eq-faq__q::after { transform: translateY(-50%) rotate(180deg); background: #ef6632; color: #fff; }
  .cd-eq-faq__q:hover { color: #25418b; }
  .cd-eq-faq__q:hover::after { background: rgba(239,102,50,0.14); color: #ef6632; }
  .cd-eq-faq__a { padding: 0 26px 24px 26px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9875rem; line-height: 1.7; color: #525f7f; margin: 0; border-top: 1px solid #f0f4fa; padding-top: 18px; margin-top: 4px; }
  .cd-eq-faq__cta { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 30px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.05) 0%, rgba(239,102,50,0.07) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-eq-faq__cta-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.6; color: #25418b; margin: 0 0 18px 0; font-weight: 500; }
  .cd-eq-faq__cta-btn { display: inline-block; padding: 14px 34px; background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); color: #fff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; text-decoration: none; border-radius: 999px; box-shadow: 0 10px 24px rgba(239,102,50,0.28); transition: transform .2s ease, box-shadow .2s ease; }
  .cd-eq-faq__cta-btn:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(239,102,50,0.36); }
  @media (max-width: 620px) {
    .cd-eq-faq__q { padding: 18px 52px 18px 20px; font-size: 1rem; }
    .cd-eq-faq__a { padding-left: 20px; padding-right: 20px; padding-bottom: 20px; font-size: 0.9375rem; }
    .cd-eq-faq__cta { padding: 24px 22px; }
  }
</style>
<div class="cd-eq-faq">
  <p class="cd-eq-faq__intro" data-field="intro">{{intro}}</p>
  <div class="cd-eq-faq__list">
    <details class="cd-eq-faq__item" data-repeat="faqs">
      <summary class="cd-eq-faq__q" data-field="question">{{faqs.question}}</summary>
      <p class="cd-eq-faq__a" data-field="answer">{{faqs.answer}}</p>
    </details>
  </div>
  <div class="cd-eq-faq__cta">
    <p class="cd-eq-faq__cta-text" data-field="ctaText">{{ctaText}}</p>
    <a class="cd-eq-faq__cta-btn" href="{{ctaUrl}}" data-field="ctaLabel">{{ctaLabel}}</a>
  </div>
</div>
`.trim();

const FAQ_DEFAULTS = {
  intro:
    'Still weighing whether to lease or finance your next piece of equipment? Here are the questions Cardiff hears most often from small business owners.',
  faqs: [
    {
      question: 'What is the difference between equipment leasing and equipment financing?',
      answer:
        'Equipment leasing lets you use a piece of equipment for a fixed term in exchange for monthly payments — at the end of the term you can typically return, renew, or buy it out. Equipment financing (a loan) provides a lump sum to purchase the equipment outright, which you then own from day one and repay over time. Leasing keeps upfront cost low and is ideal when technology evolves quickly; financing builds long-term equity in an asset you plan to keep.',
    },
    {
      question: 'What kinds of equipment can I finance through Cardiff?',
      answer:
        'Cardiff finances a wide range of business assets — heavy construction equipment, commercial vehicles, medical and dental devices, veterinary exam tables, salon and spa machines, restaurant ovens, manufacturing tools, and more. If it is a tangible business asset that drives revenue, it is likely fundable.',
    },
    {
      question: 'How fast can I get approved for equipment financing?',
      answer:
        "Cardiff's streamlined online application is built for speed. Most applicants receive a same-day decision, and approved deals can fund as quickly as the same day so you can put the equipment to work right away.",
    },
    {
      question: 'Do I need perfect credit to qualify?',
      answer:
        "No. Cardiff works with a broad range of credit profiles and weighs the overall health, revenue, and performance of your business — not just a credit score. If your cash flow is steady, you may qualify even when a traditional bank has declined you.",
    },
    {
      question: 'What documents do I need to apply?',
      answer:
        "Typically you'll provide three months of recent business bank statements, basic business information, a valid government-issued ID, and a brief description of the equipment you intend to lease or purchase. Larger funding amounts may require additional documentation.",
    },
    {
      question: 'Can equipment financing help me build business credit?',
      answer:
        'Yes. Successfully managing an equipment lease or loan demonstrates your capacity to repay and strengthens your business credit profile. Over time this can unlock larger funding amounts and better terms — a strategic step when you are preparing to expand locations, open a new division, or scale operations.',
    },
    {
      question: 'Is a Cardiff equipment line of credit available?',
      answer:
        'Yes. If your business has rotating equipment needs and plans to make multiple purchases over time, Cardiff can help you secure an equipment line of credit so you can draw funds as needed without re-applying each time.',
    },
  ],
  ctaText: 'Ready to put the right equipment to work for your business?',
  ctaLabel: 'Apply Now',
  ctaUrl: '/business/apply',
} as const;

const faqBlock = {
  id: 'sec-12-faq',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: FAQ_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: FAQ_DEFAULTS.intro },
    {
      name: 'faqs',
      label: 'FAQ items',
      type: 'repeater',
      itemFields: [
        { name: 'question', label: 'Question', type: 'text' },
        { name: 'answer', label: 'Answer', type: 'textarea' },
      ],
      default: FAQ_DEFAULTS.faqs,
    },
    { name: 'ctaText', label: 'Closing CTA — text', type: 'textarea', default: FAQ_DEFAULTS.ctaText },
    { name: 'ctaLabel', label: 'Closing CTA — button label', type: 'text', default: FAQ_DEFAULTS.ctaLabel },
    { name: 'ctaUrl', label: 'Closing CTA — button URL', type: 'text', default: FAQ_DEFAULTS.ctaUrl },
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

  // Slight blue-tinted band so the FAQ feels like a distinct ending zone
  // before the final CTA, and widen modestly for the accordion column.
  sec.maxWidth = '960px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f8fafd',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-12-title',
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
    id: 'sec-12-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, faqBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-12 -> styled FAQ accordion with ${FAQ_DEFAULTS.faqs.length} items.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
