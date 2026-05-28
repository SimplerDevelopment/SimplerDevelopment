/**
 * Iter 10: Restyle the "Who Should Consider an MCA Loan?" section on post 824
 * (merchant-cash-advance). Currently sec-7 carries a bare `card-grid` block
 * (4 ideal-fit bullets) which does not render with the same icon-card visual
 * language as the rest of the page (sec-2 types, sec-8 benefits, sec-9 steps).
 *
 * We replace that `card-grid` with a single html-render block that uses a
 * `data-repeat="fits"` icon-card grid — same look as sec-2's
 * `cd-mca-types__grid` so the page reads as one visual system. Intro paragraph
 * and closer paragraph above/below stay as plain text blocks (they already
 * have brand-correct styling).
 *
 * Idempotent: detects existing html-render at id `sec-7-fits` and rewrites it;
 * leaves the old `sec-7-grid-3` card-grid removed; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 824;
const TARGET_BLOCK_ID = 'sec-7';
const FITS_BLOCK_ID = 'sec-7-fits';
const OLD_GRID_ID = 'sec-7-grid-3';

const FITS_HTML = `
<style>
  .cd-mca-fits { max-width: 1140px; margin: 0 auto; }
  .cd-mca-fits__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px; }
  .cd-mca-fits__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 28px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: row; align-items: flex-start; gap: 18px; }
  .cd-mca-fits__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-mca-fits__icon { flex: 0 0 auto; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-mca-fits__card:nth-child(2) .cd-mca-fits__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-mca-fits__card:nth-child(3) .cd-mca-fits__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-mca-fits__card:nth-child(4) .cd-mca-fits__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.32); }
  .cd-mca-fits__icon .material-icons { font-size: 26px; }
  .cd-mca-fits__body { flex: 1 1 auto; min-width: 0; }
  .cd-mca-fits__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 6px 0 0 0; letter-spacing: -0.005em; line-height: 1.35; }
  @media (max-width: 820px) {
    .cd-mca-fits__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-mca-fits__card { padding: 22px 20px; }
  }
</style>
<div class="cd-mca-fits">
  <div class="cd-mca-fits__grid">
    <div class="cd-mca-fits__card" data-repeat="fits">
      <div class="cd-mca-fits__icon"><span class="material-icons" data-field="icon">{{fits.icon}}</span></div>
      <div class="cd-mca-fits__body">
        <h3 class="cd-mca-fits__title" data-field="title">{{fits.title}}</h3>
      </div>
    </div>
  </div>
</div>
`.trim();

const FITS_DEFAULTS = [
  { icon: 'credit_card', title: 'Process a high volume of credit card sales' },
  { icon: 'bolt', title: 'Need capital quickly and can’t wait for long bank approval timelines' },
  { icon: 'verified_user', title: 'Don’t meet strict credit or collateral requirements for traditional loans' },
  { icon: 'trending_up', title: 'Have fluctuating revenues but strong overall cash flow' },
];

const fitsBlock = {
  id: FITS_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: FITS_HTML,
  fields: [
    {
      name: 'fits',
      label: 'Ideal-fit cards',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
      ],
      default: FITS_DEFAULTS,
    },
  ],
  values: { fits: FITS_DEFAULTS },
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

  if (!Array.isArray(sec.blocks)) {
    console.error(`Post ${POST_ID}: section ${TARGET_BLOCK_ID} has no children`);
    process.exit(1);
  }

  // Idempotency: remove any pre-existing fits html-render and the old card-grid.
  sec.blocks = sec.blocks.filter(
    (b: any) => b?.id !== FITS_BLOCK_ID && b?.id !== OLD_GRID_ID,
  );

  // Find insertion point: after sec-7-p-2 (the intro paragraph). If missing,
  // insert before the closer paragraph; if neither, append.
  const introIdx = sec.blocks.findIndex((b: any) => b?.id === 'sec-7-p-2');
  const closerIdx = sec.blocks.findIndex((b: any) => b?.id === 'sec-7-p-4');
  let insertAt: number;
  if (introIdx !== -1) insertAt = introIdx + 1;
  else if (closerIdx !== -1) insertAt = closerIdx;
  else insertAt = sec.blocks.length;

  sec.blocks.splice(insertAt, 0, fitsBlock);

  // Re-number `order` on all section children so neighbours stay sequential.
  sec.blocks.forEach((b: any, i: number) => {
    if (b && typeof b === 'object') b.order = i + 1;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-7 -> replaced card-grid with styled icon-card "ideal fits" grid (data-repeat).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
