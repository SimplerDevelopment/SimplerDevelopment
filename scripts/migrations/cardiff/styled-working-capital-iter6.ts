/**
 * Iter 6 — Working Capital page (post 837).
 *
 * Biggest remaining unstyled content: ~5 paragraphs of real-world example
 * narratives currently buried as prose (purchase orders, doctors/dentists
 * waiting on insurance, seasonal restaurants/clothing manufacturers, kitchen
 * fires + equipment repairs + taxes). These are the page's most concrete
 * scenarios — perfect for a 4-up "When working capital makes sense" icon-card
 * grid (iter3 styled-equipment recipe with data-repeat).
 *
 * Fix:
 *   1. Insert a NEW top-level section `sec-1b-scenarios` between
 *      `sec-1-2col` and `sec-2-kinds`, containing:
 *        - centered H2 + orange underline (consistent w/ iter3/iter5)
 *        - one html-render block `sec-1b-scenarios-grid` rendering a 4-up
 *          icon card grid via data-repeat="scenarios" with {{scenarios.field}}
 *          placeholders (icon, title, body per card).
 *   2. Trim sec-1-2col `intro` to just the lead sentence (defers detail to
 *      the new scenarios section).
 *   3. Trim sec-1-2col column[0].body — strip the seasonal/unexpected
 *      paragraphs that now live as scenario cards; keep the formula + faster-
 *      funding lines.
 *
 * Idempotent: re-running detects `sec-1b-scenarios` and rewrites it in place;
 * always re-normalizes sec-1-2col intro + column[0].body to the trimmed copy.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 837;
const NEW_SECTION_ID = 'sec-1b-scenarios';
const GRID_BLOCK_ID = 'sec-1b-scenarios-grid';

const TRIMMED_INTRO =
  '<p>When your small business needs to maximize cash flow, a working capital loan might be the solution. Here are some of the most common scenarios where it pays off.</p>';

const TRIMMED_COL0_BODY =
  '<p>Calculating the amount of working capital your business needs comes down to a relatively simple formula. In general, working capital is the difference between current assets and current liabilities &mdash; though that number likely changes each month as bills get paid.</p>\n<p>A better way to gauge how much working capital your business needs is based on your <strong>operating cycle</strong> &mdash; the amount of time it takes your business to create and sell a product. Factor cash flow during each cycle to size the loan accurately.</p>\n<p>And when the unexpected happens, Cardiff can deposit funds into your account within 24 hours.</p>';

const SCENARIOS_HTML = `
<style>
  .cd-wc-scn { max-width: 1140px; margin: 0 auto; }
  .cd-wc-scn__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-wc-scn__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-wc-scn__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-wc-scn__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-wc-scn__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-wc-scn__card:nth-child(2) .cd-wc-scn__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-wc-scn__card:nth-child(3) .cd-wc-scn__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-wc-scn__card:nth-child(4) .cd-wc-scn__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.4); }
  .cd-wc-scn__icon .material-icons { font-size: 30px; }
  .cd-wc-scn__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.15rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-wc-scn__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 1080px) {
    .cd-wc-scn__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-wc-scn__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-wc-scn__card { padding: 26px 22px; }
  }
</style>
<div class="cd-wc-scn">
  <p class="cd-wc-scn__intro" data-field="intro">{{intro}}</p>
  <div class="cd-wc-scn__grid">
    <div class="cd-wc-scn__card" data-repeat="scenarios">
      <div class="cd-wc-scn__icon"><span class="material-icons" data-field="icon">{{scenarios.icon}}</span></div>
      <h3 class="cd-wc-scn__card-title" data-field="title">{{scenarios.title}}</h3>
      <p class="cd-wc-scn__card-desc" data-field="body">{{scenarios.body}}</p>
    </div>
  </div>
</div>
`.trim();

const SCENARIOS_DEFAULTS = {
  intro:
    "Working capital fills the gap between when you spend money and when the money comes back. Four common situations where that gap shows up:",
  scenarios: [
    {
      icon: 'inventory_2',
      title: 'Large purchase orders',
      body:
        "You landed a big retail order and need to pay for product to fulfill it. The retailer pays you when product sells — but payroll, rent, and supplies are due now.",
    },
    {
      icon: 'medical_services',
      title: 'Insurance reimbursements',
      body:
        "Doctors and dentists provide a covered service, then wait weeks for insurance to pay. A working capital loan keeps the lights on while reimbursements catch up.",
    },
    {
      icon: 'restaurant',
      title: 'Seasonal cash-flow cycles',
      body:
        "Restaurants run fast cycles; clothing manufacturers run seasonal ones. Working capital smooths the dips so a slow month never starves the next growth spurt.",
    },
    {
      icon: 'build_circle',
      title: 'Unexpected emergencies',
      body:
        "Kitchen fires, equipment repairs, a surprise tax bill. When the unexpected hits, Cardiff can deposit funds in your account within 24 hours.",
    },
  ],
} as const;

const scenariosGridBlock = {
  id: GRID_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: SCENARIOS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: SCENARIOS_DEFAULTS.intro },
    {
      name: 'scenarios',
      label: 'Working-capital scenarios',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' as const },
        { name: 'title', label: 'Card title', type: 'text' as const },
        { name: 'body', label: 'Card body', type: 'textarea' as const },
      ],
    },
  ],
  values: { intro: SCENARIOS_DEFAULTS.intro, scenarios: [...SCENARIOS_DEFAULTS.scenarios] },
};

const headerBlock = {
  type: 'heading' as const,
  id: 'sec-1b-scenarios-title',
  order: 1,
  level: 2,
  content: 'When working capital makes sense',
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
  id: 'sec-1b-scenarios-div',
  order: 2,
  content:
    '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
  style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
};

const scenariosSection = {
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
  blocks: [headerBlock, dividerBlock, scenariosGridBlock],
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

  // 1) Trim sec-1-2col intro + column[0].body — defers scenarios to new section.
  const twoColIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sec-1-2col');
  if (twoColIdx === -1) {
    console.error(`Post ${POST_ID}: sec-1-2col not found; iter2 must run first; aborting`);
    process.exit(1);
  }
  const twoCol = parsed.blocks[twoColIdx];
  if (twoCol?.values) {
    twoCol.values.intro = TRIMMED_INTRO;
    if (Array.isArray(twoCol.values.columns) && twoCol.values.columns[0]) {
      twoCol.values.columns[0].body = TRIMMED_COL0_BODY;
    }
  }

  // 2) Insert or replace sec-1b-scenarios between sec-1-2col and sec-2-kinds.
  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === NEW_SECTION_ID);
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = scenariosSection;
    console.log(`Replaced existing ${NEW_SECTION_ID} at index ${existingIdx} (re-run).`);
  } else {
    const kindsIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sec-2-kinds');
    if (kindsIdx === -1) {
      console.error(`Post ${POST_ID}: sec-2-kinds not found; iter5 must run first; aborting`);
      process.exit(1);
    }
    parsed.blocks.splice(kindsIdx, 0, scenariosSection);
    console.log(`Inserted ${NEW_SECTION_ID} at index ${kindsIdx}.`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: trimmed sec-1-2col intro+col[0].body, ensured ${NEW_SECTION_ID}. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
