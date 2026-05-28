/**
 * Iter 10 — post 829 (SBA Loans). Iters 1-9 styled every existing band and
 * converted sec-3 to a `data-repeat="cards"` array. The remaining gap vs.
 * sibling cardiff product pages (e.g. equipment-leasing sec-9 "How to Apply
 * for Equipment Financing") is a **process / how-to-apply 3-step band**.
 * Cardiff's SBA loan pages show prospects exactly what the application
 * journey looks like: Apply → Get Approved → Receive Funds. Without it,
 * post 829 jumps straight from requirements (sec-4) into the FAQ — no
 * confidence-building micro-roadmap.
 *
 * Inserts a new section `sec-5-apply` between `sec-4` and `sba-faq-acc`
 * (slot left open by iter6 when it swapped the original sec-5 FAQ out for
 * `sba-faq-acc`). The grid uses the same icon-card pattern as iter3
 * (styled-equipment-leasing-iter3) — circular icon chips, brand palette,
 * 3-up → 1-up responsive — but wrapped in a single `data-repeat="steps"`
 * template so editors add/remove steps from one array control.
 *
 * Idempotent: locates by id `sec-5-apply`; if present, rewrites in place;
 * otherwise splices it in immediately before `sba-faq-acc`.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 829;
const NEW_BLOCK_ID = 'sec-5-apply';
const INSERT_BEFORE_ID = 'sba-faq-acc';

const APPLY_HTML = `
<style>
  .cd-sba-apply { max-width: 1140px; margin: 0 auto; }
  .cd-sba-apply__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; max-width: 720px; margin: 0 auto 48px auto; }
  .cd-sba-apply__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin: 0 0 44px 0; }
  .cd-sba-apply__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 36px 28px 30px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-sba-apply__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-sba-apply__step { position: absolute; top: -16px; left: 28px; background: #ef6632; color: #fff; font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; padding: 6px 12px; border-radius: 4px; box-shadow: 0 6px 14px rgba(239,102,50,0.32); }
  .cd-sba-apply__icon { width: 60px; height: 60px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-sba-apply__icon .material-icons { font-size: 30px; }
  .cd-sba-apply__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.15rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; text-transform: uppercase; }
  .cd-sba-apply__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-sba-apply__cta-wrap { text-align: center; }
  .cd-sba-apply__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 17px 38px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-sba-apply__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 44px rgba(90,201,111,0.55); }
  @media (max-width: 980px) {
    .cd-sba-apply__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-sba-apply__grid { grid-template-columns: 1fr; gap: 24px; }
    .cd-sba-apply__card { padding: 32px 24px 26px 24px; }
  }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<div class="cd-sba-apply">
  <p class="cd-sba-apply__intro" data-field="intro">{{intro}}</p>
  <div class="cd-sba-apply__grid">
    <div class="cd-sba-apply__card" data-repeat="steps">
      <span class="cd-sba-apply__step" data-field="step">{{steps.step}}</span>
      <div class="cd-sba-apply__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
      <h3 class="cd-sba-apply__card-title" data-field="title">{{steps.title}}</h3>
      <p class="cd-sba-apply__card-desc" data-field="desc">{{steps.desc}}</p>
    </div>
  </div>
  <div class="cd-sba-apply__cta-wrap">
    <a class="cd-sba-apply__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
  </div>
</div>
`.trim();

const STEPS = [
  {
    step: 'Step 1',
    icon: 'edit_note',
    title: 'Apply Online',
    desc: 'Complete our short online application in about 5 minutes. No hard credit check, no obligation, and no paperwork to dig up.',
  },
  {
    step: 'Step 2',
    icon: 'verified',
    title: 'Get a Same-Day Decision',
    desc: 'Our specialists review your business profile and reach out with tailored SBA loan options that fit your goals and cash flow.',
  },
  {
    step: 'Step 3',
    icon: 'account_balance',
    title: 'Receive Your Funds',
    desc: 'Once approved, funds are released as fast as same day* so you can put capital to work and keep your business moving.',
  },
];

const APPLY_DEFAULTS = {
  intro:
    'Applying for an SBA loan with Cardiff is straightforward. Three simple steps take you from interest to funded — most applicants get a decision the same day.',
  ctaText: 'Start Your Application',
  ctaUrl: 'https://cardiff.co/business/apply',
  steps: STEPS,
} as const;

const APPLY_FIELDS = [
  { name: 'intro', label: 'Intro paragraph', type: 'textarea' as const },
  { name: 'ctaText', label: 'CTA label', type: 'text' as const },
  { name: 'ctaUrl', label: 'CTA url', type: 'text' as const },
  {
    name: 'steps',
    label: 'Application steps',
    type: 'array' as const,
    itemFields: [
      { name: 'step', label: 'Step badge (e.g. "Step 1")', type: 'text' as const },
      { name: 'icon', label: 'Material Icons name', type: 'text' as const },
      { name: 'title', label: 'Step title', type: 'text' as const },
      { name: 'desc', label: 'Step description', type: 'textarea' as const },
    ],
  },
];

const applyBlock = {
  id: NEW_BLOCK_ID + '-html',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: APPLY_HTML,
  fields: APPLY_FIELDS,
  values: { ...APPLY_DEFAULTS },
};

const headerBlock = {
  id: NEW_BLOCK_ID + '-title',
  type: 'heading' as const,
  order: 1,
  level: 2 as const,
  content: 'How to Apply for an SBA Loan',
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
  id: NEW_BLOCK_ID + '-div',
  type: 'text' as const,
  order: 2,
  content:
    '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
  style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
};

const applySection = {
  id: NEW_BLOCK_ID,
  type: 'section' as const,
  order: 6,
  width: 'full' as const,
  maxWidth: '1200px',
  style: {
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  blocks: [headerBlock, dividerBlock, applyBlock],
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

  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === NEW_BLOCK_ID);
  if (existingIdx !== -1) {
    parsed.blocks[existingIdx] = applySection;
    console.log(`Post ${POST_ID}: rewrote existing ${NEW_BLOCK_ID} at index ${existingIdx}.`);
  } else {
    const beforeIdx = parsed.blocks.findIndex((b: any) => b?.id === INSERT_BEFORE_ID);
    if (beforeIdx === -1) {
      console.error(`Post ${POST_ID}: cannot find ${INSERT_BEFORE_ID} to insert before; aborting`);
      process.exit(1);
    }
    parsed.blocks.splice(beforeIdx, 0, applySection);
    console.log(`Post ${POST_ID}: inserted ${NEW_BLOCK_ID} at index ${beforeIdx} (before ${INSERT_BEFORE_ID}).`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: "How to Apply for an SBA Loan" 3-step band in place.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
