/**
 * Iter 9 — Working Capital page (post 837).
 *
 * Biggest remaining unstyled gap: the page jumps straight from the "How to
 * Apply" checklist (sec-4) into the FAQ (sec-5-faq) with no "why Cardiff"
 * benefits band — every other major cardiff.co product page (equipment
 * leasing, term loans, LOC) opens the close-the-deal portion with a
 * benefits/differentiators grid: Fast Decisions, Flexible Repayment, Low
 * Credit Threshold, Tailored to Small Businesses, Revenue-Based Lending.
 *
 * Fix: insert a NEW top-level section `sec-4b-why` between `sec-4` (How to
 * Apply) and `sec-5-faq`, lifting the proven 5-card grid recipe from
 * styled-equipment-leasing-iter3.ts but using the cleaner
 * `data-repeat="cards"` array pattern (per iter8), so editors can add /
 * remove / reorder differentiators in the portal without code changes.
 *
 * Layout: centered H2 + orange underline, soft blue band (#f6f9fc) to set
 * apart from the white sec-4 above and the FAQ below, intro paragraph, then
 * a 3-col card grid (2 wrap on tablet, 1 on phone) with brand-rotated icon
 * chips (deep blue / orange / green), titles, and copy. Closing summary
 * panel inside the band.
 *
 * Idempotent: re-running detects an existing `sec-4b-why` block and
 * rewrites it in place; otherwise inserts at the right order. Bumps
 * sec-5-faq.order and final-cta.order accordingly so the section ordering
 * stays clean.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 837;
const NEW_SECTION_ID = 'sec-4b-why';
const INSERT_AFTER_ID = 'sec-4';

const WHY_HTML = `
<style>
  .cd-wc-why { max-width: 1140px; margin: 0 auto; }
  .cd-wc-why__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-wc-why__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-wc-why__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-wc-why__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-wc-why__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-wc-why__card:nth-child(2) .cd-wc-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-wc-why__card:nth-child(4) .cd-wc-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-wc-why__card:nth-child(5) .cd-wc-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-wc-why__icon .material-icons { font-size: 30px; }
  .cd-wc-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-wc-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-wc-why__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-wc-why__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-wc-why__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-wc-why__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-wc-why__card { padding: 26px 22px; }
    .cd-wc-why__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-wc-why">
  <p class="cd-wc-why__intro" data-field="intro">{{intro}}</p>
  <div class="cd-wc-why__grid">
    <div class="cd-wc-why__card" data-repeat="cards">
      <div class="cd-wc-why__icon"><span class="material-icons">{{cards.icon}}</span></div>
      <h3 class="cd-wc-why__card-title">{{cards.title}}</h3>
      <p class="cd-wc-why__card-desc">{{cards.desc}}</p>
    </div>
  </div>
  <div class="cd-wc-why__closer">
    <p class="cd-wc-why__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const WHY_DEFAULTS = {
  intro:
    "Choosing the right working capital partner can be the difference between a quick win and a missed opportunity. Here's why thousands of small business owners trust Cardiff.",
  cards: [
    {
      icon: 'bolt',
      title: 'Fast Decisions',
      desc: "Cardiff's streamlined online application takes minutes — most applicants receive a same-day decision and funding can hit your account as quickly as the same business day.",
    },
    {
      icon: 'tune',
      title: 'Flexible Repayment Options',
      desc: 'Every business has its own cash-flow rhythm. Choose from weekly, daily, or revenue-based repayment structures that adapt to slow seasons and growth spurts alike.',
    },
    {
      icon: 'verified_user',
      title: 'Low Credit Threshold',
      desc: "You don't need perfect credit to access working capital. Cardiff looks at the overall health, revenue, and trajectory of your business — not just a single FICO number.",
    },
    {
      icon: 'storefront',
      title: 'Tailored to Small Businesses',
      desc: 'Cardiff specializes in funding for small businesses that need transparent, no-collateral capital up to $250,000. No jargon, no surprise fees, no warehouse-bank runaround.',
    },
    {
      icon: 'trending_up',
      title: 'Revenue-Based Lending Available',
      desc: "If your credit history is limited but your business generates steady revenue, Cardiff's revenue-based options may be a fit. We evaluate actual cash flow — so you can qualify even when traditional lenders say no.",
    },
  ],
  closer:
    "Whether you're covering a payroll gap, restocking inventory, or seizing a time-sensitive opportunity, Cardiff gives you the working capital tools to keep moving forward.",
} as const;

const whyInner = {
  id: `${NEW_SECTION_ID}-cards`,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: WHY_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: WHY_DEFAULTS.intro },
    {
      name: 'cards',
      label: 'Benefit cards',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
      default: WHY_DEFAULTS.cards,
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: WHY_DEFAULTS.closer },
  ],
  values: { ...WHY_DEFAULTS },
};

function buildWhySection() {
  return {
    type: 'section' as const,
    id: NEW_SECTION_ID,
    order: 5,
    maxWidth: '1200px',
    style: {
      backgroundColor: '#f6f9fc',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [
      {
        type: 'heading' as const,
        id: `${NEW_SECTION_ID}-title`,
        order: 1,
        level: 2,
        content: 'Why Choose Cardiff for Working Capital?',
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
      },
      {
        type: 'text' as const,
        id: `${NEW_SECTION_ID}-div`,
        order: 2,
        content:
          '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
        style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
      },
      whyInner,
    ],
  };
}

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

  const whySection = buildWhySection();
  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === NEW_SECTION_ID);

  if (existingIdx !== -1) {
    // Idempotent rewrite — preserve in-place position, refresh content.
    parsed.blocks[existingIdx] = { ...whySection, order: parsed.blocks[existingIdx].order ?? 5 };
    console.log(`Post ${POST_ID}: rewrote existing ${NEW_SECTION_ID} in place.`);
  } else {
    const afterIdx = parsed.blocks.findIndex((b: any) => b?.id === INSERT_AFTER_ID);
    if (afterIdx === -1) {
      console.error(`Post ${POST_ID}: no anchor block id=${INSERT_AFTER_ID}; aborting`);
      process.exit(1);
    }
    parsed.blocks.splice(afterIdx + 1, 0, whySection);
    // Renumber `order` on subsequent blocks so the new section reads
    // cleanly between sec-4 (5) and sec-5-faq / final-cta.
    const afterOrder = parsed.blocks[afterIdx].order ?? 5;
    whySection.order = afterOrder + 1;
    for (let i = afterIdx + 2; i < parsed.blocks.length; i++) {
      const b = parsed.blocks[i];
      if (typeof b.order === 'number') b.order = b.order + 1;
    }
    console.log(`Post ${POST_ID}: inserted ${NEW_SECTION_ID} after ${INSERT_AFTER_ID}.`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Post ${POST_ID} updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
