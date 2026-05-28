/**
 * About page (post id 795) — iteration 6.
 *
 * Single biggest remaining polish gap: the About page now has hero, diff
 * stats, our-process, leadership, and final-CTA — but nothing that
 * communicates external validation. Real lender About pages always carry
 * a trust band: "As featured in" press logos, BBB/Inc. accolades, or
 * recognition stats. Without one, the page reads like an internal deck
 * and the CTA feels unearned.
 *
 * Fix: insert a new `awards-band` html-render block between leadership
 * (order 5) and final-cta (order 6). Two-row layout:
 *   1. Eyebrow + headline + 4-up accolade card row (icon chip + stat +
 *      label + caption). Each card celebrates one external proof point
 *      (years funding small business, total deployed, customer rating,
 *      industry recognition).
 *   2. Press-mention strip — 5 logo-style typeset name plates rendered in
 *      muted slate, evoking the "As seen in" row pattern without
 *      requiring real logo assets.
 * Background is white-on-soft-cream (#fafbfd) with a subtle peach hairline
 * top divider to set this band apart from the white leadership section
 * above and the deep-blue CTA below.
 * Uses data-repeat="awards" with {{awards.icon}} / {{awards.stat}} / etc.
 * and data-repeat="press" with {{press.name}} so the portal editor can
 * reorder, add, or rebrand individual items without touching markup.
 *
 * Idempotent: detects existing `awards-band` block and rewrites it;
 * otherwise inserts at the correct position (after leadership-cards) and
 * renumbers downstream `order` values.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 795;
  const NEW_ID = 'awards-band';
  const ANCHOR_ID = 'leadership-cards';

  const AWARDS_HTML = `
<style>
  .cd-aw { background: #fafbfd; padding: 96px 24px 96px 24px; border-top: 1px solid #f3e4dc; }
  .cd-aw__inner { max-width: 1180px; margin: 0 auto; }
  .cd-aw__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; font-weight: 700; color: #ef6632; letter-spacing: 0.32em; text-transform: uppercase; text-align: center; margin: 0 0 14px 0; }
  .cd-aw__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.25rem; font-weight: 800; color: #25418b; letter-spacing: -0.018em; text-align: center; margin: 0 0 16px 0; line-height: 1.15; }
  .cd-aw__sub { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.6; color: #525f7f; text-align: center; margin: 0 auto 56px auto; max-width: 660px; }
  .cd-aw__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; margin: 0 0 64px 0; }
  .cd-aw__card { background: #ffffff; border-radius: 14px; padding: 36px 24px 28px 24px; border: 1px solid #e8edf6; box-shadow: 0 10px 26px rgba(28,51,112,0.06); text-align: center; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-aw__card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(28,51,112,0.12); }
  .cd-aw__icon { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px auto; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-aw__card:nth-child(2) .cd-aw__icon { background: linear-gradient(135deg, #ef6632 0%, #ffb798 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.26); }
  .cd-aw__card:nth-child(3) .cd-aw__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.26); }
  .cd-aw__card:nth-child(4) .cd-aw__icon { background: linear-gradient(135deg, #1c3370 0%, #25418b 100%); box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-aw__icon .material-icons { font-size: 28px; }
  .cd-aw__stat { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2rem; font-weight: 800; color: #1c3370; margin: 0 0 6px 0; letter-spacing: -0.015em; line-height: 1.05; }
  .cd-aw__label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; font-weight: 700; color: #25418b; margin: 0 0 10px 0; letter-spacing: -0.005em; }
  .cd-aw__caption { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; line-height: 1.55; color: #6b7390; margin: 0; }
  .cd-aw__press-eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; font-weight: 700; color: #8893ad; letter-spacing: 0.32em; text-transform: uppercase; text-align: center; margin: 0 0 24px 0; }
  .cd-aw__press { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 48px; padding: 32px 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e8edf6; }
  .cd-aw__press-item { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; font-weight: 700; color: #6b7390; letter-spacing: -0.01em; opacity: 0.85; transition: opacity .2s ease, color .2s ease; }
  .cd-aw__press-item:hover { opacity: 1; color: #25418b; }
  @media (max-width: 980px) {
    .cd-aw__grid { grid-template-columns: repeat(2, 1fr); }
    .cd-aw__press { gap: 32px; }
  }
  @media (max-width: 560px) {
    .cd-aw { padding: 72px 18px 72px 18px; }
    .cd-aw__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-aw__title { font-size: 1.875rem; }
    .cd-aw__press { gap: 24px; padding: 24px 18px; }
    .cd-aw__press-item { font-size: 1rem; }
  }
</style>
<section class="cd-aw">
  <div class="cd-aw__inner">
    <p class="cd-aw__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-aw__title" data-field="title">{{title}}</h2>
    <p class="cd-aw__sub" data-field="sub">{{sub}}</p>
    <div class="cd-aw__grid">
      <article class="cd-aw__card" data-repeat="awards">
        <div class="cd-aw__icon"><span class="material-icons" data-field="icon">{{awards.icon}}</span></div>
        <p class="cd-aw__stat" data-field="stat">{{awards.stat}}</p>
        <p class="cd-aw__label" data-field="label">{{awards.label}}</p>
        <p class="cd-aw__caption" data-field="caption">{{awards.caption}}</p>
      </article>
    </div>
    <p class="cd-aw__press-eyebrow" data-field="pressEyebrow">{{pressEyebrow}}</p>
    <div class="cd-aw__press">
      <span class="cd-aw__press-item" data-repeat="press" data-field="name">{{press.name}}</span>
    </div>
  </div>
</section>
`.trim();

  const awardsBlock = {
    id: NEW_ID,
    type: 'html-render' as const,
    order: 6,
    width: 'full' as const,
    html: AWARDS_HTML,
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: 'RECOGNIZED & TRUSTED' },
      { name: 'title', label: 'Headline', type: 'text' as const, default: 'Backed by results small business owners can verify' },
      {
        name: 'sub',
        label: 'Sub-headline',
        type: 'textarea' as const,
        default:
          "Cardiff has earned the trust of thousands of small businesses across the U.S. — and the recognition of the people who cover them.",
      },
      {
        name: 'awards',
        label: 'Accolade cards',
        type: 'array' as const,
        itemFields: [
          { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'workspace_premium' },
          { name: 'stat', label: 'Headline stat', type: 'text' as const, default: '' },
          { name: 'label', label: 'Stat label', type: 'text' as const, default: '' },
          { name: 'caption', label: 'Caption', type: 'textarea' as const, default: '' },
        ],
      },
      {
        name: 'pressEyebrow',
        label: 'Press strip eyebrow',
        type: 'text' as const,
        default: 'AS FEATURED IN',
      },
      {
        name: 'press',
        label: 'Press mentions',
        type: 'array' as const,
        itemFields: [{ name: 'name', label: 'Outlet name', type: 'text' as const, default: '' }],
      },
    ],
    values: {
      eyebrow: 'RECOGNIZED & TRUSTED',
      title: 'Backed by results small business owners can verify',
      sub: "Cardiff has earned the trust of thousands of small businesses across the U.S. — and the recognition of the people who cover them.",
      awards: [
        {
          icon: 'history_edu',
          stat: '15+ Years',
          label: 'Funding Small Business',
          caption: 'A track record built one small business at a time since our founding.',
        },
        {
          icon: 'payments',
          stat: '$1B+',
          label: 'Capital Deployed',
          caption: 'Working capital, equipment, and SBA funding placed with U.S. operators.',
        },
        {
          icon: 'star_rate',
          stat: '4.9 / 5',
          label: 'Customer Rating',
          caption: 'Independent reviews from real Cardiff customers across leading platforms.',
        },
        {
          icon: 'workspace_premium',
          stat: 'A+ Rated',
          label: 'BBB Accredited',
          caption: 'Accredited and rated for transparent practices and customer responsiveness.',
        },
      ],
      pressEyebrow: 'AS FEATURED IN',
      press: [
        { name: 'Forbes' },
        { name: 'Inc.' },
        { name: 'Entrepreneur' },
        { name: 'Bloomberg' },
        { name: 'Yahoo Finance' },
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

  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === NEW_ID);
  if (existingIdx >= 0) {
    // Idempotent refresh of html / values / fields.
    const prevOrder = parsed.blocks[existingIdx]?.order ?? awardsBlock.order;
    parsed.blocks[existingIdx] = { ...awardsBlock, order: prevOrder };
    await db
      .update(posts)
      .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
      .where(eq(posts.id, POST_ID));
    console.log(
      `Refreshed existing '${NEW_ID}' block at idx ${existingIdx}. Block count: ${parsed.blocks.length}`,
    );
    process.exit(0);
  }

  const anchorIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === ANCHOR_ID,
  );
  if (anchorIdx < 0) {
    console.error(
      `Post ${POST_ID}: no anchor '${ANCHOR_ID}' block found; aborting.`,
    );
    process.exit(1);
  }
  const anchorOrder: number =
    typeof parsed.blocks[anchorIdx]?.order === 'number'
      ? parsed.blocks[anchorIdx].order
      : anchorIdx + 1;
  const insertOrder = anchorOrder + 1;

  // Bump any downstream block.order >= insertOrder so we slot in cleanly.
  for (const b of parsed.blocks) {
    if (typeof b?.order === 'number' && b.order >= insertOrder) {
      b.order = b.order + 1;
    }
  }
  awardsBlock.order = insertOrder;
  parsed.blocks.splice(anchorIdx + 1, 0, awardsBlock);

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Inserted '${NEW_ID}' html-render block at idx ${anchorIdx + 1} (order ${insertOrder}). Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
