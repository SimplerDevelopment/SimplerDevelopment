/**
 * Iter 4: Style sec-3 on post 803 (Getting Ready for a Loan).
 *
 * Current state: sec-3 = centered H2 ("Consider these items before you apply
 * for a business loan or business line of credit:") + a single one-line
 * teaser paragraph. Nothing else. Largest remaining unstyled band on the
 * page — the heading promises a checklist but the body delivers a half-
 * thought sentence with no visual structure.
 *
 * Fix: keep the centered title + orange underline, replace the lone
 * paragraph with an html-render block carrying a 6-up icon-card grid of
 * real "consider before you apply" topics, on a light-blue section.
 * Same pattern as styled-equipment-leasing-iter3 (icon-card grid via
 * data-repeat), brand palette only, Material Icons (no emojis).
 *
 * Idempotent: re-running rebuilds sec-3's children with the same ids.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 803;
const TARGET_BLOCK_ID = 'sec-3';

const CONSIDER_HTML = `
<style>
  .cd-gr-consider { max-width: 1140px; margin: 0 auto; }
  .cd-gr-consider__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-gr-consider__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-gr-consider__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-gr-consider__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-gr-consider__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-gr-consider__card:nth-child(2) .cd-gr-consider__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-gr-consider__card:nth-child(3) .cd-gr-consider__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-gr-consider__card:nth-child(5) .cd-gr-consider__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-gr-consider__card:nth-child(6) .cd-gr-consider__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-gr-consider__icon .material-icons { font-size: 30px; }
  .cd-gr-consider__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-gr-consider__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-gr-consider__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-gr-consider__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-gr-consider__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-gr-consider__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-gr-consider__card { padding: 26px 22px; }
    .cd-gr-consider__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-gr-consider">
  <p class="cd-gr-consider__intro" data-field="intro">{{intro}}</p>
  <div class="cd-gr-consider__grid">
    <div class="cd-gr-consider__card" data-repeat="cards">
      <div class="cd-gr-consider__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <h3 class="cd-gr-consider__card-title" data-field="title">{{cards.title}}</h3>
      <p class="cd-gr-consider__card-desc" data-field="desc">{{cards.desc}}</p>
    </div>
  </div>
  <div class="cd-gr-consider__closer">
    <p class="cd-gr-consider__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const CONSIDER_VALUES = {
  intro: 'Although many small businesses experience ups and downs in cash flow, small business loans can cover your financing needs. Before you apply, take a moment to think through these six items so the process moves quickly.',
  cards: [
    {
      icon: 'flag',
      title: 'Purpose of the Loan',
      desc: 'Know exactly what you’re funding — equipment, payroll, inventory, expansion — so the loan structure and term match the use of funds.',
    },
    {
      icon: 'payments',
      title: 'How Much You Need',
      desc: 'Borrow what you can comfortably repay. Tie the request to a clear budget so you don’t over- or under-finance the opportunity.',
    },
    {
      icon: 'event_repeat',
      title: 'Repayment Comfort',
      desc: 'Look at your monthly cash flow and decide what payment cadence — daily, weekly, or monthly — fits your revenue rhythm.',
    },
    {
      icon: 'insights',
      title: 'Business Financials',
      desc: 'Have recent bank statements, revenue figures, and basic P&L numbers handy. Lenders move faster when the picture is current.',
    },
    {
      icon: 'badge',
      title: 'Personal & Business Credit',
      desc: 'Know your credit profile going in. Cardiff works with a wide range of credit, but knowing your score helps set expectations.',
    },
    {
      icon: 'description',
      title: 'Documents Ready to Go',
      desc: 'A driver’s license, voided business check, and recent bank statements cover most applications. Have them within reach before you start.',
    },
  ],
  closer: 'With these six items in mind, you’re set up to move through the application smoothly — and get a decision in minutes, not days.',
};

const considerBlock = {
  id: 'sec-3-consider',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: CONSIDER_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: CONSIDER_VALUES.intro },
    {
      name: 'cards',
      label: 'Consideration cards',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: CONSIDER_VALUES.closer },
  ],
  values: { ...CONSIDER_VALUES },
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

  // Widen + soft-blue band to set this section apart from the white sec-2 / sec-4 above and below.
  sec.maxWidth = '1200px';
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
    id: 'sec-3-title',
    order: 1,
    level: 2,
    content: 'Consider these items before you apply',
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
  sec.blocks = [headerBlock, dividerBlock, considerBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-3 -> styled 6-card "Consider before you apply" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
