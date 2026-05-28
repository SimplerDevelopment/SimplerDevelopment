/**
 * Iter 13: Restyle the "Better Business Credit Options Without the Guesswork"
 * section on post 793 (home). Block id `better-credit` is currently a stack
 * of three centered paragraphs — visually identical to neighboring text
 * bands and gives the eye nothing to anchor on.
 *
 * Pattern follows scripts/migrations/cardiff/styled-equipment-leasing-iter3.ts:
 *   1. Centered eyebrow + H2 + orange underline retained.
 *   2. The three paragraphs are converted into a 3-up icon-card grid driven
 *      by `data-repeat="cards"` so future copy can be edited in the visual
 *      editor as repeater items. Each card has a circular gradient icon
 *      chip (deep blue / orange / green — brand palette), title, copy.
 *   3. Soft blue-tinted band background to lift the section off the white
 *      neighbors above and below.
 *
 * Idempotent: section.blocks is rewritten in place each run; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const TARGET_BLOCK_ID = 'better-credit';

const CARDS_HTML = `
<style>
  .cd-bc { max-width: 1140px; margin: 0 auto; }
  .cd-bc__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-bc__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-bc__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-bc__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bc__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-bc__card:nth-child(2) .cd-bc__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bc__card:nth-child(3) .cd-bc__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bc__icon .material-icons { font-size: 30px; }
  .cd-bc__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-bc__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-bc__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bc__card { padding: 26px 22px; }
  }
</style>
<div class="cd-bc">
  <p class="cd-bc__intro" data-field="intro">{{intro}}</p>
  <div class="cd-bc__grid">
    <div class="cd-bc__card" data-repeat="cards">
      <div class="cd-bc__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <h3 class="cd-bc__card-title" data-field="title">{{cards.title}}</h3>
      <p class="cd-bc__card-desc" data-field="desc">{{cards.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const CARDS_DEFAULTS = {
  intro:
    "Cardiff considers the full picture — revenue trends, business potential, and overall financial health — so the businesses traditional banks overlook still have a path to capital.",
  cards: [
    {
      icon: 'insights',
      title: 'The Full Picture, Not Just a Score',
      desc: 'Unlike conventional lenders that prioritize your credit score above all else, Cardiff considers revenue trends, business potential, and overall financial health — opening doors for companies banks overlook.',
    },
    {
      icon: 'bolt',
      title: 'Built for Speed',
      desc: "Need a business loan quickly? Our streamlined process makes it easy to apply and get approved. Many of our clients receive funds the same day — lending built for the realities of running a business, not banking protocol.",
    },
    {
      icon: 'trending_up',
      title: 'Funding That Evolves With You',
      desc: "From short-term cash flow loans to longer-term growth funding, Cardiff offers guidance every step of the way. You're building something, and we're proud to help finance it.",
    },
  ],
} as const;

const cardsBlock = {
  id: 'bc-cards',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: CARDS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: CARDS_DEFAULTS.intro },
    {
      name: 'cards',
      label: 'Benefit cards',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'desc', label: 'Card description', type: 'textarea' },
      ],
      default: CARDS_DEFAULTS.cards,
    },
  ],
  values: { ...CARDS_DEFAULTS },
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
    console.error(`Post ${POST_ID}: ${TARGET_BLOCK_ID} is not a section (was ${sec.type})`);
    process.exit(1);
  }

  // Widen so the 3-col card grid breathes; tint background to lift off neighbors.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const overlineBlock = {
    type: 'heading' as const,
    id: 'bc-overline',
    order: 1,
    level: 6,
    content: 'WHEN BANKS SAY NO',
    alignment: 'center' as const,
    style: {
      color: '#ef6632',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '0.6875rem',
      fontWeight: '700',
      letterSpacing: '0.32em',
      textTransform: 'uppercase',
      margin: '0 0 16px 0',
      textAlign: 'center',
    },
  };
  const titleBlock = {
    type: 'heading' as const,
    id: 'bc-title',
    order: 2,
    level: 2,
    content: 'Better Business Credit Options Without the Guesswork',
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
    id: 'bc-div',
    order: 3,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  sec.blocks = [overlineBlock, titleBlock, dividerBlock, cardsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: ${TARGET_BLOCK_ID} -> 3-card icon grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
