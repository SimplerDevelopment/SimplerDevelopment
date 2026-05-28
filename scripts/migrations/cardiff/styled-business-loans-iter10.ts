/**
 * Iter 10 — business-loans (post 800).
 *
 * Last remaining gap on this page: inside sec-7 ("When to Consider Small
 * Business Loans"), the "You might be a good candidate if you're:"
 * bullet list is rendered as a bare `card-grid` block (id
 * `sec-7-grid-4`) — 4 cards with `check_circle` icons, all titles only,
 * empty descriptions. Looks like an unrendered placeholder next to the
 * neighbouring polished html-render bands.
 *
 * Replace it with a styled 2x2 icon-card grid html-render block lifted
 * from styled-equipment-leasing-iter3.ts but condensed using
 * `data-repeat="items"` so the editor sees the candidates as an editable
 * array. Each card now ships with a real description so the band reads
 * as substance instead of bullet stubs.
 *
 * Idempotent: in-place find/replace on `sec-7-grid-4` inside sec-7's
 * children array; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 800;
const PARENT_SECTION_ID = 'sec-7';
const TARGET_BLOCK_ID = 'sec-7-grid-4';

const CANDIDATES_HTML = `
<style>
  .cd-bl-cand { max-width: 1080px; margin: 0 auto; }
  .cd-bl-cand__intro { text-align: center; color: #25418b; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.65; max-width: 720px; margin: 0 auto 36px auto; font-weight: 600; }
  .cd-bl-cand__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px; }
  .cd-bl-cand__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 28px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-bl-cand__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bl-cand__icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-bl-cand__card:nth-child(2) .cd-bl-cand__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bl-cand__card:nth-child(3) .cd-bl-cand__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bl-cand__card:nth-child(4) .cd-bl-cand__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.34); }
  .cd-bl-cand__icon .material-icons { font-size: 26px; }
  .cd-bl-cand__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-bl-cand__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 720px) {
    .cd-bl-cand__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-bl-cand__card { padding: 24px 20px; }
  }
</style>
<div class="cd-bl-cand">
  <p class="cd-bl-cand__intro" data-field="intro">{{intro}}</p>
  <div class="cd-bl-cand__grid">
    <div class="cd-bl-cand__card" data-repeat="items">
      <div class="cd-bl-cand__icon"><span class="material-icons" data-field="icon">{{items.icon}}</span></div>
      <h3 class="cd-bl-cand__card-title" data-field="title">{{items.title}}</h3>
      <p class="cd-bl-cand__card-desc" data-field="description">{{items.description}}</p>
    </div>
  </div>
</div>
`.trim();

const CANDIDATES_DEFAULTS = {
  intro:
    "You might be a good candidate for Cardiff’s loans if you’re:",
  items: [
    {
      icon: 'groups',
      title: 'Expanding your team or location',
      description:
        'Hiring, opening a new shop, or signing a bigger lease — funding now lets you move on the opportunity instead of waiting for revenue to catch up.',
    },
    {
      icon: 'water_drop',
      title: 'Bridging a temporary cash flow gap',
      description:
        'Payables outpacing receivables this month? A short-term loan covers payroll and rent so day-to-day operations never stall on timing alone.',
    },
    {
      icon: 'event_available',
      title: 'Preparing for a busy season or large order',
      description:
        'Stock up on inventory, staff up for peak, or fulfill a marquee contract — without raiding reserves you’d rather keep as runway.',
    },
    {
      icon: 'inventory_2',
      title: 'Investing in equipment or inventory',
      description:
        'Replace aging gear, buy in bulk to lock in pricing, or expand your offering. Cardiff funds the assets that compound into more revenue.',
    },
  ],
} as const;

const candidatesBlock = {
  id: 'sec-7-grid-4',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 5,
  html: CANDIDATES_HTML,
  fields: [
    { name: 'intro', label: 'Intro line above cards', type: 'textarea', default: CANDIDATES_DEFAULTS.intro },
    {
      name: 'items',
      label: 'Candidate scenarios',
      type: 'array',
      itemFields: [
        { name: 'icon', type: 'text', label: 'Material icon name' },
        { name: 'title', type: 'text', label: 'Scenario title' },
        { name: 'description', type: 'textarea', label: 'Scenario description' },
      ],
      default: CANDIDATES_DEFAULTS.items,
    },
  ],
  values: JSON.parse(JSON.stringify(CANDIDATES_DEFAULTS)),
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

  const secIdx = parsed.blocks.findIndex((b: any) => b?.id === PARENT_SECTION_ID);
  if (secIdx === -1) {
    console.error(`Post ${POST_ID}: no section ${PARENT_SECTION_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[secIdx];
  if (sec.type !== 'section' || !Array.isArray(sec.blocks)) {
    console.error(`Post ${POST_ID}: ${PARENT_SECTION_ID} is not a section with children; aborting`);
    process.exit(1);
  }

  const childIdx = sec.blocks.findIndex((c: any) => c?.id === TARGET_BLOCK_ID);
  if (childIdx === -1) {
    console.error(`Post ${POST_ID}: no child ${TARGET_BLOCK_ID} in ${PARENT_SECTION_ID}; aborting`);
    process.exit(1);
  }

  // Preserve sibling order numbering by reusing the original order field.
  const originalOrder = sec.blocks[childIdx]?.order;
  if (typeof originalOrder === 'number') {
    candidatesBlock.order = originalOrder;
  }

  sec.blocks[childIdx] = candidatesBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced ${PARENT_SECTION_ID}/${TARGET_BLOCK_ID} with styled icon-card grid (data-repeat="items").`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
