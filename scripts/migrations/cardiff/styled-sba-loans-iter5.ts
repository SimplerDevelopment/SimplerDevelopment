/**
 * Iter 5 — post 829 (SBA Loans). After iters 1-4 (hero, 4-card band, stats
 * pills, FAQ accordion), the biggest remaining unstyled chunk is the bottom
 * half of `sec-2` ("What are SBA Loans?"): four bare heading+paragraph pairs
 * describing the SBA loan benefits (Swift Decision-Making, Immediate Fund
 * Access, Tailored Payment Options, Empowering Your Choices).
 *
 * sec-2 already has a styled H2 + orange divider + intro paragraph (iter1).
 * We preserve those three sub-blocks (indices 0-2) and replace indices 3-10
 * with a single html-render block — a 4-up icon card grid with rotating
 * brand-accent icon chips (deep-blue / orange / green / peach), matching the
 * `styled-equipment-leasing-iter3.ts` pattern but using `data-repeat="cards"`
 * for the cards array so each card is a single row in the field editor.
 *
 * Idempotent: looks up sec-2 and its existing styled prelude blocks by id;
 * always rewrites sub-blocks to [title, divider, intro, cards-html-render].
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 829;
const TARGET_BLOCK_ID = 'sec-2';

const BENEFITS_HTML = `
<style>
  .cd-sba-ben { max-width: 1140px; margin: 0 auto; }
  .cd-sba-ben__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-sba-ben__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 24px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-sba-ben__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-sba-ben__icon { width: 54px; height: 54px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-sba-ben__card:nth-child(2) .cd-sba-ben__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-sba-ben__card:nth-child(3) .cd-sba-ben__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-sba-ben__card:nth-child(4) .cd-sba-ben__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.32); }
  .cd-sba-ben__icon .material-icons { font-size: 28px; }
  .cd-sba-ben__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-sba-ben__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 1040px) {
    .cd-sba-ben__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-sba-ben__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-sba-ben__card { padding: 24px 20px; }
  }
</style>
<div class="cd-sba-ben">
  <div class="cd-sba-ben__grid">
    <div class="cd-sba-ben__card" data-repeat="cards">
      <div class="cd-sba-ben__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <h3 class="cd-sba-ben__title" data-field="title">{{cards.title}}</h3>
      <p class="cd-sba-ben__desc" data-field="desc">{{cards.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const BENEFIT_CARDS = [
  {
    icon: 'bolt',
    title: 'Swift Decision-Making',
    desc: 'Submit your application and receive a decision swiftly, allowing you to focus on growing your business.',
  },
  {
    icon: 'account_balance_wallet',
    title: 'Immediate Fund Access',
    desc: 'Upon approval, your funds become immediately accessible with just a few clicks, free of any delays or obstacles.',
  },
  {
    icon: 'tune',
    title: 'Tailored Payment Options',
    desc: 'Enjoy repayment plans that adapt to your business needs, letting you concentrate on your core operations.',
  },
  {
    icon: 'insights',
    title: 'Empowering Your Choices',
    desc: 'With a variety of financial solutions, you have the freedom to steer your business in the direction you choose.',
  },
];

const benefitsBlock = {
  id: 'sec-2-benefits',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: BENEFITS_HTML,
  fields: [
    {
      name: 'cards',
      label: 'Benefit cards',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Icon (Material Icons name)', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
    },
  ],
  values: { cards: BENEFIT_CARDS },
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

  // Widen so the 4-up grid breathes; add a soft tint to set the band apart.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '72px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  // Preserve title (sec-2-title), divider (sec-2-div), intro (sec-2-p-2); rewrite the rest.
  const preserveIds = new Set(['sec-2-title', 'sec-2-div', 'sec-2-p-2']);
  const preserved = sec.blocks
    .filter((b: any) => preserveIds.has(b?.id))
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  if (preserved.length !== 3) {
    console.error(`Post ${POST_ID}: expected 3 preserved sub-blocks (title/divider/intro), found ${preserved.length}; aborting`);
    process.exit(1);
  }
  // Re-number to keep order intent obvious.
  preserved[0].order = 1;
  preserved[1].order = 2;
  preserved[2].order = 3;
  // Tighten the intro's trailing margin so the card grid sits closer.
  if (preserved[2].style) {
    preserved[2].style.margin = '0 auto 36px auto';
    preserved[2].style.maxWidth = '780px';
    preserved[2].style.textAlign = 'center';
  }

  sec.blocks = [...preserved, benefitsBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-2 -> styled 4-card "SBA benefits" grid (data-repeat=cards).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
