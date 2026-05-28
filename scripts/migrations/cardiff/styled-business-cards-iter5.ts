/**
 * Iter 5: Restyle sec-7 on post 797 (business-cards) — the "Why Business
 * Owners Choose Cardiff Over Traditional Banks" section. Currently 3 long
 * wall-of-text paragraphs (sec-7-p-2/p-3/p-4) that also smuggle in a
 * "Ready to Apply" CTA + an FAQ snippet with no visual structure.
 *
 * We replace sec-7's children with:
 *   1. Centered H2 + orange underline (same pattern as iter3/iter4)
 *   2. Intro paragraph (Cardiff is not a one-size-fits-all lender ...)
 *   3. A single html-render block carrying a 4-up "Cardiff vs. Traditional
 *      Banks" benefit-card grid using data-repeat="benefits" so the editor
 *      can add/remove benefits in one place.
 *   4. A closing FAQ info card explaining "What is a business cash advance
 *      credit card?" (the question that was buried in p-4) using a soft
 *      blue→orange gradient backdrop, matching the iter3 equipment-leasing
 *      closer style.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632) accents. Raleway titles / Open Sans body. No emojis
 * (Material Icons).
 *
 * Idempotent: re-running rewrites sec-7's children in place; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 797;
const TARGET_BLOCK_ID = 'sec-7';

const BENEFITS_HTML = `
<style>
  .cd-bc-why { max-width: 1140px; margin: 0 auto; }
  .cd-bc-why__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-bc-why__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 24px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-bc-why__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bc-why__icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-bc-why__card:nth-child(2) .cd-bc-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bc-why__card:nth-child(3) .cd-bc-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bc-why__card:nth-child(4) .cd-bc-why__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.4); }
  .cd-bc-why__icon .material-icons { font-size: 28px; }
  .cd-bc-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-bc-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  .cd-bc-why__faq { margin: 48px auto 0 auto; max-width: 880px; padding: 32px 36px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-bc-why__faq-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; background: #1c3370; color: #fff; border-radius: 999px; font-family: 'Raleway', sans-serif; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 14px 0; }
  .cd-bc-why__faq-q { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-bc-why__faq-a { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 1080px) {
    .cd-bc-why__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-bc-why__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bc-why__card { padding: 26px 22px; }
    .cd-bc-why__faq { padding: 24px 22px; }
  }
</style>
<div class="cd-bc-why">
  <div class="cd-bc-why__grid">
    <article class="cd-bc-why__card" data-repeat="benefits">
      <div class="cd-bc-why__icon"><span class="material-icons" data-field="icon">{{benefits.icon}}</span></div>
      <h4 class="cd-bc-why__card-title" data-field="title">{{benefits.title}}</h4>
      <p class="cd-bc-why__card-desc" data-field="desc">{{benefits.desc}}</p>
    </article>
  </div>
  <div class="cd-bc-why__faq">
    <div class="cd-bc-why__faq-tag"><span class="material-icons" style="font-size:14px">help_outline</span> <span data-field="faqTag">{{faqTag}}</span></div>
    <h4 class="cd-bc-why__faq-q" data-field="faqQ">{{faqQ}}</h4>
    <p class="cd-bc-why__faq-a" data-field="faqA">{{faqA}}</p>
  </div>
</div>
`.trim();

const BENEFITS_DEFAULTS = {
  benefits: [
    {
      icon: 'tune',
      title: 'Built for Your Business, Not a Box',
      desc: 'Cardiff isn’t a one-size-fits-all lender. We tailor our products and processes to small businesses that don’t fit traditional lending boxes — with adaptable, flexible capital.',
    },
    {
      icon: 'schedule',
      title: 'Funding on Your Timeline',
      desc: 'We offer funding solutions that meet your timeline — not the bank’s. Same-day decisions and as fast as same-day funding keep your business moving when opportunity strikes.',
    },
    {
      icon: 'insights',
      title: 'Judged on the Full Picture',
      desc: 'We don’t define your creditworthiness by rigid criteria. At Cardiff, we see the big picture — including real-time revenue and actual business performance, not just a credit score.',
    },
    {
      icon: 'refresh',
      title: 'Cash Advance + Revolving Credit',
      desc: 'Cardiff’s card combines the speed of a cash advance with the flexibility of a revolving line of credit — fast, efficient, and responsive to your revenue cycle.',
    },
  ],
  faqTag: 'Frequently Asked',
  faqQ: 'What is a business cash advance credit card, and how does it work?',
  faqA: 'A business cash advance credit card allows you short-term access to funds based on your card’s available credit. Unlike a traditional credit card purchase, the advance provides immediate cash to your business account. Cardiff provides this option for business owners who need fast working capital without applying for a separate loan.',
} as const;

const benefitsBlock = {
  id: 'sec-7-benefits',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: BENEFITS_HTML,
  fields: [
    {
      name: 'benefits',
      label: 'Benefits',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'tune' },
        { name: 'title', label: 'Title', type: 'text' as const },
        { name: 'desc', label: 'Description', type: 'textarea' as const },
      ],
    },
    { name: 'faqTag', label: 'FAQ tag', type: 'text', default: BENEFITS_DEFAULTS.faqTag },
    { name: 'faqQ', label: 'FAQ question', type: 'text', default: BENEFITS_DEFAULTS.faqQ },
    { name: 'faqA', label: 'FAQ answer', type: 'textarea', default: BENEFITS_DEFAULTS.faqA },
  ],
  values: {
    benefits: BENEFITS_DEFAULTS.benefits.map((b) => ({ ...b })),
    faqTag: BENEFITS_DEFAULTS.faqTag,
    faqQ: BENEFITS_DEFAULTS.faqQ,
    faqA: BENEFITS_DEFAULTS.faqA,
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

  // Widen so the 4-col card grid breathes; keep the soft blue-tinted
  // background already on this section.
  sec.maxWidth = '1200px';
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
    id: 'sec-7-title',
    order: 1,
    level: 2,
    content: 'Why Business Owners Choose Cardiff Over Traditional Banks',
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
    id: 'sec-7-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 28px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  const introBlock = {
    type: 'text' as const,
    id: 'sec-7-intro',
    order: 3,
    content:
      'For business owners who want capital without the red tape, Cardiff is a smarter path forward. Here’s how a Cardiff business credit card compares to traditional bank financing — and why thousands of small businesses choose us when speed and flexibility matter most.',
    style: {
      color: '#525f7f',
      fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '1.0625rem',
      lineHeight: '1.75',
      maxWidth: '820px',
      margin: '0 auto 48px auto',
      textAlign: 'center' as const,
    },
  };

  sec.blocks = [headerBlock, dividerBlock, introBlock, benefitsBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-7 -> styled intro + 4-benefit card grid (data-repeat="benefits") + FAQ closer.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
