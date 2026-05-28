/**
 * Iter 2: Restyle the stat row on post 830 (Short-Term Working Capital).
 *
 * Current sec-1 mixes two "stat" h4/text pairs (5.99% / 82,000) with a
 * Google reviews link and several body paragraphs + a card-grid. The two
 * stats render as a vertical list of label/value pairs — flat and easy
 * to miss.
 *
 * Cardiff.co's source displays these as horizontal pill cards above the
 * body copy. This script:
 *   1. Replaces sec-1's child blocks so the first child is an html-render
 *      stat-pill row (data-repeat="stats", 2 pills + a small reviews link),
 *      followed by the body paragraphs + the existing card-grid, with
 *      tightened typography defaults (smaller leading on intro paragraphs,
 *      proper line-height/letter-spacing).
 *   2. Widens sec-1.maxWidth from 880px -> 1100px so the pill row breathes.
 *
 * Idempotent: locates sec-1 by id, rewrites its blocks array wholesale.
 * Safe to re-run; preserves card-grid content from the original sec-1.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 830;
const TARGET_BLOCK_ID = 'sec-1';
const PILLS_BLOCK_ID = 'sec-1-stat-pills';

const PILLS_HTML = `
<style>
  .cd-st-pills { max-width: 1100px; margin: 0 auto; }
  .cd-st-pills__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }
  .cd-st-pills__card { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 999px; padding: 28px 36px; text-align: center; box-shadow: 0 6px 18px rgba(28, 51, 112, 0.06); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 140px; transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .cd-st-pills__card:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(28, 51, 112, 0.12); }
  .cd-st-pills__value { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3rem; font-weight: 800; line-height: 1; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.02em; }
  .cd-st-pills__label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; font-weight: 700; line-height: 1.35; color: #ef6632; margin: 0; text-transform: uppercase; letter-spacing: 0.14em; }
  .cd-st-pills__cta-wrap { text-align: center; margin: 24px 0 0 0; }
  .cd-st-pills__cta { display: inline-flex; align-items: center; gap: 8px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #25418b; text-decoration: none; padding: 8px 0; border-bottom: 2px solid #5ac96f; transition: color 0.18s ease; }
  .cd-st-pills__cta:hover { color: #1c3370; }
  @media (max-width: 720px) {
    .cd-st-pills__grid { grid-template-columns: 1fr; gap: 14px; }
    .cd-st-pills__card { border-radius: 18px; min-height: 110px; padding: 22px 24px; }
    .cd-st-pills__value { font-size: 2.25rem; }
  }
</style>
<div class="cd-st-pills">
  <div class="cd-st-pills__grid">
    <div class="cd-st-pills__card" data-repeat="stats">
      <div class="cd-st-pills__value" data-field="value">{{stats.value}}</div>
      <div class="cd-st-pills__label" data-field="label">{{stats.label}}</div>
    </div>
  </div>
  <div class="cd-st-pills__cta-wrap">
    <a class="cd-st-pills__cta" href="{{reviewsUrl}}" data-field="reviewsText">{{reviewsText}}</a>
  </div>
</div>
`.trim();

const pillsBlock = {
  id: PILLS_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: PILLS_HTML,
  fields: [
    {
      name: 'stats',
      label: 'Stat pills',
      type: 'array' as const,
      itemFields: [
        { name: 'value', label: 'Value', type: 'text' as const },
        { name: 'label', label: 'Label', type: 'text' as const },
      ],
    },
    { name: 'reviewsText', label: 'Reviews link text', type: 'text' as const, default: 'See Our Google Reviews →' },
    { name: 'reviewsUrl', label: 'Reviews link url', type: 'url' as const, default: 'https://www.google.com/search?q=Cardiff+reviews' },
  ],
  values: {
    stats: [
      { value: '5.99%', label: 'Low rates on secured financing' },
      { value: '82,000', label: "Double our average competitor's approval" },
    ],
    reviewsText: 'See Our Google Reviews →',
    reviewsUrl: 'https://www.google.com/search?q=Cardiff+reviews',
  },
};

// Tightened typography defaults applied to all body paragraphs in sec-1.
const bodyTextStyle = {
  color: '#525f7f',
  fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: '1rem',
  lineHeight: '1.7',
  letterSpacing: '0.005em',
  margin: '0 0 16px 0',
};

const introParagraphs = [
  'Term loans are simple, straightforward, and easy to navigate. You receive the full loan up front. You repay the loan amount plus interest through fixed payments over a predetermined time frame. With the right lender, it can be a fast financing solution when you need cash on hand.',
  'At Cardiff, we structure our short-term loans to match the rhythm of your business, helping you move forward with clarity, confidence, and control. What Is a Short-Term Business Loan? A short-term business loan is a fixed-amount loan repaid over a brief period, typically six to 18 months. Term loans offer payment predictability. You know exactly how much you’re borrowing, the repayment schedule, and the cost of capital up front. Once you lock in your loan amount and interest rate, your payments don’t change or fluctuate. Simply make the same recurring payment until you pay it off.',
  'If you want to pay your loan off sooner than the end of the term and reduce your debt burden, you can do that, too. We offer loans with no prepayment penalties, so you pay less interest over the life of your loan.',
  'Short-term loans are especially useful for:',
];

const closingParagraph =
  'If you don’t want to carry debt for years but still need access to reliable funds, short-term loans give you financial flexibility without a long-term commitment.';

const defaultCardGrid = {
  type: 'card-grid' as const,
  id: 'sec-1-grid-9',
  order: 99,
  columns: 3,
  cards: [
    { id: 'gc-1-0', title: 'Managing temporary cash flow gaps', description: '', icon: 'check_circle' },
    { id: 'gc-1-1', title: 'Financing urgent operational expenses', description: '', icon: 'check_circle' },
    { id: 'gc-1-2', title: 'Covering seasonal slowdowns', description: '', icon: 'check_circle' },
    { id: 'gc-1-3', title: 'Paying for inventory purchases', description: '', icon: 'check_circle' },
    { id: 'gc-1-4', title: 'Handling emergency repairs or short-term investments', description: '', icon: 'check_circle' },
  ],
  elementStyles: {
    card: {
      backgroundColor: '#ffffff',
      borderRadius: '10px',
      padding: '20px',
      customCSS: 'box-shadow: 0 2px 10px rgba(37,65,139,0.06); border: 1px solid #e8edf6',
    },
    cardIcon: {
      color: '#ef6632',
      fontSize: '22px',
      margin: '0 0 8px 0',
    },
    cardTitle: {
      color: '#25418b',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '0.9375rem',
      fontWeight: '700',
      margin: '0 0 4px 0',
    },
    cardDescription: {
      color: '#525f7f',
      fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '0.8125rem',
      lineHeight: '1.5',
      margin: '0',
    },
  },
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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id='${TARGET_BLOCK_ID}'; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: block '${TARGET_BLOCK_ID}' is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }

  // Preserve any existing card-grid from sec-1 (re-runs should not lose it).
  type GridBlock = typeof defaultCardGrid;
  const existingGrid: GridBlock | undefined = (sec.blocks || []).find(
    (b: { type?: string }) => b?.type === 'card-grid',
  );
  const cardGrid: GridBlock = existingGrid ?? defaultCardGrid;

  // Widen so pill row breathes.
  sec.maxWidth = '1100px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '72px',
    paddingBottom: '72px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const bodyBlocks = introParagraphs.map((content, i) => ({
    type: 'text' as const,
    id: `sec-1-body-${i}`,
    order: 10 + i,
    content,
    style: { ...bodyTextStyle },
  }));

  const closingBlock = {
    type: 'text' as const,
    id: 'sec-1-body-close',
    order: 200,
    content: closingParagraph,
    style: { ...bodyTextStyle },
  };

  // Reset child blocks: pill row -> body intro paragraphs -> existing card-grid -> closing line.
  sec.blocks = [
    pillsBlock,
    {
      type: 'text' as const,
      id: 'sec-1-body-spacer',
      order: 2,
      content: '<div style="height:40px"></div>',
      style: { margin: '0' },
    },
    ...bodyBlocks,
    { ...cardGrid, order: 100 },
    closingBlock,
  ];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-1 -> styled pill stat row + tightened body typography. Child blocks: ${sec.blocks.length}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
