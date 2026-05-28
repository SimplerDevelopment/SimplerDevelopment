/**
 * Iter 9 — business-cash-advance / merchant-cash-advance (post 824).
 *
 * Gap vs cardiff.co/business-cash-advance/: the original page's single most
 * recognisable signature directly under the hero is a row of THREE floating
 * stat cards ($12 Billion+ Funded, 5 Minute Approvals, Same Day Funds) that
 * straddle the hero/intro section boundary — circular blue stat icons, white
 * cards, soft shadow. On our local merchant-cash-advance port the hero drops
 * straight into the long "Working Capital for Your Needs" prose, missing that
 * proof-strip beat entirely.
 *
 * This iter inserts a new top-level html-render block `bca-stat-strip` between
 * `hero-merchant-cash-advance` and `sec-1-2col`. The strip uses negative
 * top-margin so the three cards visually overlap the bottom of the hero (the
 * cardiff.co treatment), then leaves comfortable breathing room before the
 * intro band.
 *
 * Brand palette only: #1c3370 / #25418b deep blue, #ef6632 / #ffb798 orange,
 * #5ac96f green. Raleway titles + Open Sans body. Material Icons (no emojis).
 *
 * Idempotent: keyed by block id `bca-stat-strip`. Re-running rewrites the
 * existing block in place (including its values) and leaves block ordering
 * sequential.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 824;
const STRIP_BLOCK_ID = 'bca-stat-strip';
const HERO_BLOCK_ID = 'hero-merchant-cash-advance';

const STRIP_HTML = `
<style>
  .cd-bca-strip { background: transparent; padding: 0 24px; margin: -64px auto 32px auto; max-width: 1200px; position: relative; z-index: 5; }
  .cd-bca-strip__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-bca-strip__card { background: #ffffff; border-radius: 14px; padding: 28px 28px 26px 28px; box-shadow: 0 18px 48px rgba(28, 51, 112, 0.16); display: flex; align-items: center; gap: 22px; min-height: 132px; transition: transform .25s ease, box-shadow .25s ease; border: 1px solid #eef2fa; }
  .cd-bca-strip__card:hover { transform: translateY(-3px); box-shadow: 0 22px 56px rgba(28, 51, 112, 0.20); }
  .cd-bca-strip__icon { flex: 0 0 auto; width: 72px; height: 72px; border-radius: 999px; background: linear-gradient(135deg, #b9c8e8 0%, #8ea4d1 100%); color: #1c3370; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 4px rgba(28, 51, 112, 0.06); }
  .cd-bca-strip__card:nth-child(2) .cd-bca-strip__icon { background: linear-gradient(135deg, #c9d8ff 0%, #9ab3ed 100%); color: #25418b; }
  .cd-bca-strip__card:nth-child(3) .cd-bca-strip__icon { background: linear-gradient(135deg, #ffd9c6 0%, #f6a584 100%); color: #ef6632; }
  .cd-bca-strip__icon .material-icons { font-size: 38px; }
  .cd-bca-strip__body { flex: 1 1 auto; min-width: 0; }
  .cd-bca-strip__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.375rem; font-weight: 800; color: #25418b; margin: 0 0 6px 0; letter-spacing: -0.01em; line-height: 1.2; }
  .cd-bca-strip__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.55; color: #525f7f; margin: 0; }
  @media (max-width: 960px) {
    .cd-bca-strip { margin-top: -40px; }
    .cd-bca-strip__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-bca-strip__card { padding: 22px 22px; min-height: 0; }
    .cd-bca-strip__icon { width: 60px; height: 60px; }
    .cd-bca-strip__icon .material-icons { font-size: 32px; }
    .cd-bca-strip__title { font-size: 1.2rem; }
  }
  @media (max-width: 560px) {
    .cd-bca-strip { margin-top: -24px; padding: 0 16px; }
  }
</style>
<section class="cd-bca-strip">
  <div class="cd-bca-strip__grid">
    <div class="cd-bca-strip__card" data-repeat="stats">
      <div class="cd-bca-strip__icon"><span class="material-icons" data-field="icon">{{stats.icon}}</span></div>
      <div class="cd-bca-strip__body">
        <h3 class="cd-bca-strip__title" data-field="title">{{stats.title}}</h3>
        <p class="cd-bca-strip__desc" data-field="description">{{stats.description}}</p>
      </div>
    </div>
  </div>
</section>
`.trim();

const STRIP_DEFAULTS = [
  {
    icon: 'workspace_premium',
    title: '$12 Billion+ Funded',
    description: 'Over 21 years, we have funded over $12 Billion for small businesses.',
  },
  {
    icon: 'verified',
    title: '5 Minute Approvals',
    description: 'Know how much funding you can get within 5 minutes of applying.',
  },
  {
    icon: 'attach_money',
    title: 'Same Day Funds',
    description: 'With our online process, we can provide funds within 24 hours of approval.',
  },
];

const stripBlock = {
  id: STRIP_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 2,
  html: STRIP_HTML,
  fields: [
    {
      name: 'stats',
      label: 'Proof-strip cards (icon + title + description)',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Stat headline', type: 'text' },
        { name: 'description', label: 'Stat description', type: 'textarea' },
      ],
      default: STRIP_DEFAULTS,
    },
  ],
  values: { stats: STRIP_DEFAULTS },
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

  // Idempotency: drop any prior copy of the strip.
  parsed.blocks = parsed.blocks.filter((b: any) => b?.id !== STRIP_BLOCK_ID);

  // Insert after the hero. If hero missing, prepend.
  const heroIdx = parsed.blocks.findIndex((b: any) => b?.id === HERO_BLOCK_ID);
  const insertAt = heroIdx === -1 ? 0 : heroIdx + 1;
  parsed.blocks.splice(insertAt, 0, stripBlock);

  // Re-sequence `order` across top-level blocks (1-based).
  parsed.blocks.forEach((b: any, i: number) => {
    if (b && typeof b === 'object') b.order = i + 1;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: inserted/refreshed ${STRIP_BLOCK_ID} between hero and sec-1-2col.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
