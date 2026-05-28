/**
 * Iter 8 — Auto Repair page (post 805).
 *
 * Remaining unstyled gap: sec-7 "Cardiff's Fast and Flexible Approval
 * Criteria" — currently a centered heading + orange divider + two bare lead
 * paragraphs. The first paragraph enumerates 5 distinct evaluation signals
 * (time in business, revenue consistency, bank activity, credit profile,
 * intended use of funds) — natural fit for the iter7 icon-card grid recipe
 * driven by `data-repeat="criteria"` so editors can add / remove / reorder
 * criteria without touching HTML. The second paragraph (5-min advisor call,
 * same-day funding) becomes the closer band.
 *
 * Fix:
 *   1. Widen sec-7 maxWidth (880px -> 1200px) and tint the band (#ffffff) so
 *      it visually separates from the neighboring tinted sec-6 / sec-8.
 *   2. Replace sec-7.blocks with [centered H2 + orange divider + html-render
 *      grid block `sec-7-criteria-grid`]. Grid uses `data-repeat="criteria"`
 *      with `{{criteria.icon}}` / `{{criteria.title}}` / `{{criteria.body}}`.
 *
 * Idempotent: re-running overwrites sec-7.blocks wholesale and re-applies the
 * widened section style.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 805;
const TARGET_BLOCK_ID = 'sec-7';
const GRID_BLOCK_ID = 'sec-7-criteria-grid';

const CRITERIA_HTML = `
<style>
  .cd-ar-crit { max-width: 1140px; margin: 0 auto; }
  .cd-ar-crit__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 48px auto; }
  .cd-ar-crit__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
  .cd-ar-crit__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-ar-crit__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-ar-crit__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-ar-crit__card:nth-child(2) .cd-ar-crit__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-ar-crit__card:nth-child(3) .cd-ar-crit__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-ar-crit__card:nth-child(4) .cd-ar-crit__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.4); }
  .cd-ar-crit__card:nth-child(5) .cd-ar-crit__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-ar-crit__icon .material-icons { font-size: 30px; }
  .cd-ar-crit__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.15rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-ar-crit__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-ar-crit__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-ar-crit__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-ar-crit__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-ar-crit__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-ar-crit__card { padding: 26px 22px; }
    .cd-ar-crit__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-ar-crit">
  <p class="cd-ar-crit__intro" data-field="intro">{{intro}}</p>
  <div class="cd-ar-crit__grid">
    <div class="cd-ar-crit__card" data-repeat="criteria">
      <div class="cd-ar-crit__icon"><span class="material-icons" data-field="icon">{{criteria.icon}}</span></div>
      <h3 class="cd-ar-crit__card-title" data-field="title">{{criteria.title}}</h3>
      <p class="cd-ar-crit__card-desc" data-field="body">{{criteria.body}}</p>
    </div>
  </div>
  <div class="cd-ar-crit__closer">
    <p class="cd-ar-crit__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const CRITERIA_DEFAULTS = {
  intro:
    "Cardiff evaluates a focused set of signals — gathered through a streamlined application and a secure Plaid connection to your bank account — so we can match auto repair shop owners with the right funding fast.",
  criteria: [
    {
      icon: 'event_available',
      title: 'Time in business',
      body:
        'How long your shop has been operating, so we can match your tenure to the right funding products and terms.',
    },
    {
      icon: 'trending_up',
      title: 'Revenue consistency',
      body:
        'Steady monthly revenue tells us your shop can comfortably support the repayment schedule we put in front of you.',
    },
    {
      icon: 'account_balance',
      title: 'Bank activity',
      body:
        'A Plaid connection to your business bank account gives us a real-time view of deposits, cash flow, and day-to-day operations.',
    },
    {
      icon: 'verified_user',
      title: 'Credit profile',
      body:
        'We consider your credit history, but it is one signal among many — not a single threshold that decides your application.',
    },
    {
      icon: 'flag',
      title: 'Intended use of funds',
      body:
        'Knowing whether the capital is for equipment, payroll, parts, or growth helps us recommend the product structure that fits.',
    },
  ],
  closer:
    'After applying, you may hear from a Cardiff loan advisor in less than five minutes — and qualified shops can often secure capital the same day, with human support that matches your timeline.',
} as const;

const criteriaGridBlock = {
  id: GRID_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: CRITERIA_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: CRITERIA_DEFAULTS.intro },
    {
      name: 'criteria',
      label: 'Approval criteria',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' as const },
        { name: 'title', label: 'Card title', type: 'text' as const },
        { name: 'body', label: 'Card body', type: 'textarea' as const },
      ],
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: CRITERIA_DEFAULTS.closer },
  ],
  values: {
    intro: CRITERIA_DEFAULTS.intro,
    criteria: [...CRITERIA_DEFAULTS.criteria],
    closer: CRITERIA_DEFAULTS.closer,
  },
};

const headerBlock = {
  type: 'heading' as const,
  id: 'sec-7-title',
  order: 1,
  level: 2,
  content: "Cardiff’s Fast and Flexible Approval Criteria",
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
  id: 'sec-7-div',
  order: 2,
  content:
    '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
  style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(
      `Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`,
    );
    process.exit(1);
  }

  // Widen so the 3-col card grid breathes; use white to break up the
  // tinted neighbors (sec-6 #f6f9fc, sec-8 #f6f9fc).
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#ffffff',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  sec.blocks = [headerBlock, dividerBlock, criteriaGridBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-7 -> styled 5-card "Approval Criteria" grid via data-repeat.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
