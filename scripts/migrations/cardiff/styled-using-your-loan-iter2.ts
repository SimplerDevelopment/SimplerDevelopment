/**
 * Using Your Loan (post 835) — iteration 2.
 *
 * Single biggest remaining gap from iter1: beneath the rebuilt hero the page
 * still renders a stack of five primitive sections —
 *   sec-1: orphan one-line subtitle "Pulling the stops on cash flow."
 *          (already said in the hero description; reads as a stranded band
 *          of body text on a grey strip with no heading)
 *   sec-2: "Make Your Business Better" intro paragraph
 *   sec-3: Purchase Inventory (H2 + 1 paragraph)
 *   sec-4: Smooth Cash Flow   (H2 + 1 paragraph)
 *   sec-5: Cover Payroll      (H2 + 1 paragraph)
 *
 * Five back-to-back centered-text bands have zero visual hierarchy and look
 * nothing like the cardiff.co source — which presents the three use cases as
 * a card row under the "Make Your Business Better" intro.
 *
 * Fix: collapse sec-1..sec-5 into ONE consolidated html-render slab
 * `uses-band` matching the iter3 icon-card grid template pattern:
 *   - Orange-eyebrow + "Make Your Business Better" H2 + orange divider
 *   - Intro paragraph (sec-2's copy, preserved verbatim)
 *   - 3-card icon grid (Inventory / Cash Flow / Payroll) using
 *     data-repeat="uses" so the portal editor can add/remove cards
 *
 * Idempotent: looks for the orphan sec-1 OR the already-migrated
 * `uses-band` id and rewrites in place. Safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 835;
  const NEW_ID = 'uses-band';

  const USES_HTML = `
<style>
  .cd-uses { background: #f6f9fc; padding: 96px 24px 96px 24px; }
  .cd-uses__inner { max-width: 1180px; margin: 0 auto; }
  .cd-uses__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; font-weight: 700; color: #ef6632; letter-spacing: 0.32em; text-transform: uppercase; text-align: center; margin: 0 0 14px 0; }
  .cd-uses__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.25rem; font-weight: 800; color: #25418b; letter-spacing: -0.018em; text-align: center; margin: 0 0 16px 0; line-height: 1.15; }
  .cd-uses__divider { width: 56px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 28px auto; }
  .cd-uses__intro { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #525f7f; text-align: center; margin: 0 auto 56px auto; max-width: 760px; }
  .cd-uses__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-uses__card { position: relative; background: #ffffff; border-radius: 16px; padding: 36px 28px 32px 28px; border: 1px solid #e8edf6; box-shadow: 0 12px 32px rgba(28,51,112,0.07); display: flex; flex-direction: column; overflow: hidden; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-uses__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.14); }
  .cd-uses__card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #ef6632 0%, #ffb798 100%); }
  .cd-uses__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 20px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-uses__card:nth-child(2) .cd-uses__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-uses__card:nth-child(3) .cd-uses__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-uses__icon .material-icons { font-size: 30px; }
  .cd-uses__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-uses__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-uses__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-uses { padding: 72px 18px 72px 18px; }
    .cd-uses__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-uses__title { font-size: 1.875rem; }
    .cd-uses__card { padding: 28px 22px; }
  }
</style>
<section class="cd-uses">
  <div class="cd-uses__inner">
    <p class="cd-uses__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-uses__title" data-field="title">{{title}}</h2>
    <div class="cd-uses__divider" aria-hidden="true"></div>
    <p class="cd-uses__intro" data-field="intro">{{intro}}</p>
    <div class="cd-uses__grid">
      <article class="cd-uses__card" data-repeat="uses">
        <div class="cd-uses__icon"><span class="material-icons" data-field="icon">{{uses.icon}}</span></div>
        <h3 class="cd-uses__card-title" data-field="cardTitle">{{uses.cardTitle}}</h3>
        <p class="cd-uses__card-desc" data-field="cardDesc">{{uses.cardDesc}}</p>
      </article>
    </div>
  </div>
</section>
`.trim();

  const usesBlock = {
    id: NEW_ID,
    type: 'html-render' as const,
    order: 2,
    width: 'full' as const,
    html: USES_HTML,
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: 'PUT YOUR CAPITAL TO WORK' },
      { name: 'title', label: 'Headline', type: 'text' as const, default: 'Make Your Business Better' },
      {
        name: 'intro',
        label: 'Intro paragraph',
        type: 'textarea' as const,
        default:
          'We believe neither cash flow cycles nor equipment expenses should keep you from reaching your potential. At Cardiff, we help you invest your funds to drive real returns. Through our loans, you can grow your business without having to worry about either of those issues.',
      },
      {
        name: 'uses',
        label: 'Use cases',
        type: 'array' as const,
        itemFields: [
          { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'inventory_2' },
          { name: 'cardTitle', label: 'Title', type: 'text' as const },
          { name: 'cardDesc', label: 'Description', type: 'textarea' as const },
        ],
      },
    ],
    values: {
      eyebrow: 'PUT YOUR CAPITAL TO WORK',
      title: 'Make Your Business Better',
      intro:
        'We believe neither cash flow cycles nor equipment expenses should keep you from reaching your potential. At Cardiff, we help you invest your funds to drive real returns. Through our loans, you can grow your business without having to worry about either of those issues.',
      uses: [
        {
          icon: 'inventory_2',
          cardTitle: 'Purchase Inventory',
          cardDesc:
            'Loans for inventory support small business funding needs during peak seasons so you can continue to focus on growing your business.',
        },
        {
          icon: 'waterfall_chart',
          cardTitle: 'Smooth Cash Flow',
          cardDesc:
            'Although many small businesses may experience ups and downs in cash flow, small business loans can cover your financing needs. Invest in Equipment Loans for equipment help your small business purchase or upgrade your equipment so you can operate efficiently.',
        },
        {
          icon: 'groups',
          cardTitle: 'Cover Payroll',
          cardDesc:
            'Loans for payroll ensure that your permanent and temporary employees will be paid no matter if you’re in a slow or exceptionally busy season.',
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

  // Idempotency: if uses-band already exists, just rewrite it in place.
  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === NEW_ID);
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = { ...usesBlock, order: parsed.blocks[existingIdx].order ?? 2 };
    await db
      .update(posts)
      .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
      .where(eq(posts.id, POST_ID));
    console.log(
      `Updated post ${POST_ID}: refreshed existing '${NEW_ID}' (idx ${existingIdx}). Block count: ${parsed.blocks.length}`,
    );
    process.exit(0);
  }

  // First-time migration: find anchor (sec-1) and remove the legacy
  // sec-1..sec-5 stack, then splice in the consolidated uses-band.
  const sec1Idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sec-1');
  if (sec1Idx < 0) {
    console.error(`Post ${POST_ID}: no 'sec-1' block found and no '${NEW_ID}' to refresh; aborting`);
    process.exit(1);
  }

  // Defensive: gather contiguous sec-N blocks (sec-1..sec-5) starting at sec1Idx.
  const legacyIds = ['sec-1', 'sec-2', 'sec-3', 'sec-4', 'sec-5'];
  let removeEnd = sec1Idx;
  for (let i = sec1Idx; i < parsed.blocks.length; i++) {
    if (legacyIds.includes(parsed.blocks[i]?.id)) {
      removeEnd = i;
    } else {
      break;
    }
  }
  const removeCount = removeEnd - sec1Idx + 1;
  const removed = parsed.blocks.splice(sec1Idx, removeCount);
  const baseOrder = parsed.blocks[sec1Idx - 1]?.order ?? 1;
  parsed.blocks.splice(sec1Idx, 0, { ...usesBlock, order: baseOrder + 1 });
  // Renumber subsequent block orders so the final-cta still trails.
  for (let i = sec1Idx + 1; i < parsed.blocks.length; i++) {
    parsed.blocks[i].order = (parsed.blocks[sec1Idx].order as number) + (i - sec1Idx);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: removed [${removed.map((b: any) => b.id).join(', ')}] and inserted '${NEW_ID}' at idx ${sec1Idx}. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
