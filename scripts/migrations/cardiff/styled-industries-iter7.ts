/**
 * Iter 7: Industries hub (post id 818) — insert a "How to Apply" 3-step
 * section BEFORE the FAQ. Final polish for the page.
 *
 * Iters 1-6 produced: minimal hero -> 4-up trust band -> 10 alternating
 * industry strips -> 6-item FAQ accordion. The page currently jumps from
 * deep-dive industry strips straight into objection-handling Q&A with no
 * concrete "here is what doing business with us looks like" beat. A
 * visitor who has been convinced their industry is supported, and who has
 * had their objections answered, still has nowhere to go — the FAQ is the
 * terminal block and there is no narrated path from "I'm interested" to
 * "I've applied."
 *
 * This iter inserts ONE new block — `industries-how-to-apply`
 * (html-render) — between the industry strips (idx 2) and the FAQ
 * (idx 3), so the new flow is:
 *   hero -> trust -> strips -> HOW TO APPLY -> faq
 *
 * The block is a 3-step numbered process with a stat-row footer + CTA.
 * Pattern is the same as the per-product "how to apply" sections used on
 * equipment-leasing-iter4 / mca-iter8 / sba-iter10 / working-capital-iter4
 * / business-cards-iter6, but adapted to the industries-hub context where
 * the steps reference "your industry" instead of a specific product.
 *
 * Uses `data-repeat="steps"` with `{{steps.field}}` placeholders so the
 * editor can re-order, add, or remove steps without code edits. Brand
 * palette only (#1c3370 / #25418b / #5ac96f / #ef6632) — Material Icons
 * for the numbered chips, Raleway titles, Open Sans body.
 *
 * Idempotent: detects existing `industries-how-to-apply` by id;
 * rewrites html + fields if present (preserving user-edited values when
 * the steps array shape is intact), otherwise inserts at the correct
 * position (before FAQ, after strips). Re-sequences `order` across all
 * blocks so the editor stays tidy. Safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 818;
const APPLY_BLOCK_ID = 'industries-how-to-apply';
const FAQ_BLOCK_ID = 'industries-faq';

const APPLY_HTML = `
<style>
  .cd-ind-apply {
    background: linear-gradient(180deg, #ffffff 0%, #f6f9fc 100%);
    padding: 80px 24px 88px 24px;
    border-top: 1px solid #e6ecf5;
  }
  .cd-ind-apply__inner { max-width: 1140px; margin: 0 auto; }
  .cd-ind-apply__eyebrow {
    text-align: center;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #ef6632;
    margin: 0 0 10px 0;
  }
  .cd-ind-apply__title {
    text-align: center;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 2.125rem;
    font-weight: 800;
    color: #1c3370;
    letter-spacing: -0.015em;
    line-height: 1.18;
    margin: 0 auto 12px auto;
    max-width: 760px;
  }
  .cd-ind-apply__sub {
    text-align: center;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.0625rem;
    color: #525f7f;
    line-height: 1.65;
    margin: 0 auto 48px auto;
    max-width: 680px;
  }
  .cd-ind-apply__steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    position: relative;
  }
  .cd-ind-apply__step {
    background: #ffffff;
    border: 1px solid #e6ecf5;
    border-radius: 14px;
    padding: 32px 28px 28px 28px;
    box-shadow: 0 10px 26px rgba(28,51,112,0.06);
    position: relative;
    display: flex;
    flex-direction: column;
    transition: transform .25s ease, box-shadow .25s ease;
  }
  .cd-ind-apply__step:hover {
    transform: translateY(-4px);
    box-shadow: 0 18px 38px rgba(28,51,112,0.10);
  }
  .cd-ind-apply__num {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    background: linear-gradient(135deg, #25418b 0%, #1c3370 100%);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.25rem;
    font-weight: 800;
    box-shadow: 0 8px 18px rgba(28,51,112,0.22);
    margin-bottom: 20px;
    letter-spacing: -0.01em;
  }
  .cd-ind-apply__step:nth-child(2) .cd-ind-apply__num {
    background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%);
    box-shadow: 0 8px 18px rgba(239,102,50,0.28);
  }
  .cd-ind-apply__step:nth-child(3) .cd-ind-apply__num {
    background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%);
    box-shadow: 0 8px 18px rgba(58,168,86,0.28);
  }
  .cd-ind-apply__step-icon {
    color: #25418b;
    margin-bottom: 14px;
  }
  .cd-ind-apply__step-icon .material-icons { font-size: 28px; }
  .cd-ind-apply__step:nth-child(2) .cd-ind-apply__step-icon { color: #ef6632; }
  .cd-ind-apply__step:nth-child(3) .cd-ind-apply__step-icon { color: #3aa856; }
  .cd-ind-apply__step-title {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.1875rem;
    font-weight: 800;
    color: #1c3370;
    letter-spacing: -0.005em;
    line-height: 1.25;
    margin: 0 0 10px 0;
  }
  .cd-ind-apply__step-desc {
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.9375rem;
    line-height: 1.65;
    color: #525f7f;
    margin: 0 0 14px 0;
  }
  .cd-ind-apply__step-meta {
    margin-top: auto;
    padding-top: 14px;
    border-top: 1px solid #eef2f8;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #25418b;
  }
  .cd-ind-apply__step-meta .material-icons { font-size: 16px; color: #5ac96f; }
  .cd-ind-apply__cta {
    margin: 48px auto 0 auto;
    max-width: 720px;
    text-align: center;
    padding: 32px 36px;
    background: linear-gradient(135deg, #1c3370 0%, #25418b 100%);
    border-radius: 14px;
    box-shadow: 0 16px 40px rgba(28,51,112,0.22);
  }
  .cd-ind-apply__cta-text {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.25rem;
    font-weight: 700;
    color: #ffffff;
    margin: 0 0 18px 0;
    line-height: 1.35;
    letter-spacing: -0.005em;
  }
  .cd-ind-apply__cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: #ef6632;
    color: #ffffff;
    text-decoration: none;
    padding: 14px 30px;
    border-radius: 8px;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    box-shadow: 0 8px 20px rgba(239,102,50,0.32);
    transition: transform .2s ease, box-shadow .2s ease, background .2s ease;
  }
  .cd-ind-apply__cta-btn:hover {
    transform: translateY(-2px);
    background: #d8501e;
    box-shadow: 0 12px 28px rgba(239,102,50,0.42);
  }
  .cd-ind-apply__cta-btn .material-icons { font-size: 20px; }
  @media (max-width: 980px) {
    .cd-ind-apply__steps { grid-template-columns: 1fr; gap: 18px; }
  }
  @media (max-width: 620px) {
    .cd-ind-apply { padding: 60px 16px 68px 16px; }
    .cd-ind-apply__title { font-size: 1.75rem; }
    .cd-ind-apply__sub { font-size: 1rem; }
    .cd-ind-apply__step { padding: 26px 22px 22px 22px; }
    .cd-ind-apply__cta { padding: 24px 22px; }
    .cd-ind-apply__cta-text { font-size: 1.0625rem; }
  }
</style>
<section class="cd-ind-apply">
  <div class="cd-ind-apply__inner">
    <p class="cd-ind-apply__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-ind-apply__title" data-field="title">{{title}}</h2>
    <p class="cd-ind-apply__sub" data-field="subtitle">{{subtitle}}</p>
    <div class="cd-ind-apply__steps">
      <div class="cd-ind-apply__step" data-repeat="steps">
        <div class="cd-ind-apply__num" data-field="num">{{steps.num}}</div>
        <div class="cd-ind-apply__step-icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
        <h3 class="cd-ind-apply__step-title" data-field="title">{{steps.title}}</h3>
        <p class="cd-ind-apply__step-desc" data-field="desc">{{steps.desc}}</p>
        <div class="cd-ind-apply__step-meta">
          <span class="material-icons">schedule</span>
          <span data-field="meta">{{steps.meta}}</span>
        </div>
      </div>
    </div>
    <div class="cd-ind-apply__cta">
      <p class="cd-ind-apply__cta-text" data-field="ctaText">{{ctaText}}</p>
      <a class="cd-ind-apply__cta-btn" data-field="ctaHref" href="{{ctaHref}}">
        <span data-field="ctaLabel">{{ctaLabel}}</span>
        <span class="material-icons">arrow_forward</span>
      </a>
    </div>
  </div>
</section>
`.trim();

const APPLY_DEFAULTS = {
  eyebrow: 'GETTING STARTED',
  title: 'How to apply, no matter your industry.',
  subtitle:
    "Three short steps and a same-day decision. The application is free, won't impact your credit, and takes most owners under five minutes to complete.",
  steps: [
    {
      num: '1',
      icon: 'edit_note',
      title: 'Tell us about your business',
      desc: "Submit a one-page online application with your industry, time in business, and average monthly revenue. No tax returns or collateral required to get started.",
      meta: 'Under 5 minutes',
    },
    {
      num: '2',
      icon: 'fact_check',
      title: 'Get matched to your best fit',
      desc: "A funding specialist reviews your file the same business day and quotes a range across the products your business qualifies for — working capital, equipment, SBA, or revenue-based.",
      meta: 'Same-day decision',
    },
    {
      num: '3',
      icon: 'account_balance',
      title: 'Sign and get funded',
      desc: "Pick the offer that fits your cash-flow plan, sign electronically, and your funds wire directly into your business account so you can put them to work.",
      meta: 'As fast as 24-72 hours',
    },
  ],
  ctaText: 'Ready to see what your industry qualifies for?',
  ctaLabel: 'Start your application',
  ctaHref: '/apply',
};

const applyBlock = {
  id: APPLY_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 999, // re-sequenced below
  html: APPLY_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: APPLY_DEFAULTS.eyebrow },
    { name: 'title', label: 'Title', type: 'textarea' as const, default: APPLY_DEFAULTS.title },
    { name: 'subtitle', label: 'Subtitle', type: 'textarea' as const, default: APPLY_DEFAULTS.subtitle },
    {
      name: 'steps',
      label: 'Steps',
      type: 'array' as const,
      itemFields: [
        { name: 'num', label: 'Step number', type: 'text' as const, default: '' },
        { name: 'icon', label: 'Material icon name', type: 'text' as const, default: '' },
        { name: 'title', label: 'Step title', type: 'text' as const, default: '' },
        { name: 'desc', label: 'Step description', type: 'textarea' as const, default: '' },
        { name: 'meta', label: 'Footer meta (timing)', type: 'text' as const, default: '' },
      ],
      default: APPLY_DEFAULTS.steps,
    },
    { name: 'ctaText', label: 'CTA headline', type: 'textarea' as const, default: APPLY_DEFAULTS.ctaText },
    { name: 'ctaLabel', label: 'CTA button label', type: 'text' as const, default: APPLY_DEFAULTS.ctaLabel },
    { name: 'ctaHref', label: 'CTA button href', type: 'text' as const, default: APPLY_DEFAULTS.ctaHref },
  ],
  values: { ...APPLY_DEFAULTS },
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
    (b: { id?: string }) => b?.id === APPLY_BLOCK_ID,
  );

  let action: 'inserted' | 'updated';

  if (existingIdx !== -1) {
    const existing = parsed.blocks[existingIdx];
    parsed.blocks[existingIdx] = {
      ...existing,
      type: 'html-render',
      width: 'full',
      html: APPLY_HTML,
      fields: applyBlock.fields,
      values:
        existing.values &&
        Array.isArray(existing.values.steps) &&
        existing.values.steps.length > 0
          ? existing.values
          : applyBlock.values,
    };
    action = 'updated';
  } else {
    // Insert before the FAQ block so flow is:
    //   hero -> trust -> strips -> apply -> faq
    const faqIdx = parsed.blocks.findIndex(
      (b: { id?: string }) => b?.id === FAQ_BLOCK_ID,
    );
    if (faqIdx === -1) {
      // No FAQ found; just append.
      parsed.blocks.push(applyBlock);
    } else {
      parsed.blocks.splice(faqIdx, 0, applyBlock);
    }
    action = 'inserted';
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
    `Post ${POST_ID}: ${action} "${APPLY_BLOCK_ID}" 3-step apply section. Block count now: ${parsed.blocks.length}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
