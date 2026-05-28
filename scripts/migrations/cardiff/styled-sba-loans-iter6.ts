/**
 * Iter 6 — post 829 (SBA Loans). After iters 1-5 (hero, sec-1 band, sec-2
 * 4-card SBA benefits, sec-3 stats, FAQ accordion), the biggest remaining
 * unstyled chunk is the bottom half of `sec-4` ("Requirements and
 * Qualifications for SBA Loans"): three bare heading+paragraph pairs
 * (Adaptive Payment Solutions, Competitive Pricing Advantage, Open and
 * Honest Process) sitting under the styled title/divider/intro from iter1.
 *
 * Pattern mirrors iter5 (and styled-equipment-leasing-iter3): a single
 * html-render block with `data-repeat="cards"` over a 3-up icon-card grid,
 * rotating brand-accent gradients on the icon chips.
 *
 * Preserves sec-4-title, sec-4-div, sec-4-p-2; replaces indices 3-8.
 * Idempotent: looks up by id and always rewrites sub-blocks to
 * [title, divider, intro, cards-html-render].
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 829;
const TARGET_BLOCK_ID = 'sec-4';

const REQS_HTML = `
<style>
  .cd-sba-reqs { max-width: 1080px; margin: 0 auto; }
  .cd-sba-reqs__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-sba-reqs__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-sba-reqs__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-sba-reqs__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-sba-reqs__card:nth-child(2) .cd-sba-reqs__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-sba-reqs__card:nth-child(3) .cd-sba-reqs__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-sba-reqs__icon .material-icons { font-size: 30px; }
  .cd-sba-reqs__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-sba-reqs__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 920px) {
    .cd-sba-reqs__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-sba-reqs__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-sba-reqs__card { padding: 26px 22px; }
  }
</style>
<div class="cd-sba-reqs">
  <div class="cd-sba-reqs__grid">
    <div class="cd-sba-reqs__card" data-repeat="cards">
      <div class="cd-sba-reqs__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <h3 class="cd-sba-reqs__title" data-field="title">{{cards.title}}</h3>
      <p class="cd-sba-reqs__desc" data-field="desc">{{cards.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const REQ_CARDS = [
  {
    icon: 'tune',
    title: 'Adaptive Payment Solutions',
    desc: 'Cardiff’s financing options offer the adaptability your enterprise needs to flourish.',
  },
  {
    icon: 'savings',
    title: 'Competitive Pricing Advantage',
    desc: 'Enjoy industry-leading rates when you choose our tailored business financing options.',
  },
  {
    icon: 'verified_user',
    title: 'Open and Honest Process',
    desc: 'We emphasize clear communication and transparency at every step of your financing journey.',
  },
];

const reqsBlock = {
  id: 'sec-4-reqs',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: REQS_HTML,
  fields: [
    {
      name: 'cards',
      label: 'Requirement cards',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Icon (Material Icons name)', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
    },
  ],
  values: { cards: REQ_CARDS },
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
    console.error(`Post ${POST_ID}: ${TARGET_BLOCK_ID}.blocks is missing; aborting`);
    process.exit(1);
  }

  // Widen so the 3-up grid breathes; keep the soft tint band.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '72px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  // Preserve title (sec-4-title), divider (sec-4-div), intro (sec-4-p-2); rewrite the rest.
  const preserveIds = new Set(['sec-4-title', 'sec-4-div', 'sec-4-p-2']);
  const preserved = sec.blocks
    .filter((b: any) => preserveIds.has(b?.id))
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  if (preserved.length !== 3) {
    console.error(`Post ${POST_ID}: expected 3 preserved sub-blocks (title/divider/intro), found ${preserved.length}; aborting`);
    process.exit(1);
  }
  preserved[0].order = 1;
  preserved[1].order = 2;
  preserved[2].order = 3;
  // Tighten the intro's trailing margin so the card grid sits closer.
  if (preserved[2].style) {
    preserved[2].style.margin = '0 auto 36px auto';
    preserved[2].style.maxWidth = '820px';
    preserved[2].style.textAlign = 'center';
  }

  sec.blocks = [...preserved, reqsBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-4 -> styled 3-card "Requirements" grid (data-repeat=cards).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
