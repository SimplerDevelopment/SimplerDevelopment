/**
 * Annual Letter iter 9 — Style the "Fast, Flexible Funding On Your Terms"
 * section (sec-4) on post 794. After iters 1-8, sec-4 is still a bare H2 +
 * orange divider + 2 wall-of-text paragraphs — the largest remaining
 * unstyled section on this page (sec-3 and sec-7 are similarly bare but
 * shorter / more about-y; sec-4 is the natural "value props" band).
 *
 * Iter 9 keeps sec-4-title + sec-4-div, drops the long bare paragraphs,
 * and replaces them with:
 *   1. A short Open Sans intro line distilled from the existing prose.
 *   2. A single html-render block carrying an icon-card grid (same
 *      pattern family as styled-equipment-leasing-iter3.ts) driven by
 *      `data-repeat="cards"` with {{cards.icon}}/{{cards.title}}/
 *      {{cards.desc}} bindings — so the editor sees one repeater field
 *      instead of N indexed fields.
 *   3. A small closing band that surfaces the "bank loan isn't your only
 *      option" line as a brand-styled aside.
 *
 * Card content is synthesized strictly from claims already on this same
 * page (sec-4 + sec-1 stats + sec-5 product copy) — no new promises.
 *
 * Idempotent: re-running rewrites sec-4.blocks wholesale; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 794;
const TARGET_BLOCK_ID = 'sec-4';

const FUND_HTML = `
<style>
  .cd-al-fund { max-width: 1140px; margin: 0 auto; }
  .cd-al-fund__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 48px auto; }
  .cd-al-fund__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-al-fund__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-al-fund__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-al-fund__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-al-fund__card:nth-child(2) .cd-al-fund__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-al-fund__card:nth-child(3) .cd-al-fund__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-al-fund__card:nth-child(5) .cd-al-fund__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-al-fund__card:nth-child(6) .cd-al-fund__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-al-fund__icon .material-icons { font-size: 30px; }
  .cd-al-fund__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-al-fund__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-al-fund__closer { margin: 48px auto 0 auto; max-width: 860px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-al-fund__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-al-fund__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-al-fund__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-al-fund__card { padding: 26px 22px; }
    .cd-al-fund__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-al-fund">
  <p class="cd-al-fund__intro" data-field="intro">{{intro}}</p>
  <div class="cd-al-fund__grid">
    <div class="cd-al-fund__card" data-repeat="cards">
      <div class="cd-al-fund__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <h3 class="cd-al-fund__card-title" data-field="title">{{cards.title}}</h3>
      <p class="cd-al-fund__card-desc" data-field="desc">{{cards.desc}}</p>
    </div>
  </div>
  <div class="cd-al-fund__closer">
    <p class="cd-al-fund__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const FUND_DEFAULTS = {
  intro:
    'Time is money. When you wait months to secure capital, you miss opportunities and fall behind the competition. Cardiff offers fast, unsecured business funding that cuts through red tape and prioritizes speed without sacrificing service.',
  cards: [
    {
      icon: 'bolt',
      title: 'Same-Day Decisions',
      desc: 'Our streamlined online application is built for speed. Applicants typically receive a same-day decision so you can move on opportunities the moment they appear.',
    },
    {
      icon: 'lock_open',
      title: 'Unsecured Funding',
      desc: 'No collateral required. Cardiff offers unsecured business loans so you can free up cash flow without pledging equipment, real estate, or other business assets.',
    },
    {
      icon: 'verified_user',
      title: 'Imperfect Credit Welcome',
      desc: 'You don’t need perfect credit to qualify. We weigh the overall health, revenue, and performance of your business — not just a number on a credit report.',
    },
    {
      icon: 'tune',
      title: 'Terms On Your Schedule',
      desc: 'Repayment structures adapt to your revenue cycles, easing cash flow during slow seasons or growth spurts so payments never get in the way of momentum.',
    },
    {
      icon: 'speed',
      title: 'Fast Funding',
      desc: 'Approved deals can fund as quickly as the same day. Put capital to work immediately — whether it’s payroll, inventory, equipment, or a time-sensitive opportunity.',
    },
    {
      icon: 'handshake',
      title: 'Real People, Real Service',
      desc: 'You’re never just an application number. Cardiff’s funding advisors stay with you through approval and beyond, so you always know who is in your corner.',
    },
  ],
  closer:
    "If you've ever searched 'need funding for my business,' you already know how limited the traditional lending landscape can be. A bank loan isn't your only option — Cardiff offers finance loans for business that are attainable no matter where you are on your journey.",
} as const;

const fundBlock = {
  id: 'sec-4-fund',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: FUND_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: FUND_DEFAULTS.intro },
    {
      name: 'cards',
      label: 'Funding-benefit cards',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
      default: FUND_DEFAULTS.cards,
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: FUND_DEFAULTS.closer },
  ],
  values: { ...FUND_DEFAULTS },
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
    console.error(
      `Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`,
    );
    process.exit(1);
  }

  // Widen so the 3-col card grid breathes; keep the existing soft-blue band.
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
    id: 'sec-4-title',
    order: 1,
    level: 2,
    content: 'Fast, Flexible Funding On Your Terms',
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
    id: 'sec-4-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, fundBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-4 -> styled 6-card "Fast, Flexible Funding" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
