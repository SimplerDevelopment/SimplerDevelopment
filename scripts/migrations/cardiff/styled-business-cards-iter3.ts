/**
 * Iter 3: Restyle the "Who Should Consider a Cardiff Business Credit Card?"
 * section on post 797 (business-cards). This is sec-5 — currently a long
 * stack of intro paragraphs followed by 5 H3 + paragraph pairs of "Key
 * Features" (Fast Application, Revenue-Based Eligibility, Merchant Financing,
 * Flexible Repayment, Transparent Terms) with no visual structure.
 *
 * Mirrors the icon-card grid treatment used by styled-equipment-leasing-iter3:
 *   1. Centered H2 + orange underline
 *   2. Short audience intro
 *   3. A single html-render block carrying a 5-up icon card grid on a
 *      light-blue gradient backdrop, using `data-repeat="features"` so
 *      editors can add/remove feature cards without touching HTML.
 *   4. Closing summary line
 *
 * Layout: 3 cards top row, 2 cards bottom row centered (auto-fit grid),
 * each card has a circular icon chip (Material Icons), title, and copy.
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632) accents — no emojis.
 *
 * Idempotent: re-running replaces sec-5's children with the same three
 * blocks (heading, divider, html-render) every time; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 797;
const TARGET_BLOCK_ID = 'sec-5';

const WHO_HTML = `
<style>
  .cd-bc-who { max-width: 1140px; margin: 0 auto; }
  .cd-bc-who__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 16px auto; }
  .cd-bc-who__intro:last-of-type { margin-bottom: 48px; }
  .cd-bc-who__eyebrow { text-align: center; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #ef6632; margin: 0 0 12px 0; }
  .cd-bc-who__section-title { text-align: center; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.6rem; font-weight: 800; color: #1c3370; margin: 0 auto 32px auto; line-height: 1.25; letter-spacing: -0.01em; max-width: 720px; }
  .cd-bc-who__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-bc-who__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-bc-who__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bc-who__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-bc-who__card:nth-child(2) .cd-bc-who__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bc-who__card:nth-child(4) .cd-bc-who__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bc-who__icon .material-icons { font-size: 30px; }
  .cd-bc-who__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-bc-who__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-bc-who__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-bc-who__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-bc-who__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-bc-who__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bc-who__card { padding: 26px 22px; }
    .cd-bc-who__closer { padding: 22px 20px; }
  }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<div class="cd-bc-who">
  <p class="cd-bc-who__intro" data-field="intro1">{{intro1}}</p>
  <p class="cd-bc-who__intro" data-field="intro2">{{intro2}}</p>
  <p class="cd-bc-who__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
  <h3 class="cd-bc-who__section-title" data-field="featuresTitle">{{featuresTitle}}</h3>
  <div class="cd-bc-who__grid">
    <div class="cd-bc-who__card" data-repeat="features">
      <div class="cd-bc-who__icon"><span class="material-icons" data-field="icon">{{features.icon}}</span></div>
      <h3 class="cd-bc-who__card-title" data-field="title">{{features.title}}</h3>
      <p class="cd-bc-who__card-desc" data-field="desc">{{features.desc}}</p>
    </div>
  </div>
  <div class="cd-bc-who__closer">
    <p class="cd-bc-who__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const FIELDS = [
  {
    name: 'intro1',
    label: 'Intro paragraph 1',
    type: 'textarea',
    default:
      'Do you want flexible access to capital without the red tape of traditional financing? Unlike rigid loan structures, Cardiff’s cash advance business credit card is designed to meet the needs of real businesses, especially if your revenue fluctuates throughout the year.',
  },
  {
    name: 'intro2',
    label: 'Intro paragraph 2',
    type: 'textarea',
    default:
      'A Cardiff card gives you working capital on demand — without the hassle of applying for a new loan each time a need arises. From short-term operating costs to upgrading software and equipment, it’s a simple, reliable way to fund your next move.',
  },
  { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'Key Features' },
  {
    name: 'featuresTitle',
    label: 'Features section title',
    type: 'text',
    default: 'Built to keep your business agile',
  },
  {
    name: 'features',
    label: 'Feature cards',
    type: 'repeater',
    fields: [
      { name: 'icon', label: 'Material icon', type: 'text' },
      { name: 'title', label: 'Card title', type: 'text' },
      { name: 'desc', label: 'Card description', type: 'textarea' },
    ],
    default: [
      {
        icon: 'bolt',
        title: 'Fast Application and Approval',
        desc: 'Apply online in minutes. Our process is streamlined to get you approved quickly, so you don’t waste time waiting for access to funds.',
      },
      {
        icon: 'trending_up',
        title: 'Revenue-Based Eligibility',
        desc: 'We look at your business performance, not just your credit score — better access for small businesses with strong revenue but limited credit history.',
      },
      {
        icon: 'point_of_sale',
        title: 'Merchant Financing On-Demand',
        desc: 'Our cards support merchant credit card advance loans that let you repay based on future sales, relieving cash-flow pressure during slower months.',
      },
      {
        icon: 'tune',
        title: 'Flexible Repayment Options',
        desc: 'Whether you use your card for purchases or advances, we can tailor your repayment structure to match your revenue cycles.',
      },
      {
        icon: 'verified_user',
        title: 'Transparent Terms, No Surprise Fees',
        desc: 'We believe in clear communication and no surprises. Rates and fees are stated upfront, with no hidden charges or predatory terms.',
      },
    ],
  },
  {
    name: 'closer',
    label: 'Closing summary',
    type: 'textarea',
    default:
      'Cardiff understands that small businesses need financial flexibility and transparency — a credit card that moves at the pace of your business.',
  },
];

const VALUES: Record<string, unknown> = {};
for (const f of FIELDS) VALUES[f.name] = (f as { default: unknown }).default;

const whoBlock = {
  id: 'sec-5-who',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: WHO_HTML,
  fields: FIELDS,
  values: VALUES,
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${POST_ID} not found`);
    process.exit(1);
  }
  const parsed = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
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
    console.error(
      `Post ${POST_ID}: block '${TARGET_BLOCK_ID}' is not a section (was ${sec.type}); aborting`,
    );
    process.exit(1);
  }

  // Widen so the 3-col card grid breathes.
  sec.maxWidth = '1200px';
  // Soft blue-tinted background to set this band apart from neighbors.
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-5-title',
    order: 1,
    level: 2,
    content: 'Who Should Consider a Cardiff Business Credit Card?',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
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
    id: 'sec-5-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, whoBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-5 -> styled 5-card "Who Should Consider" grid.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
