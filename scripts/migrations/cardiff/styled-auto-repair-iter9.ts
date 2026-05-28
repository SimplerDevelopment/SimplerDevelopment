/**
 * Iter 9 — Auto Repair page (post 805).
 *
 * Remaining unstyled gap: sec-4 "Why Funding Matters for Auto Shop Stability
 * and Growth" — currently a centered heading + orange divider + four bare
 * prose paragraphs (cash crunch / productivity ripple / fast response /
 * growth decisions). Four distinct ideas that read like a wall of body
 * copy. Natural fit for the iter7/iter8 icon-card grid recipe driven by
 * `data-repeat="reasons"` so editors can add / remove / reorder reasons
 * without touching HTML.
 *
 * Fix:
 *   1. Widen sec-4 maxWidth (880px -> 1200px) and switch the band to
 *      #ffffff so it visually separates from the tinted neighbor sec-3
 *      (#f6f9fc) above.
 *   2. Replace sec-4.blocks with [centered H2 + orange divider + html-render
 *      grid block `sec-4-reasons-grid`]. Grid uses `data-repeat="reasons"`
 *      with `{{reasons.icon}}` / `{{reasons.title}}` / `{{reasons.body}}`.
 *
 * Idempotent: re-running overwrites sec-4.blocks wholesale and re-applies
 * the widened section style.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 805;
const TARGET_BLOCK_ID = 'sec-4';
const GRID_BLOCK_ID = 'sec-4-reasons-grid';

const REASONS_HTML = `
<style>
  .cd-ar-why { max-width: 1140px; margin: 0 auto; }
  .cd-ar-why__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 48px auto; }
  .cd-ar-why__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-ar-why__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-ar-why__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-ar-why__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-ar-why__card:nth-child(2) .cd-ar-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-ar-why__card:nth-child(3) .cd-ar-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-ar-why__card:nth-child(4) .cd-ar-why__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.4); }
  .cd-ar-why__icon .material-icons { font-size: 30px; }
  .cd-ar-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.15rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-ar-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-ar-why__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-ar-why__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 1080px) {
    .cd-ar-why__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-ar-why__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-ar-why__card { padding: 26px 22px; }
    .cd-ar-why__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-ar-why">
  <p class="cd-ar-why__intro" data-field="intro">{{intro}}</p>
  <div class="cd-ar-why__grid">
    <div class="cd-ar-why__card" data-repeat="reasons">
      <div class="cd-ar-why__icon"><span class="material-icons" data-field="icon">{{reasons.icon}}</span></div>
      <h3 class="cd-ar-why__card-title" data-field="title">{{reasons.title}}</h3>
      <p class="cd-ar-why__card-desc" data-field="body">{{reasons.body}}</p>
    </div>
  </div>
  <div class="cd-ar-why__closer">
    <p class="cd-ar-why__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const REASONS_DEFAULTS = {
  intro:
    "Cash flow gaps don't stay contained in your back office — they ripple through parts orders, payroll, customer service, and the growth bets you wanted to make next quarter. Here's how the right funding keeps every layer of your shop steady.",
  reasons: [
    {
      icon: 'warning',
      title: 'Contain the cash crunch',
      body:
        'When working capital is tight, parts arrive late, payroll feels heavy, and equipment breakages stall the bay. Funding closes the gap before it becomes a problem.',
    },
    {
      icon: 'reviews',
      title: 'Protect productivity and reputation',
      body:
        'Slow service drags into slow weeks, and customers feel the efficiency drop first. The right capital keeps throughput steady so your loyal clients keep coming back.',
    },
    {
      icon: 'flash_on',
      title: 'Respond fast, not later',
      body:
        'Instead of delaying an equipment upgrade or stretching supplier payments, fast funding lets you act when the work shows up — and keep operating like a serious shop.',
    },
    {
      icon: 'trending_up',
      title: 'Shape your growth decisions',
      body:
        'Hiring another tech or moving into higher-margin services takes capital that respects day-to-day pressures. The right loan matches real shop life so you can grow without risking what you built.',
    },
  ],
  closer:
    'Funding matters most when timing matters most. Cardiff structures small business loans for auto repair shops around the pressures you actually face — so stability and growth stop trading off against each other.',
} as const;

const reasonsGridBlock = {
  id: GRID_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: REASONS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: REASONS_DEFAULTS.intro },
    {
      name: 'reasons',
      label: 'Why-funding-matters reasons',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' as const },
        { name: 'title', label: 'Card title', type: 'text' as const },
        { name: 'body', label: 'Card body', type: 'textarea' as const },
      ],
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: REASONS_DEFAULTS.closer },
  ],
  values: {
    intro: REASONS_DEFAULTS.intro,
    reasons: [...REASONS_DEFAULTS.reasons],
    closer: REASONS_DEFAULTS.closer,
  },
};

const headerBlock = {
  type: 'heading' as const,
  id: 'sec-4-title',
  order: 1,
  level: 2,
  content: 'Why Funding Matters for Auto Shop Stability and Growth',
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
  id: 'sec-4-div',
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

  // Widen so the 4-col card grid breathes; switch to white to break up the
  // tinted neighbor sec-3 (#f6f9fc) above.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#ffffff',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  sec.blocks = [headerBlock, dividerBlock, reasonsGridBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-4 -> styled 4-card "Why Funding Matters" grid via data-repeat.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
