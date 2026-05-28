/**
 * Iter 7 — Auto Repair page (post 805).
 *
 * Biggest remaining unstyled section: sec-6 "What Can You Fund at Your Auto
 * Repair Shop?" — currently a bare lead paragraph + a 7-item `<ul>` of bullets
 * + a closing sentence. The bullets are concrete, visual use-cases (lifts,
 * payroll, parts, build-outs, marketing, software) — perfect material for the
 * iter3 icon-card grid recipe, but driven via `data-repeat="uses"` so all 7
 * cards share one template.
 *
 * Fix:
 *   1. Widen sec-6 maxWidth (880px -> 1200px) and tint the band (#f6f9fc) so
 *      the card grid breathes and visually separates from neighboring text
 *      sections.
 *   2. Replace sec-6.blocks with [centered H2 + orange divider + html-render
 *      grid block `sec-6-uses-grid`]. Grid uses `data-repeat="uses"` with
 *      `{{uses.icon}}` / `{{uses.title}}` / `{{uses.body}}` so editors can add
 *      / remove / reorder cards without touching HTML.
 *
 * Idempotent: re-running overwrites sec-6.blocks wholesale and re-applies the
 * widened section style.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 805;
const TARGET_BLOCK_ID = 'sec-6';
const GRID_BLOCK_ID = 'sec-6-uses-grid';

const USES_HTML = `
<style>
  .cd-ar-uses { max-width: 1140px; margin: 0 auto; }
  .cd-ar-uses__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 48px auto; }
  .cd-ar-uses__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
  .cd-ar-uses__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-ar-uses__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-ar-uses__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-ar-uses__card:nth-child(2) .cd-ar-uses__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-ar-uses__card:nth-child(3) .cd-ar-uses__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-ar-uses__card:nth-child(5) .cd-ar-uses__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.4); }
  .cd-ar-uses__card:nth-child(6) .cd-ar-uses__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-ar-uses__card:nth-child(7) .cd-ar-uses__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-ar-uses__icon .material-icons { font-size: 30px; }
  .cd-ar-uses__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.15rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-ar-uses__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-ar-uses__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-ar-uses__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-ar-uses__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-ar-uses__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-ar-uses__card { padding: 26px 22px; }
    .cd-ar-uses__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-ar-uses">
  <p class="cd-ar-uses__intro" data-field="intro">{{intro}}</p>
  <div class="cd-ar-uses__grid">
    <div class="cd-ar-uses__card" data-repeat="uses">
      <div class="cd-ar-uses__icon"><span class="material-icons" data-field="icon">{{uses.icon}}</span></div>
      <h3 class="cd-ar-uses__card-title" data-field="title">{{uses.title}}</h3>
      <p class="cd-ar-uses__card-desc" data-field="body">{{uses.body}}</p>
    </div>
  </div>
  <div class="cd-ar-uses__closer">
    <p class="cd-ar-uses__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const USES_DEFAULTS = {
  intro:
    "Our funding solutions cover a variety of business needs — but knowing exactly what you want the money to do for your shop (and how that improvement shows up in your numbers) maximizes the value of your financing. Auto repair shop loans are best put to work on projects that directly support production and revenue:",
  uses: [
    {
      icon: 'precision_manufacturing',
      title: 'Shop equipment',
      body:
        'Upgrade, add, repair, or replace lifts, compressors, alignment systems, and diagnostic platforms so every bay stays productive.',
    },
    {
      icon: 'payments',
      title: 'Payroll & ramp-up',
      body:
        'Cover payroll gaps and the ramp-up period when new technicians are still working toward full billable hours.',
    },
    {
      icon: 'engineering',
      title: 'Specialty technicians',
      body:
        'Hire a specialty tech to expand the services you offer and capture work you currently have to turn away.',
    },
    {
      icon: 'inventory_2',
      title: 'Parts inventory',
      body:
        'Stock up on common parts or bridge the gap when you have to order specialty parts on behalf of a customer.',
    },
    {
      icon: 'home_repair_service',
      title: 'Facility upgrades',
      body:
        'Fund bay build-outs, shop layout improvements, and waiting-room upgrades that make your shop work harder for staff and customers.',
    },
    {
      icon: 'campaign',
      title: 'Marketing & visibility',
      body:
        'Promote the business with vehicle wraps, partnerships with local businesses, and a stronger online reviews presence.',
    },
    {
      icon: 'memory',
      title: 'Shop management software',
      body:
        'Optimize and upgrade your shop management system so scheduling, parts, and invoicing run smoother across the team.',
    },
  ],
  closer:
    'If the expense can stabilize operations, improve service cycle time, attract more customers, or increase capacity, it makes sense to seek financing for it.',
} as const;

const usesGridBlock = {
  id: GRID_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: USES_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: USES_DEFAULTS.intro },
    {
      name: 'uses',
      label: 'Funding use cases',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' as const },
        { name: 'title', label: 'Card title', type: 'text' as const },
        { name: 'body', label: 'Card body', type: 'textarea' as const },
      ],
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: USES_DEFAULTS.closer },
  ],
  values: {
    intro: USES_DEFAULTS.intro,
    uses: [...USES_DEFAULTS.uses],
    closer: USES_DEFAULTS.closer,
  },
};

const headerBlock = {
  type: 'heading' as const,
  id: 'sec-6-title',
  order: 1,
  level: 2,
  content: 'What Can You Fund at Your Auto Repair Shop?',
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
  id: 'sec-6-div',
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

  // Widen so the 3-col card grid breathes; tint to separate from text bands.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  sec.blocks = [headerBlock, dividerBlock, usesGridBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-6 -> styled 7-card "What Can You Fund" grid via data-repeat.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
