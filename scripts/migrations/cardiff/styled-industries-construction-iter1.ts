/**
 * Iter 1 (industries-construction, post 806): Replace the bare stats stack in
 * sec-1 with a polished 3-up icon stats card band that matches the canonical
 * cardiff.co pattern (the "$X Funded / Min Approvals / Same Day Funds" band
 * that sits directly under the hero on every industry page on cardiff.co).
 *
 * Local "before": sec-1 is four bare heading/paragraph pairs ("5.99%",
 * "82,000", "39 Months", "84%") — flat, no card treatment, no icons, no
 * visual structure. It reads as raw text below the hero.
 *
 * Cardiff.co "match": three lifted white cards in a single row, each with a
 * circular brand-blue gradient icon chip (Material Icons), bold deep-blue
 * stat, and short caption underneath. The band sits on a subtle deep-blue
 * tinted backdrop so it visually anchors the hero.
 *
 * Brand palette only — deep blue #1c3370 / #25418b, green #5ac96f,
 * orange #ef6632. Raleway headings, Open Sans body. Material Icons (no
 * emojis ever).
 *
 * Renderer quirk note: data-repeat on a grid container would collapse the
 * grid to 1-col; this script hard-codes 3 tile siblings inside ONE grid
 * container instead. Safe.
 *
 * Idempotent: rewrites sec-1's children (heading + divider + stats html-
 * render) on every run. Safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 806;
const TARGET_BLOCK_ID = 'sec-1';

const STATS_HTML = `
<style>
  .cd-cn-stats { max-width: 1140px; margin: 0 auto; }
  .cd-cn-stats__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-cn-stats__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 36px 32px; box-shadow: 0 14px 34px rgba(28,51,112,0.07); display: flex; align-items: center; gap: 22px; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-cn-stats__card:hover { transform: translateY(-4px); box-shadow: 0 22px 50px rgba(28,51,112,0.13); }
  .cd-cn-stats__icon { flex: 0 0 auto; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 10px 22px rgba(28,51,112,0.24); }
  .cd-cn-stats__card:nth-child(2) .cd-cn-stats__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.28); }
  .cd-cn-stats__card:nth-child(3) .cd-cn-stats__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.28); }
  .cd-cn-stats__icon .material-icons { font-size: 32px; }
  .cd-cn-stats__body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .cd-cn-stats__stat { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.75rem; font-weight: 800; color: #1c3370; letter-spacing: -0.015em; line-height: 1.15; margin: 0; }
  .cd-cn-stats__label { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.5; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-cn-stats__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-cn-stats__card { padding: 28px 24px; }
  }
</style>
<div class="cd-cn-stats">
  <div class="cd-cn-stats__grid">
    <div class="cd-cn-stats__card">
      <div class="cd-cn-stats__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <div class="cd-cn-stats__body">
        <p class="cd-cn-stats__stat" data-field="stat1">{{stat1}}</p>
        <p class="cd-cn-stats__label" data-field="label1">{{label1}}</p>
      </div>
    </div>
    <div class="cd-cn-stats__card">
      <div class="cd-cn-stats__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <div class="cd-cn-stats__body">
        <p class="cd-cn-stats__stat" data-field="stat2">{{stat2}}</p>
        <p class="cd-cn-stats__label" data-field="label2">{{label2}}</p>
      </div>
    </div>
    <div class="cd-cn-stats__card">
      <div class="cd-cn-stats__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <div class="cd-cn-stats__body">
        <p class="cd-cn-stats__stat" data-field="stat3">{{stat3}}</p>
        <p class="cd-cn-stats__label" data-field="label3">{{label3}}</p>
      </div>
    </div>
  </div>
</div>
`.trim();

const STATS_DEFAULTS = {
  icon1: 'paid',
  stat1: '$12 Billion+ Funded',
  label1: '21 years funding small and mid-size construction businesses nationwide.',
  icon2: 'schedule',
  stat2: '5 Minute Approvals',
  label2: 'Most contractors can get approved within five minutes of applying.',
  icon3: 'event_available',
  stat3: 'Same-Day Funds',
  label3: 'Qualified jobs can be funded within 24 hours of approval.',
} as const;

const statsBlock = {
  id: 'sec-1-stats',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: STATS_HTML,
  fields: [
    { name: 'icon1', label: 'Card 1 — icon', type: 'text', default: STATS_DEFAULTS.icon1 },
    { name: 'stat1', label: 'Card 1 — stat', type: 'text', default: STATS_DEFAULTS.stat1 },
    { name: 'label1', label: 'Card 1 — caption', type: 'textarea', default: STATS_DEFAULTS.label1 },
    { name: 'icon2', label: 'Card 2 — icon', type: 'text', default: STATS_DEFAULTS.icon2 },
    { name: 'stat2', label: 'Card 2 — stat', type: 'text', default: STATS_DEFAULTS.stat2 },
    { name: 'label2', label: 'Card 2 — caption', type: 'textarea', default: STATS_DEFAULTS.label2 },
    { name: 'icon3', label: 'Card 3 — icon', type: 'text', default: STATS_DEFAULTS.icon3 },
    { name: 'stat3', label: 'Card 3 — stat', type: 'text', default: STATS_DEFAULTS.stat3 },
    { name: 'label3', label: 'Card 3 — caption', type: 'textarea', default: STATS_DEFAULTS.label3 },
  ],
  values: { ...STATS_DEFAULTS },
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content as unknown as string);
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

  // Subtle blue-tinted backdrop so the stats band visually anchors below the
  // dark-blue hero. Match cardiff.co padding/anchor feel.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '64px',
    paddingBottom: '64px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  sec.blocks = [statsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-1 -> styled 3-up stats band (Funded / Approvals / Same-Day).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
