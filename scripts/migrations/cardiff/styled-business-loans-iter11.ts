/**
 * Iter 11 — business-loans (post 800).
 *
 * Bug found in iter 9: `sec-9` ("Let's Fund Your Next Step") renders the
 * intro paragraph and CTA but the 3-card icon grid is missing. Root cause
 * is a name mismatch in the html-render template: the loop uses
 * `data-repeat="card"` + `{{card.icon|title|desc}}` (singular), but the
 * values object stores the array under `cards` (plural) and the field
 * schema also declares `cards`. `expandRepeats` looks up `values[name]`
 * where name comes from the `data-repeat` attribute — so it tries
 * `values.card` (undefined), expands to zero copies, and the grid renders
 * empty. Visually the band is the biggest remaining gap on the page: a
 * heading + paragraph + a lone button floating in a tall blue band.
 *
 * Fix: rewrite the `sec-9-fund` html-render block so both the template
 * and the schema/values agree on `cards`. Lift the proven shape from
 * iter10 (`data-repeat="items"` on the inner card element with
 * `{{items.icon|title|description}}`) and apply the same pattern here
 * with `cards`. Also tighten the CTA sub-copy and keep the same brand
 * gradient sequence (#25418b → #ef6632 → #5ac96f across cards 1/2/3).
 *
 * No other sections touched. Idempotent: finds `sec-9` → child
 * `sec-9-fund` and replaces its html/fields/values in place; safe to
 * re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 800;
const PARENT_SECTION_ID = 'sec-9';
const TARGET_BLOCK_ID = 'sec-9-fund';

const FUND_HTML = `
<style>
  .cd-bl-fund { max-width: 1140px; margin: 0 auto; }
  .cd-bl-fund__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-bl-fund__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-bl-fund__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-bl-fund__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bl-fund__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-bl-fund__card:nth-child(2) .cd-bl-fund__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bl-fund__card:nth-child(3) .cd-bl-fund__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bl-fund__icon .material-icons { font-size: 30px; }
  .cd-bl-fund__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-bl-fund__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-bl-fund__cta-wrap { margin: 52px auto 0 auto; text-align: center; }
  .cd-bl-fund__cta { display: inline-flex; align-items: center; gap: 10px; padding: 16px 36px; background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); color: #ffffff; text-decoration: none; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 700; letter-spacing: 0.02em; border-radius: 999px; box-shadow: 0 14px 30px rgba(239,102,50,0.32); transition: transform .25s ease, box-shadow .25s ease; }
  .cd-bl-fund__cta:hover { transform: translateY(-2px); box-shadow: 0 20px 40px rgba(239,102,50,0.42); }
  .cd-bl-fund__cta .material-icons { font-size: 20px; }
  .cd-bl-fund__cta-sub { margin: 16px auto 0 auto; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; color: #6b7794; max-width: 620px; line-height: 1.6; }
  @media (max-width: 980px) {
    .cd-bl-fund__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-bl-fund__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bl-fund__card { padding: 26px 22px; }
    .cd-bl-fund__cta { padding: 14px 28px; font-size: 0.9875rem; }
  }
</style>
<div class="cd-bl-fund">
  <p class="cd-bl-fund__intro" data-field="intro">{{intro}}</p>
  <div class="cd-bl-fund__grid">
    <div class="cd-bl-fund__card" data-repeat="cards">
      <div class="cd-bl-fund__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <h3 class="cd-bl-fund__card-title" data-field="title">{{cards.title}}</h3>
      <p class="cd-bl-fund__card-desc" data-field="desc">{{cards.desc}}</p>
    </div>
  </div>
  <div class="cd-bl-fund__cta-wrap">
    <a class="cd-bl-fund__cta" href="{{ctaHref}}">
      <span>{{ctaLabel}}</span>
      <span class="material-icons">arrow_forward</span>
    </a>
    <p class="cd-bl-fund__cta-sub" data-field="ctaSub">{{ctaSub}}</p>
  </div>
</div>
`.trim();

const FUND_DEFAULTS = {
  intro:
    'You’ve worked too hard at your business to be held back by funding gaps. With Cardiff, you don’t have to — our small business loans are designed to help you act quickly and confidently.',
  cards: [
    {
      icon: 'savings',
      title: 'Protect your cash',
      desc: 'Keep your personal savings intact and your emergency fund untouched while you fund the next move.',
    },
    {
      icon: 'credit_card_off',
      title: 'Skip the credit cards',
      desc: 'Avoid maxing out high-interest cards or burning a personal line of credit on a business expense.',
    },
    {
      icon: 'bolt',
      title: 'Move at business speed',
      desc: 'Same-day decisions and fast funding mean opportunities don’t sit waiting on a slow bank.',
    },
  ],
  ctaLabel: 'Apply Now',
  ctaHref: '/apply',
  ctaSub:
    'Ready to get a business loan that actually works for your business? Apply now to take the next step.',
} as const;

const fundBlock = {
  id: TARGET_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: FUND_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: FUND_DEFAULTS.intro },
    {
      name: 'cards',
      label: 'Benefit cards',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material Icon name', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'desc', label: 'Card description', type: 'textarea' },
      ],
      default: FUND_DEFAULTS.cards,
    },
    { name: 'ctaLabel', label: 'CTA button label', type: 'text', default: FUND_DEFAULTS.ctaLabel },
    { name: 'ctaHref', label: 'CTA href', type: 'text', default: FUND_DEFAULTS.ctaHref },
    { name: 'ctaSub', label: 'CTA sub-copy', type: 'textarea', default: FUND_DEFAULTS.ctaSub },
  ],
  values: JSON.parse(JSON.stringify(FUND_DEFAULTS)),
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

  const secIdx = parsed.blocks.findIndex((b: any) => b?.id === PARENT_SECTION_ID);
  if (secIdx === -1) {
    console.error(`Post ${POST_ID}: no section ${PARENT_SECTION_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[secIdx];
  if (sec.type !== 'section' || !Array.isArray(sec.blocks)) {
    console.error(`Post ${POST_ID}: ${PARENT_SECTION_ID} is not a section with children; aborting`);
    process.exit(1);
  }

  const childIdx = sec.blocks.findIndex((c: any) => c?.id === TARGET_BLOCK_ID);
  if (childIdx === -1) {
    console.error(`Post ${POST_ID}: no child ${TARGET_BLOCK_ID} in ${PARENT_SECTION_ID}; aborting`);
    process.exit(1);
  }

  const originalOrder = sec.blocks[childIdx]?.order;
  if (typeof originalOrder === 'number') {
    fundBlock.order = originalOrder;
  }
  sec.blocks[childIdx] = fundBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: rebuilt ${PARENT_SECTION_ID}/${TARGET_BLOCK_ID} — fixed data-repeat="cards" mismatch so the 3 benefit cards render.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
