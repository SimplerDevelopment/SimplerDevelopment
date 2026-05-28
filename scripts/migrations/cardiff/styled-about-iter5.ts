/**
 * About page (post id 795) — iteration 5.
 *
 * Single biggest remaining gap: the source cardiff.co/about page has an
 * "Our Process" 5-step explainer (Apply Online -> Get Approved -> Withdraw
 * Funds -> Repayment -> Renew Your Funding) — one of the most iconic
 * sections on the site, present on home and reused on About. Our port is
 * missing it entirely (only 4 blocks: hero, diff stats, leadership, CTA),
 * leaving a jarring jump from "by the numbers" straight into team bios
 * with no explanation of *how* the funding journey actually works.
 *
 * Fix: insert a new `process-steps` html-render block between the diff
 * stats band (order 3) and the leadership cards (order 4). 5-up numbered
 * icon-card grid with Material Icon chip, step number badge, title, and
 * description. Connecting line behind the row on desktop reinforces
 * the sequence. Background is white-on-soft-peach (#fff7f2) to break
 * up the alternating-section rhythm and pull the peach accent through.
 * Uses data-repeat="steps" with {{steps.icon}} / {{steps.title}} / etc.
 * so the portal editor can reorder or add steps without touching markup.
 *
 * Idempotent: detects existing `process-steps` block and rewrites it;
 * otherwise inserts at the correct position (after diff-band) and
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
  const NEW_ID = 'process-steps';
  const ANCHOR_ID = 'diff-band';

  const PROCESS_HTML = `
<style>
  .cd-proc { background: linear-gradient(180deg, #fff7f2 0%, #ffffff 100%); padding: 96px 24px 96px 24px; }
  .cd-proc__inner { max-width: 1200px; margin: 0 auto; }
  .cd-proc__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; font-weight: 700; color: #ef6632; letter-spacing: 0.32em; text-transform: uppercase; text-align: center; margin: 0 0 14px 0; }
  .cd-proc__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.25rem; font-weight: 800; color: #25418b; letter-spacing: -0.018em; text-align: center; margin: 0 0 16px 0; line-height: 1.15; }
  .cd-proc__sub { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.6; color: #525f7f; text-align: center; margin: 0 auto 64px auto; max-width: 660px; }
  .cd-proc__grid { position: relative; display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px; }
  .cd-proc__grid::before { content: ""; position: absolute; top: 36px; left: 10%; right: 10%; height: 2px; background: repeating-linear-gradient(90deg, #ffb798 0 8px, transparent 8px 16px); z-index: 0; }
  .cd-proc__card { position: relative; z-index: 1; background: #ffffff; border-radius: 16px; padding: 32px 22px 28px 22px; border: 1px solid #f0e2da; box-shadow: 0 12px 30px rgba(28,51,112,0.07); text-align: center; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-proc__card:hover { transform: translateY(-4px); box-shadow: 0 20px 44px rgba(28,51,112,0.13); }
  .cd-proc__num { width: 28px; height: 28px; border-radius: 50%; background: #25418b; color: #fff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; font-weight: 800; display: flex; align-items: center; justify-content: center; position: absolute; top: -14px; left: 50%; transform: translateX(-50%); box-shadow: 0 4px 12px rgba(28,51,112,0.28); }
  .cd-proc__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 8px auto 18px auto; background: linear-gradient(135deg, #ef6632 0%, #ffb798 100%); color: #ffffff; box-shadow: 0 8px 18px rgba(239,102,50,0.26); }
  .cd-proc__icon .material-icons { font-size: 28px; }
  .cd-proc__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-proc__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9rem; line-height: 1.6; color: #525f7f; margin: 0; }
  @media (max-width: 1080px) {
    .cd-proc__grid { grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .cd-proc__grid::before { display: none; }
  }
  @media (max-width: 720px) {
    .cd-proc__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 480px) {
    .cd-proc { padding: 72px 18px 72px 18px; }
    .cd-proc__grid { grid-template-columns: 1fr; gap: 28px; }
    .cd-proc__title { font-size: 1.875rem; }
  }
</style>
<section class="cd-proc">
  <div class="cd-proc__inner">
    <p class="cd-proc__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-proc__title" data-field="title">{{title}}</h2>
    <p class="cd-proc__sub" data-field="sub">{{sub}}</p>
    <div class="cd-proc__grid">
      <article class="cd-proc__card" data-repeat="steps">
        <span class="cd-proc__num" data-field="num">{{steps.num}}</span>
        <div class="cd-proc__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
        <h3 class="cd-proc__card-title" data-field="title">{{steps.title}}</h3>
        <p class="cd-proc__card-desc" data-field="desc">{{steps.desc}}</p>
      </article>
    </div>
  </div>
</section>
`.trim();

  const processBlock = {
    id: NEW_ID,
    type: 'html-render' as const,
    order: 4,
    width: 'full' as const,
    html: PROCESS_HTML,
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: 'HOW IT WORKS' },
      { name: 'title', label: 'Headline', type: 'text' as const, default: 'Our Process' },
      {
        name: 'sub',
        label: 'Sub-headline',
        type: 'textarea' as const,
        default: 'Apply once, move fast, and grow with funding designed around your business.',
      },
      {
        name: 'steps',
        label: 'Steps',
        type: 'array' as const,
        itemFields: [
          { name: 'num', label: 'Step number', type: 'text' as const, default: '1' },
          { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'edit_note' },
          { name: 'title', label: 'Title', type: 'text' as const, default: '' },
          { name: 'desc', label: 'Description', type: 'textarea' as const, default: '' },
        ],
      },
    ],
    values: {
      eyebrow: 'HOW IT WORKS',
      title: 'Our Process',
      sub: 'Apply once, move fast, and grow with funding designed around your business.',
      steps: [
        {
          num: '1',
          icon: 'edit_note',
          title: 'Apply Online',
          desc: 'Complete a short application in minutes — no stacks of paperwork, no waiting in line.',
        },
        {
          num: '2',
          icon: 'verified',
          title: 'Get Approved',
          desc: 'Receive a same-day decision tailored to your revenue and cash flow.',
        },
        {
          num: '3',
          icon: 'account_balance_wallet',
          title: 'Withdraw Funds',
          desc: 'Funds are deposited directly into your business account, often the same day.',
        },
        {
          num: '4',
          icon: 'event_repeat',
          title: 'Repayment',
          desc: 'Flexible repayment options that adapt to your revenue cycles — never a one-size-fits-all schedule.',
        },
        {
          num: '5',
          icon: 'trending_up',
          title: 'Renew Your Funding',
          desc: 'Returning customers can renew quickly to keep growth and momentum on your timeline.',
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

  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === NEW_ID);
  if (existingIdx >= 0) {
    // Idempotent refresh of html / values / fields.
    const prevOrder = parsed.blocks[existingIdx]?.order ?? processBlock.order;
    parsed.blocks[existingIdx] = { ...processBlock, order: prevOrder };
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
      `Post ${POST_ID}: no anchor '${ANCHOR_ID}' block found; aborting (run iter4 first).`,
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
  processBlock.order = insertOrder;
  parsed.blocks.splice(anchorIdx + 1, 0, processBlock);

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
