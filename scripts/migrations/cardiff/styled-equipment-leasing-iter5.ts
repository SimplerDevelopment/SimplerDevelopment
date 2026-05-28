/**
 * Iter 5: Restyle the "What Businesses Use Equipment Financing?" section on
 * post 802 (equipment-leasing). This is sec-6 — currently a centered H2 plus
 * a long, dense <ul> of seven business categories crammed into a single
 * text block. Visually flat; loses every category in a wall of bullets.
 *
 * Cardiff.co treats audience-fit as a key conversion proof point. We replace
 * sec-6 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter2/3/4)
 *   2. A single html-render block carrying an icon-card grid (one card per
 *      business type) driven by a `data-repeat="businesses"` array, with
 *      intro + closing summary band.
 *
 * Layout: auto-fit grid of 7 cards, each with circular icon chip + label +
 * one-line use-case. Brand palette only — #1c3370 / #25418b deep blue,
 * #5ac96f green, #ef6632 orange, #ffb798 peach accent — no emojis.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-6-businesses` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-6';

const BUSINESSES_HTML = `
<style>
  .cd-eq-biz { max-width: 1140px; margin: 0 auto; }
  .cd-eq-biz__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-eq-biz__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 22px; }
  .cd-eq-biz__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 28px 24px; box-shadow: 0 10px 28px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; align-items: flex-start; }
  .cd-eq-biz__card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(28,51,112,0.12); }
  .cd-eq-biz__icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-eq-biz__card:nth-child(2n) .cd-eq-biz__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-eq-biz__card:nth-child(3n) .cd-eq-biz__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-eq-biz__card:nth-child(5n) .cd-eq-biz__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.42); }
  .cd-eq-biz__icon .material-icons { font-size: 28px; }
  .cd-eq-biz__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.15rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-eq-biz__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.65; color: #525f7f; margin: 0; }
  .cd-eq-biz__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-eq-biz__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 620px) {
    .cd-eq-biz__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-eq-biz__card { padding: 24px 20px; }
    .cd-eq-biz__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-eq-biz">
  <p class="cd-eq-biz__intro" data-field="intro">{{intro}}</p>
  <div class="cd-eq-biz__grid">
    <div class="cd-eq-biz__card" data-repeat="businesses">
      <div class="cd-eq-biz__icon"><span class="material-icons">{{businesses.icon}}</span></div>
      <h3 class="cd-eq-biz__name">{{businesses.name}}</h3>
      <p class="cd-eq-biz__desc">{{businesses.desc}}</p>
    </div>
  </div>
  <div class="cd-eq-biz__closer">
    <p class="cd-eq-biz__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const BUSINESSES_DEFAULTS = {
  intro: "You don’t have to be a large corporation expanding your vehicle fleet to qualify for equipment financing. Many small businesses rely on equipment leases and loans to finance vital equipment purchases. Cardiff’s business equipment financing is ideal for:",
  businesses: [
    { icon: 'medical_services', name: 'Medical Practices', desc: 'Acquiring diagnostic tools, x-ray machines, exam chairs, or treatment systems.' },
    { icon: 'spa', name: 'Spas & Salons', desc: 'Investing in upgraded machines, chairs, or specialty wellness equipment.' },
    { icon: 'pets', name: 'Veterinary Clinics', desc: 'Adding surgical tables, imaging tools, and sterilization equipment.' },
    { icon: 'build', name: 'Auto Repair Shops', desc: 'Needing lifts, air compressors, tire mounting equipment, and diagnostic scanners.' },
    { icon: 'engineering', name: 'Construction Companies', desc: 'Purchasing new or used heavy machinery to take on bigger jobs.' },
    { icon: 'storefront', name: 'Retailers', desc: 'Refreshing checkout systems, refrigeration units, or inventory management gear.' },
    { icon: 'yard', name: 'Landscaping Businesses', desc: 'Financing mowers, trimmers, loaders, and trailers to scale crews.' },
  ],
  closer: 'If you need tools to stay competitive or grow your business, Cardiff can help you fund them fast. We’ll provide a financing solution that makes sense for your business and financial situation.',
} as const;

const businessesBlock = {
  id: 'sec-6-businesses',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: BUSINESSES_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: BUSINESSES_DEFAULTS.intro },
    {
      name: 'businesses',
      label: 'Business types',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'name', label: 'Business name', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: BUSINESSES_DEFAULTS.closer },
  ],
  values: { ...BUSINESSES_DEFAULTS, businesses: [...BUSINESSES_DEFAULTS.businesses] },
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

  // Widen so the auto-fit card grid breathes.
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
    content: 'What Businesses Use Equipment Financing?',
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
  sec.blocks = [headerBlock, dividerBlock, businessesBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-6 -> styled 7-card "What Businesses Use Equipment Financing" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
