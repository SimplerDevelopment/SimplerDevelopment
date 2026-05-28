/**
 * Iter 11: Restyle the "Equipment Financing Across Industries" section on
 * post 802 (equipment-leasing). This is sec-7 — currently a centered H2 +
 * orange divider + intro + a flat 2-column card-grid of 4 generic
 * check_circle cards + outro paragraph. It is the single remaining visual
 * gap on the page (iters 1-10 covered hero / sec-1 / sec-2 / sec-4 / sec-5
 * / sec-6 / sec-8 / sec-9 / sec-10 / sec-11 / sec-12). sec-1 is a one-line
 * intro that already sits on the brand light-blue band, so it does not
 * need a card-grid treatment; sec-7 does.
 *
 * We replace sec-7 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter3/iter5/iter6)
 *   2. A single html-render block carrying a 4-up industry icon-card grid
 *      driven by `data-repeat="industries"`, each card with a circular
 *      brand-gradient icon chip (Material Icons), industry title, and copy.
 *   3. A closing summary band describing the equipment line of credit
 *      option, so the outro paragraph is not lost.
 *
 * Layout: auto-fit 4-col on desktop, 2-col tablet, 1-col mobile. Brand
 * palette only — deep blue (#1c3370 / #25418b), green (#5ac96f), orange
 * (#ef6632), peach (#ffb798) accents — no emojis, Material Icons only.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-7-industries` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-7';

const INDUSTRIES_HTML = `
<style>
  .cd-eq-ind { max-width: 1140px; margin: 0 auto; }
  .cd-eq-ind__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-eq-ind__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
  .cd-eq-ind__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 24px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; text-align: left; }
  .cd-eq-ind__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-eq-ind__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-eq-ind__card:nth-child(4n+2) .cd-eq-ind__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-eq-ind__card:nth-child(4n+3) .cd-eq-ind__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-eq-ind__card:nth-child(4n+4) .cd-eq-ind__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.36); }
  .cd-eq-ind__icon .material-icons { font-size: 30px; }
  .cd-eq-ind__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-eq-ind__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  .cd-eq-ind__closer { margin: 48px auto 0 auto; max-width: 860px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(90,201,111,0.08) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-eq-ind__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 1100px) {
    .cd-eq-ind__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-eq-ind__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-eq-ind__card { padding: 26px 22px; }
    .cd-eq-ind__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-eq-ind">
  <p class="cd-eq-ind__intro" data-field="intro">{{intro}}</p>
  <div class="cd-eq-ind__grid">
    <div class="cd-eq-ind__card" data-repeat="industries">
      <div class="cd-eq-ind__icon"><span class="material-icons" data-field="icon">{{industries.icon}}</span></div>
      <h3 class="cd-eq-ind__title" data-field="title">{{industries.title}}</h3>
      <p class="cd-eq-ind__desc" data-field="desc">{{industries.desc}}</p>
    </div>
  </div>
  <div class="cd-eq-ind__closer">
    <p class="cd-eq-ind__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const INDUSTRIES_DEFAULTS = {
  intro:
    'Cardiff offers flexible equipment lending for a wide range of industries. Here are just a few examples of what you can finance with the right partner in your corner.',
  industries: [
    {
      icon: 'construction',
      title: 'Heavy Equipment Financing',
      desc: 'Bulldozers, backhoes, excavators, and cranes for construction businesses scaling up to bigger jobs.',
    },
    {
      icon: 'spa',
      title: 'Spa Equipment Financing',
      desc: 'Hydrotherapy tubs, microdermabrasion machines, massage tables, and aesthetic lasers for med-spas and wellness studios.',
    },
    {
      icon: 'pets',
      title: 'Veterinary Equipment Financing',
      desc: 'Ultrasound machines, anesthesia units, dental tools, and diagnostic software for growing veterinary practices.',
    },
    {
      icon: 'precision_manufacturing',
      title: 'Used Machinery Loans',
      desc: 'Previously owned machines that perform like new — without the markup of brand-new inventory eating your margins.',
    },
  ],
  closer:
    'We can even help you secure an equipment line of credit if you have rotating needs and plan to purchase multiple items over time. With Cardiff, your equipment financing options scale with your business.',
} as const;

const industriesBlock = {
  id: 'sec-7-industries',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: INDUSTRIES_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: INDUSTRIES_DEFAULTS.intro },
    {
      name: 'industries',
      label: 'Industries',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Industry title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
      default: INDUSTRIES_DEFAULTS.industries,
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: INDUSTRIES_DEFAULTS.closer },
  ],
  values: { ...INDUSTRIES_DEFAULTS },
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
  // Match the visual cadence of neighboring restyled bands (sec-8 etc).
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
    id: 'sec-7-title',
    order: 1,
    level: 2,
    content: 'Equipment Financing Across Industries',
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
    id: 'sec-7-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, industriesBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-7 -> styled 4-card "Equipment Financing Across Industries" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
