/**
 * Iter 4: Restyle the "How to Apply for Equipment Financing" section on
 * post 802 (equipment-leasing). This is sec-9 — currently 5 stacked text
 * paragraphs (intro + 3 process steps + line-of-credit closer) with no
 * visual hierarchy.
 *
 * Cardiff.co's source page presents the apply flow as a numbered step
 * sequence. The port shows them as bare paragraphs. We replace sec-9
 * sub-blocks with:
 *   1. Centered H2 + orange underline
 *   2. A single html-render block carrying a 3-up numbered step card row
 *      with arrow connectors, plus a highlighted line-of-credit closer band.
 *
 * Layout: 3 step cards, each with a big numbered badge, Material Icon,
 * title, and copy. Brand palette only — deep blue (#1c3370 / #25418b),
 * green (#5ac96f), orange (#ef6632) — no emojis.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-9-apply` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-9';

const APPLY_HTML = `
<style>
  .cd-eq-apply { max-width: 1140px; margin: 0 auto; }
  .cd-eq-apply__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-eq-apply__steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; position: relative; counter-reset: cd-apply-step; }
  .cd-eq-apply__steps::before { content: ''; position: absolute; top: 60px; left: 16%; right: 16%; height: 2px; background: linear-gradient(to right, transparent, #d3deec 12%, #d3deec 88%, transparent); z-index: 0; }
  .cd-eq-apply__step { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 36px 28px 28px 28px; box-shadow: 0 10px 28px rgba(28,51,112,0.06); position: relative; z-index: 1; counter-increment: cd-apply-step; display: flex; flex-direction: column; align-items: center; text-align: center; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-eq-apply__step:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(28,51,112,0.12); }
  .cd-eq-apply__num { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 1.5rem; color: #ffffff; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); box-shadow: 0 10px 22px rgba(28,51,112,0.28); margin: 0 0 18px 0; letter-spacing: -0.02em; }
  .cd-eq-apply__step:nth-child(2) .cd-eq-apply__num { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.32); }
  .cd-eq-apply__step:nth-child(3) .cd-eq-apply__num { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.32); }
  .cd-eq-apply__num::before { content: counter(cd-apply-step, decimal-leading-zero); }
  .cd-eq-apply__icon { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 12px; background: rgba(28,51,112,0.08); margin: 0 0 14px 0; }
  .cd-eq-apply__step:nth-child(2) .cd-eq-apply__icon { background: rgba(239,102,50,0.10); }
  .cd-eq-apply__step:nth-child(3) .cd-eq-apply__icon { background: rgba(90,201,111,0.14); }
  .cd-eq-apply__icon .material-icons { color: #25418b; font-size: 24px; }
  .cd-eq-apply__step:nth-child(2) .cd-eq-apply__icon .material-icons { color: #ef6632; }
  .cd-eq-apply__step:nth-child(3) .cd-eq-apply__icon .material-icons { color: #3aa856; }
  .cd-eq-apply__step-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.2rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-eq-apply__step-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.65; color: #525f7f; margin: 0; }
  .cd-eq-apply__closer { margin: 48px auto 0 auto; max-width: 920px; display: flex; align-items: center; gap: 22px; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.05) 0%, rgba(239,102,50,0.07) 100%); border-radius: 14px; border: 1px solid #e6ecf5; }
  .cd-eq-apply__closer-icon { flex-shrink: 0; width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); box-shadow: 0 8px 18px rgba(28,51,112,0.24); }
  .cd-eq-apply__closer-icon .material-icons { color: #ffffff; font-size: 28px; }
  .cd-eq-apply__closer-body { flex: 1; }
  .cd-eq-apply__closer-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.05rem; font-weight: 800; color: #1c3370; margin: 0 0 6px 0; letter-spacing: -0.005em; }
  .cd-eq-apply__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.65; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 900px) {
    .cd-eq-apply__steps { grid-template-columns: 1fr; gap: 18px; }
    .cd-eq-apply__steps::before { display: none; }
    .cd-eq-apply__step { padding: 28px 24px 24px 24px; }
    .cd-eq-apply__closer { flex-direction: column; text-align: center; padding: 24px 22px; }
  }
</style>
<div class="cd-eq-apply">
  <p class="cd-eq-apply__intro" data-field="intro">{{intro}}</p>
  <div class="cd-eq-apply__steps">
    <div class="cd-eq-apply__step">
      <div class="cd-eq-apply__num"></div>
      <div class="cd-eq-apply__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <h3 class="cd-eq-apply__step-title" data-field="step1Title">{{step1Title}}</h3>
      <p class="cd-eq-apply__step-desc" data-field="step1Desc">{{step1Desc}}</p>
    </div>
    <div class="cd-eq-apply__step">
      <div class="cd-eq-apply__num"></div>
      <div class="cd-eq-apply__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <h3 class="cd-eq-apply__step-title" data-field="step2Title">{{step2Title}}</h3>
      <p class="cd-eq-apply__step-desc" data-field="step2Desc">{{step2Desc}}</p>
    </div>
    <div class="cd-eq-apply__step">
      <div class="cd-eq-apply__num"></div>
      <div class="cd-eq-apply__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <h3 class="cd-eq-apply__step-title" data-field="step3Title">{{step3Title}}</h3>
      <p class="cd-eq-apply__step-desc" data-field="step3Desc">{{step3Desc}}</p>
    </div>
  </div>
  <div class="cd-eq-apply__closer">
    <div class="cd-eq-apply__closer-icon"><span class="material-icons" data-field="closerIcon">{{closerIcon}}</span></div>
    <div class="cd-eq-apply__closer-body">
      <h4 class="cd-eq-apply__closer-title" data-field="closerTitle">{{closerTitle}}</h4>
      <p class="cd-eq-apply__closer-text" data-field="closerText">{{closerText}}</p>
    </div>
  </div>
</div>
`.trim();

const APPLY_DEFAULTS = {
  intro: "Getting started is easier than you think. With Cardiff’s streamlined process, you’ll avoid paperwork overload and get a funding decision fast.",
  icon1: 'edit_note',
  step1Title: 'Apply Online',
  step1Desc: 'Provide basic information about your business and financing needs, including bank statements and an equipment quote.',
  icon2: 'task_alt',
  step2Title: 'Get a Decision',
  step2Desc: 'Our team reviews your application and responds quickly — typically with a same-day answer.',
  icon3: 'account_balance',
  step3Title: 'Access Funding',
  step3Desc: 'Once approved, we release funds so you can order or take delivery of the equipment right away.',
  closerIcon: 'autorenew',
  closerTitle: 'Need ongoing equipment funding?',
  closerText: 'If a one-time purchase or lease does not meet your needs, you can also opt for an equipment line of credit, which gives you access to revolving funds for equipment purchases.',
} as const;

const applyBlock = {
  id: 'sec-9-apply',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: APPLY_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: APPLY_DEFAULTS.intro },
    { name: 'icon1', label: 'Step 1 — icon', type: 'text', default: APPLY_DEFAULTS.icon1 },
    { name: 'step1Title', label: 'Step 1 — title', type: 'text', default: APPLY_DEFAULTS.step1Title },
    { name: 'step1Desc', label: 'Step 1 — description', type: 'textarea', default: APPLY_DEFAULTS.step1Desc },
    { name: 'icon2', label: 'Step 2 — icon', type: 'text', default: APPLY_DEFAULTS.icon2 },
    { name: 'step2Title', label: 'Step 2 — title', type: 'text', default: APPLY_DEFAULTS.step2Title },
    { name: 'step2Desc', label: 'Step 2 — description', type: 'textarea', default: APPLY_DEFAULTS.step2Desc },
    { name: 'icon3', label: 'Step 3 — icon', type: 'text', default: APPLY_DEFAULTS.icon3 },
    { name: 'step3Title', label: 'Step 3 — title', type: 'text', default: APPLY_DEFAULTS.step3Title },
    { name: 'step3Desc', label: 'Step 3 — description', type: 'textarea', default: APPLY_DEFAULTS.step3Desc },
    { name: 'closerIcon', label: 'Closer — icon', type: 'text', default: APPLY_DEFAULTS.closerIcon },
    { name: 'closerTitle', label: 'Closer — title', type: 'text', default: APPLY_DEFAULTS.closerTitle },
    { name: 'closerText', label: 'Closer — text', type: 'textarea', default: APPLY_DEFAULTS.closerText },
  ],
  values: { ...APPLY_DEFAULTS },
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

  // Widen so the 3-col step row breathes.
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
    id: 'sec-9-title',
    order: 1,
    level: 2,
    content: 'How to Apply for Equipment Financing',
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
    id: 'sec-9-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, applyBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-9 -> styled 3-step "How to Apply" with numbered cards + line-of-credit closer.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
