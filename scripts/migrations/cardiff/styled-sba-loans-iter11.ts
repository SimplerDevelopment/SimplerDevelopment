/**
 * Iter 11 — post 829 (SBA Loans). Iters 1-10 styled every other band on
 * the page; the only remaining gap vs. the sibling product pages (e.g.
 * equipment-leasing sec-8 "Why Choose Cardiff for Equipment Leasing and
 * Loans?") is sec-6 — currently a thin 3-card "Why choose Cardiff" grid
 * with no intro paragraph and no closing summary band. The visual weight
 * is wrong: it should be the page's marquee differentiator section.
 *
 * This iter upgrades sec-6 to match the full iter3 5-card pattern from
 * `styled-equipment-leasing-iter3.ts` — same icon-chip cards (alternating
 * blue/orange/green gradient chips on nth-child positions), an intro
 * paragraph, a closer card band, and an upgraded centered title styling
 * (#1c3370 + 2.25rem like the other section titles on this page).
 * The 5 cards are SBA-specific (transparent rates, decades of experience,
 * SBA preferred-lender expertise, flexible terms, hands-on guidance).
 *
 * The card grid is rendered via a single `data-repeat="cards"` template
 * — consistent with how iters 1-10 modeled list-shaped content on 829 —
 * so editors add/remove differentiators from one array control instead
 * of editing five fixed slots.
 *
 * Idempotent: locates sec-6 by id and rewrites its sub-blocks + style in
 * place; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 829;
const TARGET_BLOCK_ID = 'sec-6';

const WHY_HTML = `
<style>
  .cd-sba-why { max-width: 1140px; margin: 0 auto; }
  .cd-sba-why__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-sba-why__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-sba-why__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-sba-why__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-sba-why__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-sba-why__card:nth-child(2) .cd-sba-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-sba-why__card:nth-child(4) .cd-sba-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-sba-why__card:nth-child(5) .cd-sba-why__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.36); }
  .cd-sba-why__icon .material-icons { font-size: 30px; }
  .cd-sba-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-sba-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-sba-why__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-sba-why__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-sba-why__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-sba-why__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-sba-why__card { padding: 26px 22px; }
    .cd-sba-why__closer { padding: 22px 20px; }
  }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<div class="cd-sba-why">
  <p class="cd-sba-why__intro" data-field="intro">{{intro}}</p>
  <div class="cd-sba-why__grid">
    <div class="cd-sba-why__card" data-repeat="cards">
      <div class="cd-sba-why__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <h3 class="cd-sba-why__card-title" data-field="title">{{cards.title}}</h3>
      <p class="cd-sba-why__card-desc" data-field="desc">{{cards.desc}}</p>
    </div>
  </div>
  <div class="cd-sba-why__closer">
    <p class="cd-sba-why__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const WHY_CARDS = [
  {
    icon: 'price_check',
    title: 'Transparent Rates',
    desc: 'Our business loan rates start at 5.99%, giving you a clear, predictable cost of capital with no hidden fees and no surprises after you sign.',
  },
  {
    icon: 'workspace_premium',
    title: 'Nearly 20 Years of Experience',
    desc: 'We have a proven track record serving small businesses across the country with the SBA-backed funding solutions and guidance they need to grow.',
  },
  {
    icon: 'verified_user',
    title: 'SBA-Savvy Specialists',
    desc: 'Our team knows the SBA program inside and out, so you spend less time wrestling with paperwork and more time running your business.',
  },
  {
    icon: 'tune',
    title: 'Flexible Terms',
    desc: 'Repayment structures adapt to your revenue cycles — easing cash flow during slow seasons or growth spurts so monthly payments stay manageable.',
  },
  {
    icon: 'handshake',
    title: 'Hands-On Guidance',
    desc: 'A dedicated funding specialist walks you through every step, from initial application to funded close — no call centers, no run-around.',
  },
];

const WHY_DEFAULTS = {
  intro:
    "If you're looking for a partner to back your SBA loan, Cardiff brings distinct advantages we're proud to offer every small-business owner we work with.",
  cards: WHY_CARDS,
  closer:
    'Whether you’re funding new equipment, refinancing higher-cost debt, or expanding into a new location, Cardiff has the SBA loan products and the team to help you move fast.',
} as const;

const WHY_FIELDS = [
  { name: 'intro', label: 'Intro paragraph', type: 'textarea' as const },
  {
    name: 'cards',
    label: 'Why-Cardiff cards',
    type: 'array' as const,
    itemFields: [
      { name: 'icon', label: 'Material Icons name', type: 'text' as const },
      { name: 'title', label: 'Card title', type: 'text' as const },
      { name: 'desc', label: 'Card description', type: 'textarea' as const },
    ],
  },
  { name: 'closer', label: 'Closing summary', type: 'textarea' as const },
];

const whyBlock = {
  id: 'sec-6-why',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: WHY_HTML,
  fields: WHY_FIELDS,
  values: { ...WHY_DEFAULTS },
};

const headerBlock = {
  type: 'heading' as const,
  id: 'sec-6-title',
  order: 1,
  level: 2 as const,
  content: 'Why Choose Cardiff for SBA Loans?',
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
  content:
    '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
  style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
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

  sec.width = 'full';
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };
  sec.blocks = [headerBlock, dividerBlock, whyBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-6 -> styled 5-card "Why Choose Cardiff for SBA Loans?" grid with intro + closer.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
