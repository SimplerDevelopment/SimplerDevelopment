/**
 * About page (post id 795) — iteration 4.
 *
 * Single biggest remaining gap: the "Cardiff Difference" stats band
 * (blocks[1], a generic `section` wrapping a `card-grid`) is the only
 * section on the page still rendered through the editor's primitive
 * stack while the surrounding hero / leadership / final-cta have all
 * been rebuilt as cohesive `html-render` slabs. Visually it shows up
 * as: inconsistent padding above + below the band, the 4-stat grid
 * collapses to muddy 2x2 spacing on tablet, the peach top-bar accent
 * is hidden behind the generic Card component's hover halo, and the
 * "21+ / 12B+ / <24H / 93%" digits render in body weight instead of
 * the chunky Raleway display weight the rest of the site uses.
 *
 * Fix: replace blocks[1] with a single `html-render` block that bakes
 * the eyebrow + headline + sub + 4-card stat grid into one branded
 * slab. Each card has the peach top-bar accent (#ef6632 → #ffb798
 * gradient), Material Icon chip, big Raleway value, and Open Sans
 * description. Repeats over `stats` with `data-repeat="stats"` so the
 * portal editor can add/remove stats without touching markup.
 *
 * Idempotent: aborts unless blocks[1].id === 'diff' OR
 * 'diff-band' (already-migrated marker). Re-running just refreshes
 * the html/values.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 795;
  const NEW_ID = 'diff-band';

  const DIFF_HTML = `
<style>
  .cd-diff { background: #f6f9fc; padding: 96px 24px 96px 24px; }
  .cd-diff__inner { max-width: 1180px; margin: 0 auto; }
  .cd-diff__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; font-weight: 700; color: #ef6632; letter-spacing: 0.32em; text-transform: uppercase; text-align: center; margin: 0 0 14px 0; }
  .cd-diff__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.25rem; font-weight: 800; color: #25418b; letter-spacing: -0.018em; text-align: center; margin: 0 0 16px 0; line-height: 1.15; }
  .cd-diff__sub { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.6; color: #525f7f; text-align: center; margin: 0 auto 56px auto; max-width: 640px; }
  .cd-diff__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
  .cd-diff__card { position: relative; background: #ffffff; border-radius: 16px; padding: 40px 28px 32px 28px; border: 1px solid #e8edf6; box-shadow: 0 12px 32px rgba(28,51,112,0.08); text-align: center; overflow: hidden; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-diff__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.14); }
  .cd-diff__card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #ef6632 0%, #ffb798 100%); }
  .cd-diff__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px auto; background: linear-gradient(135deg, rgba(239,102,50,0.14) 0%, rgba(37,65,139,0.06) 100%); color: #25418b; }
  .cd-diff__icon .material-icons { font-size: 28px; }
  .cd-diff__value { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.75rem; font-weight: 800; color: #25418b; letter-spacing: -0.025em; line-height: 1; margin: 0 0 12px 0; }
  .cd-diff__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.55; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-diff__grid { grid-template-columns: repeat(2, 1fr); gap: 20px; }
  }
  @media (max-width: 560px) {
    .cd-diff { padding: 72px 18px 72px 18px; }
    .cd-diff__grid { grid-template-columns: 1fr; }
    .cd-diff__title { font-size: 1.875rem; }
    .cd-diff__value { font-size: 2.25rem; }
  }
</style>
<section class="cd-diff">
  <div class="cd-diff__inner">
    <p class="cd-diff__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-diff__title" data-field="title">{{title}}</h2>
    <p class="cd-diff__sub" data-field="sub">{{sub}}</p>
    <div class="cd-diff__grid">
      <article class="cd-diff__card" data-repeat="stats">
        <div class="cd-diff__icon"><span class="material-icons" data-field="icon">{{stats.icon}}</span></div>
        <p class="cd-diff__value" data-field="value">{{stats.value}}</p>
        <p class="cd-diff__desc" data-field="desc">{{stats.desc}}</p>
      </article>
    </div>
  </div>
</section>
`.trim();

  const diffBandBlock = {
    id: NEW_ID,
    type: 'html-render' as const,
    order: 3,
    width: 'full' as const,
    html: DIFF_HTML,
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: 'THE CARDIFF DIFFERENCE' },
      { name: 'title', label: 'Headline', type: 'text' as const, default: 'Real numbers. Real impact.' },
      {
        name: 'sub',
        label: 'Sub-headline',
        type: 'textarea' as const,
        default: "Here's why thousands of businesses choose Cardiff.",
      },
      {
        name: 'stats',
        label: 'Stats',
        type: 'array' as const,
        itemFields: [
          { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'history' },
          { name: 'value', label: 'Value', type: 'text' as const },
          { name: 'desc', label: 'Description', type: 'textarea' as const },
        ],
      },
    ],
    values: {
      eyebrow: 'THE CARDIFF DIFFERENCE',
      title: 'Real numbers. Real impact.',
      sub: "Here's why thousands of businesses choose Cardiff.",
      stats: [
        {
          icon: 'history',
          value: '21+',
          desc: 'More than two decades supporting Main Street.',
        },
        {
          icon: 'payments',
          value: '$12B+',
          desc: 'Over $12 Billion funded to thousands of small businesses.',
        },
        {
          icon: 'schedule',
          value: '<24H',
          desc: 'Approvals in minutes. Funding the same day.',
        },
        {
          icon: 'verified',
          value: '93%',
          desc: 'Over 90% of applicants are approved for small business financing.',
        },
      ],
    },
  };

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
  const diffIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === 'diff' || b?.id === NEW_ID,
  );
  if (diffIdx < 0) {
    console.error(`Post ${POST_ID}: no diff / ${NEW_ID} block found; aborting`);
    process.exit(1);
  }
  const wasId = parsed.blocks[diffIdx]?.id;
  parsed.blocks[diffIdx] = diffBandBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced '${wasId}' (idx ${diffIdx}) with '${NEW_ID}' html-render. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
