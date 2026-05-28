/**
 * Iter 13: Insert the missing "What Is Equipment Leasing?" definition band
 * on post 802 (equipment-leasing). The page is titled "What is Equipment
 * Leasing?" but iters 1-12 styled sec-2 (leasing vs financing) and sec-4
 * (What Is Business Equipment Financing?) — there is NO leasing-definition
 * counterpart to sec-4. The order field jumps from sec-2 (order 3) straight
 * to sec-4 (order 5), leaving sec-3 as a structural gap. This iter mints
 * sec-3, inserts it after sec-2, and styles it as a definition card plus a
 * 3-up icon-card benefits grid — matching the iter3 pattern.
 *
 * Inside `data-repeat="benefits"` we use `{{benefits.icon}}` /
 * `{{benefits.title}}` / `{{benefits.desc}}` per spec.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632), peach (#ffb798). Raleway display, Open Sans body.
 * Material Icons only, no emojis.
 *
 * Idempotent: re-running detects existing block with id `sec-3` and
 * rewrites in place; if missing it splices a new section between sec-2
 * and sec-4 and rewrites the surrounding `order` fields.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-3';
const AFTER_BLOCK_ID = 'sec-2';

const DEF_HTML = `
<style>
  .cd-eq-def { max-width: 1140px; margin: 0 auto; }
  .cd-eq-def__card { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 24px; align-items: start; background: #ffffff; border: 1px solid #e6ecf5; border-left: 4px solid #5ac96f; border-radius: 14px; padding: 32px 36px; box-shadow: 0 14px 36px rgba(28,51,112,0.07); margin: 0 auto 48px auto; max-width: 960px; }
  .cd-eq-def__chip { width: 72px; height: 72px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 10px 22px rgba(28,51,112,0.24); }
  .cd-eq-def__chip .material-icons { font-size: 38px; }
  .cd-eq-def__body { min-width: 0; }
  .cd-eq-def__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.7rem; letter-spacing: 0.28em; text-transform: uppercase; color: #ef6632; font-weight: 700; margin: 0 0 10px 0; }
  .cd-eq-def__text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  .cd-eq-def__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-eq-def__bcard { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-eq-def__bcard:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-eq-def__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-eq-def__bcard:nth-child(3n+2) .cd-eq-def__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-eq-def__bcard:nth-child(3n+3) .cd-eq-def__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-eq-def__icon .material-icons { font-size: 30px; }
  .cd-eq-def__btitle { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-eq-def__bdesc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-eq-def__card { grid-template-columns: 1fr; gap: 18px; padding: 26px 24px; }
    .cd-eq-def__chip { width: 60px; height: 60px; border-radius: 14px; }
    .cd-eq-def__chip .material-icons { font-size: 32px; }
    .cd-eq-def__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-eq-def__bcard { padding: 26px 22px; }
  }
</style>
<div class="cd-eq-def">
  <div class="cd-eq-def__card">
    <div class="cd-eq-def__chip"><span class="material-icons" data-field="defIcon">{{defIcon}}</span></div>
    <div class="cd-eq-def__body">
      <p class="cd-eq-def__eyebrow" data-field="defEyebrow">{{defEyebrow}}</p>
      <p class="cd-eq-def__text" data-field="defText">{{defText}}</p>
    </div>
  </div>
  <div class="cd-eq-def__grid">
    <div class="cd-eq-def__bcard" data-repeat="benefits">
      <div class="cd-eq-def__icon"><span class="material-icons" data-field="icon">{{benefits.icon}}</span></div>
      <h3 class="cd-eq-def__btitle" data-field="title">{{benefits.title}}</h3>
      <p class="cd-eq-def__bdesc" data-field="desc">{{benefits.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const DEF_DEFAULTS = {
  defIcon: 'inventory_2',
  defEyebrow: 'The definition',
  defText:
    'Equipment leasing is a financing arrangement that lets your business use specialized equipment — vehicles, machinery, technology, medical or restaurant gear — for a fixed term in exchange for predictable monthly payments. You get the tools you need to operate and grow without paying the full purchase price up front, and at lease-end you can buy the equipment, return it, or upgrade.',
  benefits: [
    {
      icon: 'savings',
      title: 'Preserve Working Capital',
      desc: 'Skip the large up-front check. Lease payments stay predictable so cash stays available for payroll, inventory, and the next opportunity.',
    },
    {
      icon: 'autorenew',
      title: 'Upgrade on a Cycle',
      desc: 'Roll into newer equipment at lease-end so your operation never falls behind on technology, safety standards, or efficiency.',
    },
    {
      icon: 'receipt_long',
      title: 'Tax-Friendly Treatment',
      desc: 'Lease payments are often deductible as a business expense, simplifying bookkeeping and improving year-end planning. (Ask your tax advisor for specifics.)',
    },
  ],
} as const;

const defBlock = {
  id: 'sec-3-def',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: DEF_HTML,
  fields: [
    { name: 'defIcon', label: 'Definition icon', type: 'text', default: DEF_DEFAULTS.defIcon },
    { name: 'defEyebrow', label: 'Definition eyebrow', type: 'text', default: DEF_DEFAULTS.defEyebrow },
    { name: 'defText', label: 'Definition body', type: 'textarea', default: DEF_DEFAULTS.defText },
    {
      name: 'benefits',
      label: 'Benefits',
      type: 'collection',
      default: DEF_DEFAULTS.benefits,
      fields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
    },
  ],
  values: { ...DEF_DEFAULTS },
};

function buildHeaderBlocks() {
  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-3-title',
    order: 1,
    level: 2 as const,
    content: 'What Is Equipment Leasing?',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.18',
      margin: '0 auto 14px auto',
      maxWidth: '900px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-3-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  return [headerBlock, dividerBlock];
}

function buildSection() {
  return {
    type: 'section' as const,
    id: TARGET_BLOCK_ID,
    order: 4,
    style: {
      backgroundColor: '#ffffff',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    maxWidth: '1200px',
    blocks: [...buildHeaderBlocks(), defBlock],
  };
}

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

  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID);
  if (existingIdx !== -1) {
    // Idempotent rewrite in place.
    const sec = parsed.blocks[existingIdx];
    if (sec.type !== 'section') {
      console.error(`Post ${POST_ID}: existing block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`);
      process.exit(1);
    }
    sec.maxWidth = '1200px';
    sec.style = {
      ...(sec.style || {}),
      backgroundColor: '#ffffff',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
    };
    sec.blocks = [...buildHeaderBlocks(), defBlock];
    await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
    console.log(`Updated post ${POST_ID}: ${TARGET_BLOCK_ID} rewritten in place.`);
    process.exit(0);
  }

  const afterIdx = parsed.blocks.findIndex((b: any) => b?.id === AFTER_BLOCK_ID);
  if (afterIdx === -1) {
    console.error(`Post ${POST_ID}: anchor block ${AFTER_BLOCK_ID} not found; aborting`);
    process.exit(1);
  }

  const newSection = buildSection();
  parsed.blocks.splice(afterIdx + 1, 0, newSection);

  // Renormalize order across all top-level blocks so the new sec-3 lands
  // cleanly between sec-2 and sec-4 without colliding with sec-4's old order.
  parsed.blocks.forEach((b: any, i: number) => {
    if (b && typeof b === 'object') b.order = i + 1;
  });

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: inserted ${TARGET_BLOCK_ID} after ${AFTER_BLOCK_ID} (${parsed.blocks.length} top-level blocks).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
