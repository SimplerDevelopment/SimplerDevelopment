/**
 * Iter 3: Restyle the "Why Choose Cardiff's Revenue-Based Business Loans?"
 * section on post 828 (revenue-based-business-loans). This is sec-6 — three
 * unstyled H4 labels (Flexible Terms / Quick Approval Process / Easy
 * Repayment) with no descriptions visible (descriptions were truncated into
 * the intro paragraph in the source migration) and no visual structure.
 *
 * Cardiff.co's source page presents these as a "why us" benefits band; the
 * port shows them as bare H4 stubs. We replace sec-6's sub-blocks with:
 *   1. Centered H2 + orange underline (matches iter2 / equipment-leasing iter3)
 *   2. A single html-render block carrying a 4-up icon card grid with a
 *      closing summary line — same template family as
 *      styled-equipment-leasing-iter3.ts (icon-card grid), uses data-repeat
 *      so cards are editable as a list (`{{X.field}}` inside the loop).
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632), pink-accent (#ffb798). No emojis — Material Icons.
 *
 * Idempotent: re-running rewrites the html-render at id `sec-6-why` and the
 * surrounding header + divider; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 828;
const TARGET_BLOCK_ID = 'sec-6';

const WHY_HTML = `
<style>
  .cd-rb-why { max-width: 1140px; margin: 0 auto; }
  .cd-rb-why__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-rb-why__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
  .cd-rb-why__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-rb-why__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-rb-why__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-rb-why__card:nth-child(2) .cd-rb-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-rb-why__card:nth-child(3) .cd-rb-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-rb-why__card:nth-child(4) .cd-rb-why__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.38); }
  .cd-rb-why__icon .material-icons { font-size: 30px; }
  .cd-rb-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-rb-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9625rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-rb-why__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-rb-why__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 1100px) {
    .cd-rb-why__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-rb-why__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-rb-why__card { padding: 26px 22px; }
    .cd-rb-why__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-rb-why">
  <p class="cd-rb-why__intro" data-field="intro">{{intro}}</p>
  <div class="cd-rb-why__grid">
    <div class="cd-rb-why__card" data-repeat="cards">
      <div class="cd-rb-why__icon"><span class="material-icons" data-field="cards.icon">{{cards.icon}}</span></div>
      <h3 class="cd-rb-why__card-title" data-field="cards.title">{{cards.title}}</h3>
      <p class="cd-rb-why__card-desc" data-field="cards.desc">{{cards.desc}}</p>
    </div>
  </div>
  <div class="cd-rb-why__closer">
    <p class="cd-rb-why__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const WHY_DEFAULTS = {
  intro: "Many lenders offer revenue-based loans for business owners, but Cardiff’s solution offers unique benefits. Here’s why small businesses across industries choose us when they need capital that flexes with their revenue.",
  cards: [
    {
      icon: 'lock_open',
      title: 'No Collateral Required',
      desc: 'Our revenue-based business loans are unsecured. We don’t ask you to pledge valuable assets to access the capital you need to grow.',
    },
    {
      icon: 'tune',
      title: 'Flexible Terms',
      desc: 'Loan structures adapt to your revenue cycles so your payments stay manageable during slow seasons and scale with you in growth periods.',
    },
    {
      icon: 'bolt',
      title: 'Quick Approval Process',
      desc: 'Cardiff’s streamlined online application returns decisions fast — many applicants are approved same-day with funding shortly after.',
    },
    {
      icon: 'autorenew',
      title: 'Easy Repayment',
      desc: 'Repayments are tied to actual revenue, not a rigid monthly amount — so your cash flow stays predictable even when sales fluctuate.',
    },
  ],
  closer: 'Whether you’re managing seasonal demand or scaling a multi-location business, Cardiff’s revenue-based loans give you the working capital to grow on your terms.',
} as const;

const whyBlock = {
  id: 'sec-6-why',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: WHY_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: WHY_DEFAULTS.intro },
    {
      name: 'cards',
      label: 'Feature cards',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'desc', label: 'Card description', type: 'textarea' },
      ],
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: WHY_DEFAULTS.closer },
  ],
  values: { ...WHY_DEFAULTS },
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

  // Widen so the 4-col card grid breathes.
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
    id: 'sec-6-title',
    order: 1,
    level: 2,
    content: 'Why Choose Cardiff’s Revenue-Based Business Loans?',
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
    id: 'sec-6-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, whyBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-6 -> styled 4-card "Why Choose Cardiff" grid (revenue-based).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
