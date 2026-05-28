/**
 * Iter 5 — Affiliate page (post 796): restyle sec-6, the biggest remaining
 * unstyled section.
 *
 * Iter 1 handled sec-1 hero. Iter 2 handled sec-3 audience grid.
 * Iter 3 handled sec-2 (3-step). Iter 4 handled sec-5 (support).
 *
 * sec-6 currently lists 3 H3 + paragraph pairs — "Get Approved",
 * "Find the best tailored terms", "Ready to scale" — about how Cardiff
 * services the small businesses the affiliate refers. As bare text it
 * reads like a runon, with no visual hierarchy. The section sits between
 * white neighbors so we keep it white but lean into a 3-up icon-card
 * grid (same family as styled-equipment-leasing-iter3) using
 * data-repeat="benefits" so the editor can manage the list.
 *
 * Idempotent: looks up sec-6 by id, rewrites blocks + style each run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 796;
const TARGET_SECTION_ID = 'sec-6';

const BENEFITS_HTML = `
<style>
  .cd-aff-svc { max-width: 1140px; margin: 0 auto; }
  .cd-aff-svc__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 720px; margin: 0 auto 44px auto; }
  .cd-aff-svc__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-aff-svc__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .cd-aff-svc__card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #25418b 0%, #5ac96f 100%); opacity: 0; transition: opacity .25s ease; }
  .cd-aff-svc__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.14); border-color: #d3dcee; }
  .cd-aff-svc__card:hover::before { opacity: 1; }
  .cd-aff-svc__card:nth-child(3n+1) .cd-aff-svc__icon { background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); box-shadow: 0 8px 18px rgba(28,51,112,0.24); }
  .cd-aff-svc__card:nth-child(3n+2) .cd-aff-svc__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-aff-svc__card:nth-child(3n+3) .cd-aff-svc__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-aff-svc__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; color: #fff; }
  .cd-aff-svc__icon .material-icons { font-size: 30px; }
  .cd-aff-svc__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-aff-svc__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-aff-svc__closer { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 26px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(90,201,111,0.08) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-aff-svc__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-aff-svc__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-aff-svc__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-aff-svc__card { padding: 26px 22px; }
    .cd-aff-svc__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-aff-svc">
  <p class="cd-aff-svc__intro" data-field="intro">{{intro}}</p>
  <div class="cd-aff-svc__grid">
    <div class="cd-aff-svc__card" data-repeat="benefits">
      <div class="cd-aff-svc__icon"><span class="material-icons" data-field="icon">{{benefits.icon}}</span></div>
      <h3 class="cd-aff-svc__title" data-field="title">{{benefits.title}}</h3>
      <p class="cd-aff-svc__desc" data-field="description">{{benefits.description}}</p>
    </div>
  </div>
  <div class="cd-aff-svc__closer">
    <p class="cd-aff-svc__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const BENEFITS_DEFAULTS = {
  intro: 'Once you make the introduction, Cardiff takes it from there — and your referrals get a same-day, transparent funding experience.',
  benefits: [
    {
      title: 'Get Approved Fast',
      description: 'The businesses you refer will fill out a short questionnaire about their business and get approved in less than 2 minutes.',
      icon: 'bolt',
    },
    {
      title: 'Tailored Repayment Terms',
      description: 'They will choose the terms that are best for their budget so they can comfortably pay back the loan.',
      icon: 'tune',
    },
    {
      title: 'Ready to Scale',
      description: 'They can immediately access funds up to $250,000 after linking their business checking account to their Cardiff loan.',
      icon: 'trending_up',
    },
  ],
  closer: 'A clean handoff, fast funding, and a transparent process — so the businesses you refer come back to you grateful.',
} as const;

const benefitsBlock = {
  id: 'sec-6-benefits',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: BENEFITS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: BENEFITS_DEFAULTS.intro },
    {
      name: 'benefits',
      label: 'Benefit cards',
      type: 'array',
      itemFields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'icon', type: 'text', label: 'Material icon name' },
      ],
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: BENEFITS_DEFAULTS.closer },
  ],
  values: {
    intro: BENEFITS_DEFAULTS.intro,
    benefits: BENEFITS_DEFAULTS.benefits.map((b) => ({ ...b })),
    closer: BENEFITS_DEFAULTS.closer,
  },
};

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema/cms');
  const { eq } = await import('drizzle-orm');

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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_SECTION_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_SECTION_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_SECTION_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }

  // Widen for 3-col card grid; keep white background to contrast sec-5/sec-7 tinted neighbors.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#ffffff',
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
    content: 'Here Is How We Service The Small Businesses YOU REFER!',
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
  sec.blocks = [headerBlock, dividerBlock, benefitsBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: ${TARGET_SECTION_ID} -> styled 3-card service-benefits grid (data-repeat="benefits").`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
