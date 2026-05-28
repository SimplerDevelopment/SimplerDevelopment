/**
 * Iter 5 — Working Capital page (post 837).
 *
 * Biggest remaining unstyled content: the "What kinds of working capital are
 * available?" UL — 3 loan-type items (Term Loans / Business Line of Credit /
 * Working Capital advance) — currently buried as raw <ul><li> markup inside
 * the 2-col sec-1-2col block's right column. Reads as a wall of bullet text.
 *
 * Fix:
 *   1. Insert a NEW top-level section `sec-2-kinds` between `sec-1-2col`
 *      and `sec-3` (qualify), containing:
 *        - centered H2 + orange underline (consistent w/ iter3/iter4)
 *        - one html-render block `sec-2-kinds-grid` rendering a 3-up icon
 *          card grid via data-repeat="kinds" and {{kinds.field}} placeholders
 *          (icon, title, body per card). Uses the iter3 styled-equipment
 *          card-grid recipe (gradient icon chips, white cards, hover lift).
 *   2. Trim sec-1-2col column 2 so its body becomes a short lead-in that
 *      defers detail to the new section — avoids duplicate copy. Only the
 *      column's body string is rewritten; the rest of sec-1-2col is left
 *      intact so iter2's layout still works.
 *
 * Idempotent: re-running detects `sec-2-kinds` and rewrites it in place;
 * also re-normalizes sec-1-2col column[1].body to the trimmed version.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 837;
const NEW_SECTION_ID = 'sec-2-kinds';
const GRID_BLOCK_ID = 'sec-2-kinds-grid';

const TRIMMED_COL2_BODY =
  '<p>In general, there are three types of working capital financing — each suited to a different cash-flow rhythm. See the side-by-side comparison below.</p>';

const KINDS_HTML = `
<style>
  .cd-wc-kinds { max-width: 1140px; margin: 0 auto; }
  .cd-wc-kinds__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-wc-kinds__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-wc-kinds__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-wc-kinds__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-wc-kinds__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-wc-kinds__card:nth-child(2) .cd-wc-kinds__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-wc-kinds__card:nth-child(3) .cd-wc-kinds__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-wc-kinds__icon .material-icons { font-size: 30px; }
  .cd-wc-kinds__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-wc-kinds__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-wc-kinds__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-wc-kinds__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-wc-kinds__card { padding: 26px 22px; }
  }
</style>
<div class="cd-wc-kinds">
  <p class="cd-wc-kinds__intro" data-field="intro">{{intro}}</p>
  <div class="cd-wc-kinds__grid">
    <div class="cd-wc-kinds__card" data-repeat="kinds">
      <div class="cd-wc-kinds__icon"><span class="material-icons" data-field="icon">{{kinds.icon}}</span></div>
      <h3 class="cd-wc-kinds__card-title" data-field="title">{{kinds.title}}</h3>
      <p class="cd-wc-kinds__card-desc" data-field="body">{{kinds.body}}</p>
    </div>
  </div>
</div>
`.trim();

const KINDS_DEFAULTS = {
  intro:
    "Three loan structures, three different cash-flow rhythms. Pick the shape of capital that fits how your revenue actually arrives.",
  kinds: [
    {
      icon: 'event_repeat',
      title: 'Term Loans',
      body:
        "What you probably picture when you think of a loan: a set term, a fixed interest rate, and a predictable payoff schedule. Good for one-time investments you can amortize over time.",
    },
    {
      icon: 'credit_card',
      title: 'Business Line of Credit',
      body:
        "Works a lot like a credit card — you have a credit limit and interest rate, and you make a monthly payment — but you can borrow and repay as needed, typically at much higher limits than a card.",
    },
    {
      icon: 'trending_up',
      title: 'Working Capital Advance',
      body:
        "Uses your future revenue as collateral. You borrow against a percentage of monthly revenue and repay as customers pay you — either as a fixed payment or a flat percentage that flexes with monthly sales.",
    },
  ],
} as const;

const kindsGridBlock = {
  id: GRID_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: KINDS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: KINDS_DEFAULTS.intro },
    {
      name: 'kinds',
      label: 'Working capital types',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' as const },
        { name: 'title', label: 'Card title', type: 'text' as const },
        { name: 'body', label: 'Card body', type: 'textarea' as const },
      ],
    },
  ],
  values: { intro: KINDS_DEFAULTS.intro, kinds: [...KINDS_DEFAULTS.kinds] },
};

const headerBlock = {
  type: 'heading' as const,
  id: 'sec-2-kinds-title',
  order: 1,
  level: 2,
  content: 'What kinds of working capital are available?',
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
  id: 'sec-2-kinds-div',
  order: 2,
  content:
    '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
  style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
};

const kindsSection = {
  id: NEW_SECTION_ID,
  type: 'section' as const,
  order: 2,
  maxWidth: '1200px',
  style: {
    backgroundColor: '#ffffff',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  blocks: [headerBlock, dividerBlock, kindsGridBlock],
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

  // 1) Trim sec-1-2col column 2 body so the new section is the source of truth.
  const twoColIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sec-1-2col');
  if (twoColIdx === -1) {
    console.error(`Post ${POST_ID}: sec-1-2col not found; iter2 must run first; aborting`);
    process.exit(1);
  }
  const twoCol = parsed.blocks[twoColIdx];
  if (Array.isArray(twoCol?.values?.columns) && twoCol.values.columns[1]) {
    twoCol.values.columns[1].body = TRIMMED_COL2_BODY;
  }

  // 2) Insert or replace sec-2-kinds between sec-1-2col and sec-3.
  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === NEW_SECTION_ID);
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = kindsSection;
    console.log(`Replaced existing ${NEW_SECTION_ID} at index ${existingIdx} (re-run).`);
  } else {
    const sec3Idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sec-3');
    if (sec3Idx === -1) {
      console.error(`Post ${POST_ID}: sec-3 not found; cannot place sec-2-kinds; aborting`);
      process.exit(1);
    }
    parsed.blocks.splice(sec3Idx, 0, kindsSection);
    console.log(`Inserted ${NEW_SECTION_ID} at index ${sec3Idx}.`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: trimmed sec-1-2col col[1] body, ensured ${NEW_SECTION_ID}. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
