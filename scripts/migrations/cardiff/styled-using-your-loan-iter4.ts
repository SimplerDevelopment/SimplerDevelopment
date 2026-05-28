/**
 * Using Your Loan (post 835) — iteration 4.
 *
 * Single biggest remaining gap after iter3: the page now reads
 *   hero -> uses-band (Make Your Business Better) -> apply-steps (Three Steps)
 *   -> final-cta (dark navy CTA).
 *
 * What's still missing is cardiff.co's signature *proof / trust moment*. Every
 * other Cardiff page — equipment-leasing, sba-loans, trucking, the homepage
 * itself — punctuates the journey from "what you can do" to "now apply" with
 * a stat band (e.g. $12 Billion+ Funded / 5 Minute Approvals / Same Day
 * Funds / 21 Years In Business). Without one, the page asks the reader to
 * jump straight from a generic 3-step process into a dark CTA with no
 * evidence to back the ask. That's the exact friction the "Borrow Better"
 * voice is supposed to remove.
 *
 * Fix: insert ONE consolidated html-render slab `trust-stats` between
 * `apply-steps` and `final-cta` — a soft-tinted 4-tile stat row carrying
 * the canonical cardiff.co metrics, styled to match the iter2/iter3 brand
 * vocabulary (Raleway + Open Sans, orange eyebrow + divider, navy headings,
 * stat numerals in deep blue with green and orange accents on alternating
 * tiles to echo the brand palette). Uses `data-repeat="stats"` so the
 * portal editor can add/remove tiles without code changes.
 *
 * Idempotent: looks for the already-migrated `trust-stats` id and rewrites
 * in place; otherwise splices it between `apply-steps` and `final-cta` and
 * renumbers subsequent block orders. Safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 835;
  const NEW_ID = 'trust-stats';

  const STATS_HTML = `
<style>
  .cd-stats { background: linear-gradient(180deg, #f6f9fc 0%, #eef3fb 100%); padding: 88px 24px 88px 24px; position: relative; overflow: hidden; }
  .cd-stats::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent 0%, #d9e1f2 18%, #d9e1f2 82%, transparent 100%); }
  .cd-stats::after { content: ""; position: absolute; bottom: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent 0%, #d9e1f2 18%, #d9e1f2 82%, transparent 100%); }
  .cd-stats__inner { max-width: 1180px; margin: 0 auto; position: relative; }
  .cd-stats__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; font-weight: 700; color: #ef6632; letter-spacing: 0.32em; text-transform: uppercase; text-align: center; margin: 0 0 14px 0; }
  .cd-stats__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.25rem; font-weight: 800; color: #1c3370; letter-spacing: -0.018em; text-align: center; margin: 0 0 16px 0; line-height: 1.15; }
  .cd-stats__divider { width: 56px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 28px auto; }
  .cd-stats__intro { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #525f7f; text-align: center; margin: 0 auto 56px auto; max-width: 720px; }
  .cd-stats__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-stats__tile { position: relative; background: #ffffff; border-radius: 18px; padding: 36px 26px 30px 26px; border: 1px solid #e8edf6; box-shadow: 0 12px 32px rgba(28,51,112,0.07); text-align: center; overflow: hidden; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-stats__tile:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.14); }
  .cd-stats__tile::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #25418b 0%, #1c3370 100%); }
  .cd-stats__tile:nth-child(2)::before { background: linear-gradient(90deg, #ef6632 0%, #ffb798 100%); }
  .cd-stats__tile:nth-child(3)::before { background: linear-gradient(90deg, #5ac96f 0%, #3aa856 100%); }
  .cd-stats__tile:nth-child(4)::before { background: linear-gradient(90deg, #25418b 0%, #1c3370 100%); }
  .cd-stats__icon { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, rgba(37,65,139,0.10) 0%, rgba(28,51,112,0.16) 100%); margin: 0 auto 18px auto; }
  .cd-stats__tile:nth-child(2) .cd-stats__icon { background: linear-gradient(135deg, rgba(239,102,50,0.12) 0%, rgba(255,183,152,0.22) 100%); }
  .cd-stats__tile:nth-child(3) .cd-stats__icon { background: linear-gradient(135deg, rgba(90,201,111,0.14) 0%, rgba(58,168,86,0.22) 100%); }
  .cd-stats__icon .material-icons { color: #25418b; font-size: 28px; }
  .cd-stats__tile:nth-child(2) .cd-stats__icon .material-icons { color: #ef6632; }
  .cd-stats__tile:nth-child(3) .cd-stats__icon .material-icons { color: #3aa856; }
  .cd-stats__num { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 2.125rem; color: #1c3370; letter-spacing: -0.025em; line-height: 1.05; margin: 0 0 10px 0; }
  .cd-stats__label { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.6; color: #525f7f; margin: 0; }
  .cd-stats__closer { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.7; color: #525f7f; text-align: center; margin: 48px auto 0 auto; max-width: 760px; }
  .cd-stats__closer strong { color: #1c3370; font-weight: 700; }
  @media (max-width: 980px) {
    .cd-stats__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-stats { padding: 64px 18px 64px 18px; }
    .cd-stats__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-stats__title { font-size: 1.875rem; }
    .cd-stats__num { font-size: 1.875rem; }
    .cd-stats__tile { padding: 28px 22px 24px 22px; }
  }
</style>
<section class="cd-stats">
  <div class="cd-stats__inner">
    <p class="cd-stats__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-stats__title" data-field="title">{{title}}</h2>
    <div class="cd-stats__divider" aria-hidden="true"></div>
    <p class="cd-stats__intro" data-field="intro">{{intro}}</p>
    <div class="cd-stats__grid">
      <article class="cd-stats__tile" data-repeat="stats">
        <div class="cd-stats__icon"><span class="material-icons" data-field="icon">{{stats.icon}}</span></div>
        <div class="cd-stats__num" data-field="num">{{stats.num}}</div>
        <p class="cd-stats__label" data-field="label">{{stats.label}}</p>
      </article>
    </div>
    <p class="cd-stats__closer" data-field="closer">{{closer}}</p>
  </div>
</section>
`.trim();

  const statsBlock = {
    id: NEW_ID,
    type: 'html-render' as const,
    order: 4,
    width: 'full' as const,
    html: STATS_HTML,
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: 'WHY BUSINESSES BORROW WITH CARDIFF' },
      { name: 'title', label: 'Headline', type: 'text' as const, default: 'Capital You Can Count On' },
      {
        name: 'intro',
        label: 'Intro paragraph',
        type: 'textarea' as const,
        default:
          'Twenty-one years funding small businesses across every state — the numbers behind the loans you are about to put to work.',
      },
      {
        name: 'stats',
        label: 'Stat tiles',
        type: 'array' as const,
        itemFields: [
          { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'savings' },
          { name: 'num', label: 'Headline number', type: 'text' as const, default: '$12B+' },
          { name: 'label', label: 'Supporting label', type: 'textarea' as const, default: 'Funded to small businesses' },
        ],
      },
      {
        name: 'closer',
        label: 'Closing line',
        type: 'textarea' as const,
        default:
          'Whether you are restocking inventory, smoothing payroll, or bridging a slow month — <strong>Cardiff has funded a business like yours, probably this week</strong>.',
      },
    ],
    values: {
      eyebrow: 'WHY BUSINESSES BORROW WITH CARDIFF',
      title: 'Capital You Can Count On',
      intro:
        'Twenty-one years funding small businesses across every state — the numbers behind the loans you are about to put to work.',
      stats: [
        {
          icon: 'savings',
          num: '$12B+',
          label: 'Funded to small businesses over 21 years',
        },
        {
          icon: 'bolt',
          num: '5 Min',
          label: 'Average time from application to a real approval decision',
        },
        {
          icon: 'event_available',
          num: 'Same Day',
          label: 'Funds typically wired to your account once you are approved',
        },
        {
          icon: 'verified',
          num: '$250K',
          label: 'Unsecured capital available — no collateral, no minimum credit score',
        },
      ],
      closer:
        'Whether you are restocking inventory, smoothing payroll, or bridging a slow month — <strong>Cardiff has funded a business like yours, probably this week</strong>.',
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

  // Idempotency: if trust-stats already exists, just rewrite it in place.
  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === NEW_ID);
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = { ...statsBlock, order: parsed.blocks[existingIdx].order ?? 4 };
    await db
      .update(posts)
      .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
      .where(eq(posts.id, POST_ID));
    console.log(
      `Updated post ${POST_ID}: refreshed existing '${NEW_ID}' (idx ${existingIdx}). Block count: ${parsed.blocks.length}`,
    );
    process.exit(0);
  }

  // First-time migration: insert between apply-steps and final-cta.
  const stepsIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'apply-steps');
  const ctaIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'final-cta');
  if (stepsIdx < 0 || ctaIdx < 0) {
    console.error(
      `Post ${POST_ID}: expected both 'apply-steps' (got idx ${stepsIdx}) and 'final-cta' (got idx ${ctaIdx})`,
    );
    process.exit(1);
  }
  const stepsOrder = (parsed.blocks[stepsIdx].order as number) ?? 3;
  const insertAt = stepsIdx + 1;
  parsed.blocks.splice(insertAt, 0, { ...statsBlock, order: stepsOrder + 1 });
  // Bump every subsequent block's order so final-cta still trails.
  for (let i = insertAt + 1; i < parsed.blocks.length; i++) {
    parsed.blocks[i].order = (parsed.blocks[insertAt].order as number) + (i - insertAt);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: inserted '${NEW_ID}' at idx ${insertAt}. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
