/**
 * Iteration 7: Newsroom page (post id 826) — add a "Newsroom by the Numbers"
 * stats band (id `sec-2c`) between sec-2b (Browse-by-Topic icon grid) and
 * sec-3 (Cardiff In The Media press-mentions list).
 *
 * Why this polish, not another tweak elsewhere:
 *   - iter1–6 covered hero, featured-news split, latest-news list, topic grid,
 *     press-mentions, and the press-contact band. The page now has *content*
 *     for every section a credible newsroom needs — but it has zero
 *     credibility data. Press pages on Block, Stripe, SBA, and Plaid all
 *     include a "by the numbers" band: years operating, customers funded,
 *     dollars deployed, media appearances. That stat band is what makes a
 *     reporter actually trust the rest of the page.
 *   - It also breaks up the page's "wall of cards" rhythm: sec-2 (news cards)
 *     → sec-2b (topic cards) → sec-3 (press logo wall) → sec-3b (press
 *     contact card) is four card-flavored sections in a row. A single
 *     full-bleed dark stats band on brand navy gives the eye a rest and
 *     visually re-anchors the page in Cardiff's identity before pivoting to
 *     the press wall.
 *
 * Pattern reused: the `data-repeat` stats-card pattern from
 *   `styled-equipment-leasing-iter3.ts` (icon-chip + value + label cards),
 *   plus the navy gradient backdrop language from iter6's press-contact
 *   block so the two dark bands feel like a deliberate pair flanking the
 *   light press wall.
 *
 * Inside `data-repeat="stats"` we use `{{stats.value}}` / `{{stats.label}}`
 * / `{{stats.icon}}` / `{{stats.suffix}}` per the project's repeater
 * templating convention.
 *
 * Idempotent: detects existing block with id `sec-2c` and rewrites it in
 *   place; otherwise inserts after sec-2b and re-numbers `order`.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 826;
const NEW_SECTION_ID = 'sec-2c';
const INSERT_AFTER_ID = 'sec-2b';

const STATS_HTML = `
<style>
  .cd-stats { padding: 64px 24px 68px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; background-image: radial-gradient(ellipse at 20% 0%, rgba(56,92,192,0.40) 0%, transparent 60%), linear-gradient(135deg, #1c3370 0%, #25418b 65%, #1c3370 100%); position: relative; overflow: hidden; }
  .cd-stats::after { content: ''; position: absolute; right: -120px; bottom: -120px; width: 360px; height: 360px; background: radial-gradient(circle, rgba(90,201,111,0.18) 0%, rgba(90,201,111,0) 65%); pointer-events: none; }
  .cd-stats__inner { max-width: 1180px; margin: 0 auto; position: relative; z-index: 1; }
  .cd-stats__head { text-align: center; max-width: 720px; margin: 0 auto 44px auto; }
  .cd-stats__eyebrow { font-family: 'Raleway', sans-serif; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.16em; color: #ffb798; text-transform: uppercase; margin: 0 0 12px 0; }
  .cd-stats__title { font-family: 'Raleway', sans-serif; font-size: 2rem; font-weight: 800; color: #ffffff; line-height: 1.2; letter-spacing: -0.014em; margin: 0 0 14px 0; }
  .cd-stats__sub { font-family: 'Open Sans', sans-serif; font-size: 1rem; line-height: 1.65; color: rgba(255,255,255,0.82); margin: 0; }
  .cd-stats__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
  .cd-stats__card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; padding: 28px 24px 26px 24px; backdrop-filter: blur(4px); transition: transform .25s ease, background .25s ease; }
  .cd-stats__card:hover { transform: translateY(-3px); background: rgba(255,255,255,0.09); }
  .cd-stats__icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.30); }
  .cd-stats__card:nth-child(2) .cd-stats__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.32); }
  .cd-stats__card:nth-child(3) .cd-stats__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.32); }
  .cd-stats__card:nth-child(4) .cd-stats__icon { background: linear-gradient(135deg, #385cc0 0%, #25418b 100%); box-shadow: 0 8px 18px rgba(56,92,192,0.34); }
  .cd-stats__icon .material-icons { font-size: 22px; color: #ffffff; }
  .cd-stats__value-row { display: flex; align-items: baseline; gap: 4px; margin: 0 0 6px 0; }
  .cd-stats__value { font-family: 'Raleway', sans-serif; font-size: 2.4rem; font-weight: 800; color: #ffffff; line-height: 1; letter-spacing: -0.025em; }
  .cd-stats__suffix { font-family: 'Raleway', sans-serif; font-size: 1.4rem; font-weight: 800; color: #ffb798; line-height: 1; letter-spacing: -0.01em; }
  .cd-stats__label { font-family: 'Open Sans', sans-serif; font-size: 0.92rem; line-height: 1.45; color: rgba(255,255,255,0.78); margin: 0; }
  @media (max-width: 980px) {
    .cd-stats__grid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .cd-stats__title { font-size: 1.65rem; }
  }
  @media (max-width: 520px) {
    .cd-stats { padding: 48px 16px 52px 16px; }
    .cd-stats__grid { grid-template-columns: 1fr; }
    .cd-stats__value { font-size: 2.1rem; }
  }
</style>
<section class="cd-stats">
  <div class="cd-stats__inner">
    <div class="cd-stats__head">
      <p class="cd-stats__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
      <h2 class="cd-stats__title" data-field="title">{{title}}</h2>
      <p class="cd-stats__sub" data-field="sub">{{sub}}</p>
    </div>
    <div class="cd-stats__grid">
      <div class="cd-stats__card" data-repeat="stats">
        <div class="cd-stats__icon"><span class="material-icons">{{stats.icon}}</span></div>
        <div class="cd-stats__value-row">
          <span class="cd-stats__value">{{stats.value}}</span><span class="cd-stats__suffix">{{stats.suffix}}</span>
        </div>
        <p class="cd-stats__label">{{stats.label}}</p>
      </div>
    </div>
  </div>
</section>
`.trim();

const STATS_DEFAULTS = {
  eyebrow: 'NEWSROOM BY THE NUMBERS',
  title: 'A decade of headlines, funded by real Main Street wins.',
  sub: 'Cardiff has been the lender behind thousands of small-business stories. Here is the scale that reporters, analysts, and partners reference our team for.',
  stats: [
    { icon: 'event', value: '12', suffix: '+', label: 'Years funding small businesses across all 50 states.' },
    { icon: 'storefront', value: '40k', suffix: '+', label: 'Small businesses funded since Cardiff was founded.' },
    { icon: 'payments', value: '$2.1', suffix: 'B+', label: 'Total capital deployed to Main Street operators.' },
    { icon: 'campaign', value: '180', suffix: '+', label: 'Media features, op-eds, and analyst citations.' },
  ],
} as const;

const statsBlock = {
  id: NEW_SECTION_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 5, // placeholder — recomputed in main()
  html: STATS_HTML,
  style: {
    backgroundColor: '#1c3370',
  },
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: STATS_DEFAULTS.eyebrow },
    { name: 'title', label: 'Title', type: 'text', default: STATS_DEFAULTS.title },
    { name: 'sub', label: 'Subtitle', type: 'textarea', default: STATS_DEFAULTS.sub },
    {
      name: 'stats',
      label: 'Stats cards',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'value', label: 'Value', type: 'text' },
        { name: 'suffix', label: 'Suffix (e.g. +, B+, %)', type: 'text' },
        { name: 'label', label: 'Label', type: 'textarea' },
      ],
    },
  ],
  values: {
    eyebrow: STATS_DEFAULTS.eyebrow,
    title: STATS_DEFAULTS.title,
    sub: STATS_DEFAULTS.sub,
    stats: STATS_DEFAULTS.stats.map((s) => ({ ...s })),
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
  const blocks: any[] = parsed.blocks;

  const existingIdx = blocks.findIndex((b) => b?.id === NEW_SECTION_ID);
  const anchorIdx = blocks.findIndex((b) => b?.id === INSERT_AFTER_ID);
  if (anchorIdx === -1) {
    console.error(`Post ${POST_ID}: anchor block ${INSERT_AFTER_ID} not found`);
    process.exit(1);
  }

  if (existingIdx !== -1) {
    const prevOrder = blocks[existingIdx].order;
    blocks[existingIdx] = { ...statsBlock, order: prevOrder };
    console.log(`Rewrote existing ${NEW_SECTION_ID} block at index ${existingIdx} (order ${prevOrder}).`);
  } else {
    blocks.splice(anchorIdx + 1, 0, statsBlock);
    blocks.forEach((b, i) => {
      b.order = i + 1;
    });
    console.log(`Inserted ${NEW_SECTION_ID} after ${INSERT_AFTER_ID}; re-numbered ${blocks.length} block orders.`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID} (iter7): Newsroom by the Numbers stats band in place.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
