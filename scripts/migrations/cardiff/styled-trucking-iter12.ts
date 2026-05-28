/**
 * Iter 12 — post 817 (Industries · Trucking).
 *
 * Iters 1-11 covered hero, intro+stats, qualification matrix, loan-product
 * options grid (sec-2), what-can-you-fund uses (sec-uses), persona band
 * (sec-who), scenario-to-product matcher (sec-match), reviews (sec-3),
 * why-Cardiff, FAQ, trust strip, and final CTA. A side-by-side screenshot
 * of cardiff.co/trucking against the current post-817 render exposes one
 * remaining structural gap that no prior iter has filled: the iconic
 * Cardiff "Our Process" section.
 *
 * cardiff.co/trucking carries it explicitly:
 *   "Our Process — 01 Apply Online / 02 Get Approved / 03 Withdraw Funds /
 *    04 Repayment / 05 Renew Your Funding"
 *
 * Every other Cardiff industry page and the home page carries this same
 * 5-step "01..05" numbered band — it is part of cardiff.co's brand
 * vocabulary, not a one-off. The home page version was rebuilt in
 * scripts/migrations/cardiff/restyle-home-process.ts as a horizontal
 * 5-col html-render with leading-zero CSS counters + Material icons.
 *
 * Without this section, the trucking page jumps from a stats/intro block
 * straight into a heavy qualification matrix — the reader is told what to
 * qualify for before they're told how the process actually works, which is
 * exactly the friction the brand's "Borrow Better" voice is supposed to
 * remove.
 *
 * Fix: insert a new section `sec-process` immediately after `sec-1`
 * (hero stats/intro) and before `sec-qual` (qualification matrix).
 * Reuses the visual recipe from restyle-home-process.ts (CSS counters,
 * Material-icon chip, 5-col grid collapsing to 2/1) but on a deep-blue
 * brand band (#1c3370 → #25418b gradient) so it reads as the signature
 * brand moment between the white intro and the soft-blue qualification
 * band — exactly the colour pop cardiff.co uses on its own hero/process
 * transitions. The numbered "01..05" badges are flipped to bright
 * orange (#ffb798) on the dark band so they remain the focal anchor.
 *
 * Steps are content-managed via `data-repeat="steps"` so editors can
 * add/remove without touching this script.
 *
 * Idempotent: re-running replaces any existing `sec-process` in place;
 * otherwise splices it directly after `sec-1` (anchor) and re-numbers
 * top-level `order` to match the new positions.
 *
 * Brand palette only: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798.
 * Raleway + Open Sans. No emojis (Material Icons).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const NEW_SECTION_ID = 'sec-process';
const ANCHOR_AFTER_ID = 'sec-1';

const PROCESS_HTML = `
<style>
  .cd-trk-proc { max-width: 1200px; margin: 0 auto; counter-reset: cd-trk-step; }
  .cd-trk-proc__intro { text-align: center; color: rgba(255,255,255,0.86); font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 48px auto; }
  .cd-trk-proc__row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 22px; position: relative; }
  .cd-trk-proc__row::before { content: ''; position: absolute; top: 96px; left: 8%; right: 8%; height: 2px; background: linear-gradient(to right, transparent, rgba(255,183,152,0.45) 12%, rgba(255,183,152,0.45) 88%, transparent); z-index: 0; }
  .cd-trk-proc__col { background: #ffffff; border-radius: 14px; padding: 28px 20px 26px 20px; text-align: center; position: relative; z-index: 1; border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 14px 36px rgba(0,0,0,0.18); counter-increment: cd-trk-step; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-trk-proc__col:hover { transform: translateY(-4px); box-shadow: 0 22px 48px rgba(0,0,0,0.26); }
  .cd-trk-proc__num { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.78rem; color: #ef6632; letter-spacing: 0.22em; margin: 0 0 14px 0; }
  .cd-trk-proc__num::before { content: counter(cd-trk-step, decimal-leading-zero); }
  .cd-trk-proc__icon { display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; border-radius: 16px; background: linear-gradient(135deg, rgba(239,102,50,0.14) 0%, rgba(255,183,152,0.22) 100%); margin: 0 0 16px 0; }
  .cd-trk-proc__icon .material-icons { color: #ef6632; font-size: 30px; }
  .cd-trk-proc__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 1rem; color: #1c3370; letter-spacing: -0.005em; line-height: 1.28; margin: 0 0 10px 0; }
  .cd-trk-proc__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.84rem; line-height: 1.6; color: #525f7f; margin: 0; }
  .cd-trk-proc__closer { margin: 48px auto 0 auto; max-width: 740px; text-align: center; }
  .cd-trk-proc__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.7; color: rgba(255,255,255,0.82); margin: 0; font-weight: 500; }
  .cd-trk-proc__cta { display: inline-flex; align-items: center; gap: 10px; margin-top: 22px; padding: 14px 28px; border-radius: 999px; background: #ef6632; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.9375rem; letter-spacing: 0.04em; text-transform: uppercase; text-decoration: none; box-shadow: 0 12px 28px rgba(239,102,50,0.4); transition: transform .2s ease, box-shadow .2s ease; }
  .cd-trk-proc__cta:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(239,102,50,0.5); }
  .cd-trk-proc__cta .material-icons { font-size: 18px; }
  @media (max-width: 1100px) {
    .cd-trk-proc__row { grid-template-columns: repeat(2, 1fr); gap: 18px; }
    .cd-trk-proc__row::before { display: none; }
  }
  @media (max-width: 560px) {
    .cd-trk-proc__row { grid-template-columns: 1fr; }
    .cd-trk-proc__col { padding: 26px 22px; }
  }
</style>
<div class="cd-trk-proc">
  <p class="cd-trk-proc__intro" data-field="intro">{{intro}}</p>
  <div class="cd-trk-proc__row">
    <div class="cd-trk-proc__col" data-repeat="steps">
      <div class="cd-trk-proc__num"></div>
      <div class="cd-trk-proc__icon"><span class="material-icons">{{steps.icon}}</span></div>
      <div class="cd-trk-proc__title">{{steps.title}}</div>
      <div class="cd-trk-proc__desc">{{steps.description}}</div>
    </div>
  </div>
  <div class="cd-trk-proc__closer">
    <p class="cd-trk-proc__closer-text" data-field="closer">{{closer}}</p>
    <a class="cd-trk-proc__cta" href="/apply">Check Eligibility <span class="material-icons">arrow_forward</span></a>
  </div>
</div>
`.trim();

const PROCESS_DEFAULTS = {
  intro:
    "Five steps from application to funded rig — no months of waiting, no banker's hours, no surprises. Most trucking operators are approved in under two minutes and funded the same day.",
  steps: [
    {
      icon: 'edit_note',
      title: 'Apply Online',
      description: 'Tell us a little about your trucking operation and get pre-approved in less than two minutes — no impact to your credit.',
    },
    {
      icon: 'task_alt',
      title: 'Get Approved',
      description: 'Review the terms that fit your settlement schedule and freight volume, then sign electronically from the cab or the office.',
    },
    {
      icon: 'account_balance',
      title: 'Withdraw Funds',
      description: 'Link your business checking account and access your capital the same day — in time for fuel, parts, payroll, or a down payment on the next tractor.',
    },
    {
      icon: 'autorenew',
      title: 'Repayment',
      description: 'Payments are remitted automatically via ACH on a daily, weekly, or monthly cadence that matches how your freight invoices clear.',
    },
    {
      icon: 'rocket_launch',
      title: 'Renew Your Funding',
      description: 'Pay early and unlock larger amounts at better rates — most Cardiff trucking customers qualify for additional capital within six months.',
    },
  ],
  closer:
    "Whether you're financing your first owner-operator tractor or refinancing a 50-unit fleet, the path looks the same. Five steps, one specialist, one conversation.",
  ctaHref: '/apply',
} as const;

const processBlock = {
  id: 'sec-process-grid',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: PROCESS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: PROCESS_DEFAULTS.intro },
    {
      name: 'steps',
      label: 'Process steps (5)',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text', default: 'edit_note' },
        { name: 'title', label: 'Step title', type: 'text', default: '' },
        { name: 'description', label: 'Step description', type: 'textarea', default: '' },
      ],
      default: PROCESS_DEFAULTS.steps,
    },
    { name: 'closer', label: 'Closing line', type: 'textarea', default: PROCESS_DEFAULTS.closer },
  ],
  values: {
    intro: PROCESS_DEFAULTS.intro,
    steps: PROCESS_DEFAULTS.steps.map((s) => ({ ...s })),
    closer: PROCESS_DEFAULTS.closer,
  },
};

function buildProcessSection() {
  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-process-title',
    order: 1,
    level: 2,
    content: 'Our Process',
    alignment: 'center' as const,
    style: {
      color: '#ffffff',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '2.5rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.15',
      margin: '0 auto 14px auto',
      maxWidth: '900px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-process-div',
    order: 2,
    content:
      '<div style="width:64px;height:3px;background:#ffb798;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  return {
    id: NEW_SECTION_ID,
    type: 'section' as const,
    maxWidth: '1280px',
    style: {
      backgroundColor: '#1c3370',
      backgroundImage:
        'linear-gradient(135deg, #1c3370 0%, #25418b 55%, #1c3370 100%)',
      paddingTop: '88px',
      paddingBottom: '88px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [headerBlock, dividerBlock, processBlock],
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

  const newSection = buildProcessSection();
  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === NEW_SECTION_ID);
  if (existingIdx !== -1) {
    parsed.blocks[existingIdx] = newSection;
    console.log(`Post ${POST_ID}: rewrote existing ${NEW_SECTION_ID} (idx ${existingIdx}).`);
  } else {
    const anchorIdx = parsed.blocks.findIndex((b: any) => b?.id === ANCHOR_AFTER_ID);
    const insertAt = anchorIdx === -1 ? parsed.blocks.length : anchorIdx + 1;
    parsed.blocks.splice(insertAt, 0, newSection);
    console.log(
      `Post ${POST_ID}: inserted ${NEW_SECTION_ID} at idx ${insertAt} (after ${ANCHOR_AFTER_ID}).`
    );
  }

  // Re-number top-level order to match positions.
  parsed.blocks.forEach((b: any, i: number) => {
    if (b && typeof b === 'object') b.order = i + 1;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: 5-step numbered "Our Process" band on brand-blue gradient inserted after ${ANCHOR_AFTER_ID}.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
