/**
 * Iter 8: Restyle the "Building Credit with Smart Equipment Financing"
 * section on post 802 (equipment-leasing). This is sec-10 — currently a
 * centered H2 + orange underline followed by TWO bare paragraphs with no
 * visual structure. It sits between the freshly-styled sec-9 (apply
 * accordion / steps) and sec-11 (CTA wrap-up), so a flat prose band
 * visually flattens the lower third of the page.
 *
 * Iters 1-7 covered hero / sec-2 / sec-5 / sec-6 / sec-7 / sec-8 / sec-9 /
 * sec-12. The single biggest remaining visual gap is sec-10 — sec-4 is a
 * narrative explainer that reads well as prose, and sec-11 is a CTA whose
 * existing copy already pairs with the standing final-cta block.
 *
 * We replace sec-10 sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter2/3/4/5/6/7)
 *   2. A single html-render block carrying an intro line + a 3-card
 *      stepped "credit-building journey" grid (uses data-repeat="steps"
 *      so portal editors can re-order / add / remove milestones) +
 *      a closing summary band.
 *
 * Cards are brand-styled (white chrome, soft shadow, numbered chip,
 * Material Icons in alternating brand-blue / orange / green gradients —
 * same chip pattern as iter3's why-grid for visual consistency).
 *
 * Step content is synthesized strictly from sec-10's existing two
 * paragraphs (creditworthiness → larger funding → expand / scale) —
 * not fabricated.
 *
 * Idempotent: re-running rewrites sec-10.blocks in place; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-10';

const CREDIT_HTML = `
<style>
  .cd-eq-credit { max-width: 1140px; margin: 0 auto; }
  .cd-eq-credit__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-eq-credit__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; position: relative; }
  .cd-eq-credit__grid::before { content: ''; position: absolute; top: 56px; left: 12%; right: 12%; height: 2px; background: repeating-linear-gradient(90deg, rgba(37,65,139,0.18) 0 8px, transparent 8px 16px); z-index: 0; }
  .cd-eq-credit__card { position: relative; z-index: 1; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 36px 28px 30px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .cd-eq-credit__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-eq-credit__chip { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 10px 22px rgba(28,51,112,0.24); border: 4px solid #ffffff; outline: 1px solid rgba(28,51,112,0.08); }
  .cd-eq-credit__card:nth-child(2) .cd-eq-credit__chip { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.28); }
  .cd-eq-credit__card:nth-child(3) .cd-eq-credit__chip { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.28); }
  .cd-eq-credit__chip .material-icons { font-size: 30px; }
  .cd-eq-credit__step { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #ef6632; margin: 0 0 6px 0; }
  .cd-eq-credit__card:nth-child(1) .cd-eq-credit__step { color: #25418b; }
  .cd-eq-credit__card:nth-child(3) .cd-eq-credit__step { color: #3aa856; }
  .cd-eq-credit__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.2rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-eq-credit__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-eq-credit__closer { margin: 48px auto 0 auto; max-width: 880px; text-align: center; padding: 30px 36px; background: linear-gradient(135deg, rgba(28,51,112,0.05) 0%, rgba(90,201,111,0.08) 100%); border-radius: 14px; border: 1px solid #e6ecf5; }
  .cd-eq-credit__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-eq-credit__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-eq-credit__grid::before { display: none; }
  }
  @media (max-width: 620px) {
    .cd-eq-credit__card { padding: 28px 22px 24px 22px; }
    .cd-eq-credit__closer { padding: 24px 22px; }
  }
</style>
<div class="cd-eq-credit">
  <p class="cd-eq-credit__intro" data-field="intro">{{intro}}</p>
  <div class="cd-eq-credit__grid">
    <div class="cd-eq-credit__card" data-repeat="steps">
      <div class="cd-eq-credit__chip"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
      <p class="cd-eq-credit__step" data-field="step">{{steps.step}}</p>
      <h3 class="cd-eq-credit__title" data-field="title">{{steps.title}}</h3>
      <p class="cd-eq-credit__desc" data-field="desc">{{steps.desc}}</p>
    </div>
  </div>
  <div class="cd-eq-credit__closer">
    <p class="cd-eq-credit__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const CREDIT_DEFAULTS = {
  intro:
    'Equipment financing is more than a way to get the gear you need today — it is a deliberate step in building the business credit profile you will lean on tomorrow.',
  steps: [
    {
      icon: 'handshake',
      step: 'Step 1',
      title: 'Repay on time',
      desc: 'Successfully managing a Cardiff equipment loan or lease demonstrates your capacity to repay, building creditworthiness with every on-time payment.',
    },
    {
      icon: 'trending_up',
      step: 'Step 2',
      title: 'Unlock larger funding',
      desc: 'A strengthened business credit profile opens the door to larger funding amounts and better terms the next time you need to invest in your operation.',
    },
    {
      icon: 'rocket_launch',
      step: 'Step 3',
      title: 'Expand and scale',
      desc: 'Leverage your stronger profile when you are preparing to expand locations, open a new division, or scale operations — a strategic move that compounds.',
    },
  ],
  closer:
    'Smart equipment financing is a strategic move that compounds — every funded purchase doubles as a stepping stone toward the next stage of growth.',
} as const;

const creditBlock = {
  id: 'sec-10-credit',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: CREDIT_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: CREDIT_DEFAULTS.intro },
    {
      name: 'steps',
      label: 'Credit-building steps',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'step', label: 'Step eyebrow (e.g. "Step 1")', type: 'text' },
        { name: 'title', label: 'Step title', type: 'text' },
        { name: 'desc', label: 'Step description', type: 'textarea' },
      ],
      default: CREDIT_DEFAULTS.steps,
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: CREDIT_DEFAULTS.closer },
  ],
  values: { ...CREDIT_DEFAULTS },
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

  // Widen so the 3-step journey grid breathes; keep the soft-blue band so
  // it still alternates against the neighboring sec-9 / sec-11 surfaces.
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
    id: 'sec-10-title',
    order: 1,
    level: 2,
    content: 'Building Credit with Smart Equipment Financing',
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
    id: 'sec-10-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, creditBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-10 -> styled 3-step credit-building journey grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
