/**
 * Iter 3: Restyle the "Why Choose Cardiff for Equipment Leasing and Loans?"
 * section on post 802 (equipment-leasing). This is sec-8 — currently a long
 * stack of H3 + paragraph pairs (5 features) with no visual structure.
 *
 * Cardiff.co's source page presents these as a "why us" benefits band; the
 * port shows them as bare text. We replace sec-8 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter2)
 *   2. A single html-render block carrying a 5-up icon card grid on a
 *      light-blue gradient backdrop, with a closing summary line and CTA.
 *
 * Layout: 3 cards top row, 2 cards bottom row centered (auto-fit grid),
 * each card has a circular icon chip (Material Icons), title, and copy.
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632) accents — no emojis.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-8-why` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-8';

const WHY_HTML = `
<style>
  .cd-eq-why { max-width: 1140px; margin: 0 auto; }
  .cd-eq-why__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-eq-why__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-eq-why__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-eq-why__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-eq-why__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-eq-why__card:nth-child(2) .cd-eq-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-eq-why__card:nth-child(4) .cd-eq-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-eq-why__icon .material-icons { font-size: 30px; }
  .cd-eq-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-eq-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-eq-why__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-eq-why__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-eq-why__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-eq-why__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-eq-why__card { padding: 26px 22px; }
    .cd-eq-why__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-eq-why">
  <p class="cd-eq-why__intro" data-field="intro">{{intro}}</p>
  <div class="cd-eq-why__grid">
    <div class="cd-eq-why__card">
      <div class="cd-eq-why__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <h3 class="cd-eq-why__card-title" data-field="card1Title">{{card1Title}}</h3>
      <p class="cd-eq-why__card-desc" data-field="card1Desc">{{card1Desc}}</p>
    </div>
    <div class="cd-eq-why__card">
      <div class="cd-eq-why__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <h3 class="cd-eq-why__card-title" data-field="card2Title">{{card2Title}}</h3>
      <p class="cd-eq-why__card-desc" data-field="card2Desc">{{card2Desc}}</p>
    </div>
    <div class="cd-eq-why__card">
      <div class="cd-eq-why__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <h3 class="cd-eq-why__card-title" data-field="card3Title">{{card3Title}}</h3>
      <p class="cd-eq-why__card-desc" data-field="card3Desc">{{card3Desc}}</p>
    </div>
    <div class="cd-eq-why__card">
      <div class="cd-eq-why__icon"><span class="material-icons" data-field="icon4">{{icon4}}</span></div>
      <h3 class="cd-eq-why__card-title" data-field="card4Title">{{card4Title}}</h3>
      <p class="cd-eq-why__card-desc" data-field="card4Desc">{{card4Desc}}</p>
    </div>
    <div class="cd-eq-why__card">
      <div class="cd-eq-why__icon"><span class="material-icons" data-field="icon5">{{icon5}}</span></div>
      <h3 class="cd-eq-why__card-title" data-field="card5Title">{{card5Title}}</h3>
      <p class="cd-eq-why__card-desc" data-field="card5Desc">{{card5Desc}}</p>
    </div>
  </div>
  <div class="cd-eq-why__closer">
    <p class="cd-eq-why__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const WHY_DEFAULTS = {
  intro: "If you’re looking for a partner to finance your lease or purchase, Cardiff offers distinct advantages we’re proud to offer our customers.",
  icon1: 'bolt',
  card1Title: 'Fast Decisions',
  card1Desc: 'Cardiff’s streamlined online application makes it easy to get started, and you won’t be left waiting days for an answer. Applicants typically receive a same-day decision and as fast as same-day funding.',
  icon2: 'tune',
  card2Title: 'Flexible Repayment Options',
  card2Desc: 'Every business has a unique rhythm, and your repayments should reflect that. Cardiff offers repayment structures that adapt to your revenue cycles to ease cash flow during slow seasons or growth spurts.',
  icon3: 'verified_user',
  card3Title: 'Low Credit Threshold',
  card3Desc: 'You don’t need perfect credit to access the capital your business needs. Cardiff works with a broad range of credit profiles, focusing on the overall health, revenue, and performance of your business.',
  icon4: 'storefront',
  card4Title: 'Tailored to Small Businesses',
  card4Desc: 'Cardiff specializes in funding for small businesses that need fast, transparent access to updated equipment. Whether upgrading or scaling, we built our tools to keep pace with your goals.',
  icon5: 'trending_up',
  card5Title: 'Revenue-Based Lending Available',
  card5Desc: 'If your business has limited credit history but generates steady revenue, Cardiff’s revenue-based lending options may be an excellent fit. We evaluate actual cash flow — so you can qualify even when traditional lenders say no.',
  closer: 'Whether you’re a solo practitioner or scaling a multi-location service business, Cardiff offers the financing tools to help you grow.',
} as const;

const whyBlock = {
  id: 'sec-8-why',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: WHY_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: WHY_DEFAULTS.intro },
    { name: 'icon1', label: 'Card 1 — icon', type: 'text', default: WHY_DEFAULTS.icon1 },
    { name: 'card1Title', label: 'Card 1 — title', type: 'text', default: WHY_DEFAULTS.card1Title },
    { name: 'card1Desc', label: 'Card 1 — description', type: 'textarea', default: WHY_DEFAULTS.card1Desc },
    { name: 'icon2', label: 'Card 2 — icon', type: 'text', default: WHY_DEFAULTS.icon2 },
    { name: 'card2Title', label: 'Card 2 — title', type: 'text', default: WHY_DEFAULTS.card2Title },
    { name: 'card2Desc', label: 'Card 2 — description', type: 'textarea', default: WHY_DEFAULTS.card2Desc },
    { name: 'icon3', label: 'Card 3 — icon', type: 'text', default: WHY_DEFAULTS.icon3 },
    { name: 'card3Title', label: 'Card 3 — title', type: 'text', default: WHY_DEFAULTS.card3Title },
    { name: 'card3Desc', label: 'Card 3 — description', type: 'textarea', default: WHY_DEFAULTS.card3Desc },
    { name: 'icon4', label: 'Card 4 — icon', type: 'text', default: WHY_DEFAULTS.icon4 },
    { name: 'card4Title', label: 'Card 4 — title', type: 'text', default: WHY_DEFAULTS.card4Title },
    { name: 'card4Desc', label: 'Card 4 — description', type: 'textarea', default: WHY_DEFAULTS.card4Desc },
    { name: 'icon5', label: 'Card 5 — icon', type: 'text', default: WHY_DEFAULTS.icon5 },
    { name: 'card5Title', label: 'Card 5 — title', type: 'text', default: WHY_DEFAULTS.card5Title },
    { name: 'card5Desc', label: 'Card 5 — description', type: 'textarea', default: WHY_DEFAULTS.card5Desc },
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
    id: 'sec-8-title',
    order: 1,
    level: 2,
    content: 'Why Choose Cardiff for Equipment Leasing and Loans?',
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
    id: 'sec-8-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, whyBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-8 -> styled 5-card "Why Choose Cardiff" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
