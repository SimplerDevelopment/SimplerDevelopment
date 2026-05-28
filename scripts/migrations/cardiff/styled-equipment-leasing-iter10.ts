/**
 * Iter 10: Restyle the closing "Let Us Help You Get The Equipment You Need"
 * section on post 802 (equipment-leasing). This is sec-11 — currently a bare
 * heading + two plain text paragraphs with no visual hierarchy and no actual
 * CTA button. It sits between the explainer bands and the global final-cta
 * block, so it needs to act as a persuasion handoff: a brief value pitch,
 * a small reasons-row, and an inline "Apply Now" button so users can convert
 * without scrolling further.
 *
 * We replace sec-11's sub-blocks with:
 *   1. Centered H2 + orange underline (consistent with siblings)
 *   2. A single html-render block carrying:
 *      - urgency lede + supporting copy
 *      - a 3-up icon-card row driven by data-repeat="reasons" (3 short
 *        reasons-to-act: speed, fit, partnership)
 *      - an inline gradient CTA button (anchor to /apply, brand orange→blue)
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632 / #ffb798) — Raleway + Open Sans. No emojis.
 *
 * Idempotent: re-running detects the html-render block at id
 *   `sec-11-cta` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-11';

const CTA_HTML = `
<style>
  .cd-eq-cta { max-width: 1080px; margin: 0 auto; }
  .cd-eq-cta__lede { text-align: center; color: #1c3370; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.375rem; font-weight: 700; line-height: 1.4; letter-spacing: -0.005em; max-width: 820px; margin: 0 auto 18px auto; }
  .cd-eq-cta__support { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 44px auto; }
  .cd-eq-cta__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 0 auto 44px auto; }
  .cd-eq-cta__reason { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 26px 24px; display: flex; align-items: flex-start; gap: 16px; box-shadow: 0 10px 28px rgba(28,51,112,0.06); }
  .cd-eq-cta__reason-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex: 0 0 44px; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 6px 14px rgba(28,51,112,0.22); }
  .cd-eq-cta__reason:nth-child(2) .cd-eq-cta__reason-icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 6px 14px rgba(239,102,50,0.28); }
  .cd-eq-cta__reason:nth-child(3) .cd-eq-cta__reason-icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 6px 14px rgba(58,168,86,0.28); }
  .cd-eq-cta__reason-icon .material-icons { font-size: 24px; }
  .cd-eq-cta__reason-body { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .cd-eq-cta__reason-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0; line-height: 1.25; letter-spacing: -0.005em; }
  .cd-eq-cta__reason-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.6; color: #525f7f; margin: 0; }
  .cd-eq-cta__action { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 32px 28px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.07) 100%); border-radius: 14px; border: 1px solid #e6ecf5; }
  .cd-eq-cta__action-kicker { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.65; color: #25418b; margin: 0; text-align: center; font-weight: 500; max-width: 640px; }
  .cd-eq-cta__btn { display: inline-flex; align-items: center; gap: 10px; padding: 16px 32px; border-radius: 999px; background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); color: #ffffff; text-decoration: none; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 1.0625rem; letter-spacing: 0.01em; box-shadow: 0 14px 28px rgba(239,102,50,0.32); transition: transform .2s ease, box-shadow .2s ease, background .25s ease; }
  .cd-eq-cta__btn:hover { transform: translateY(-2px); box-shadow: 0 18px 36px rgba(239,102,50,0.38); background: linear-gradient(135deg, #1c3370 0%, #25418b 100%); color: #ffffff; }
  .cd-eq-cta__btn .material-icons { font-size: 20px; }
  @media (max-width: 980px) {
    .cd-eq-cta__grid { grid-template-columns: 1fr; gap: 14px; }
  }
  @media (max-width: 620px) {
    .cd-eq-cta__lede { font-size: 1.1875rem; }
    .cd-eq-cta__reason { padding: 22px 20px; }
    .cd-eq-cta__action { padding: 26px 20px; }
    .cd-eq-cta__btn { width: 100%; justify-content: center; padding: 16px 24px; }
  }
</style>
<div class="cd-eq-cta">
  <p class="cd-eq-cta__lede" data-field="lede">{{lede}}</p>
  <p class="cd-eq-cta__support" data-field="support">{{support}}</p>
  <div class="cd-eq-cta__grid">
    <div class="cd-eq-cta__reason" data-repeat="reasons">
      <div class="cd-eq-cta__reason-icon"><span class="material-icons">{{reasons.icon}}</span></div>
      <div class="cd-eq-cta__reason-body">
        <h3 class="cd-eq-cta__reason-title">{{reasons.title}}</h3>
        <p class="cd-eq-cta__reason-desc">{{reasons.desc}}</p>
      </div>
    </div>
  </div>
  <div class="cd-eq-cta__action">
    <p class="cd-eq-cta__action-kicker" data-field="kicker">{{kicker}}</p>
    <a class="cd-eq-cta__btn" href="{{btnHref}}" data-field="btnHref">
      <span class="material-icons">arrow_forward</span>
      <span data-field="btnLabel">{{btnLabel}}</span>
    </a>
  </div>
</div>
`.trim();

const CTA_DEFAULTS = {
  lede: 'Every day you wait for new equipment is a day you lose productivity and profit.',
  support: 'Cardiff helps eliminate that delay with fast, accessible equipment financing tailored to your unique business. Whether you’re investing in technology, machinery, or medical devices, you deserve a funding partner that understands your urgency and supports your success.',
  reasons: [
    { icon: 'bolt', title: 'Move fast', desc: 'Same-day decisions and as fast as same-day funding so your project doesn’t stall.' },
    { icon: 'handshake', title: 'Built around you', desc: 'Repayment structures and credit thresholds designed for real small-business cash flow.' },
    { icon: 'support_agent', title: 'A true partner', desc: 'A dedicated funding specialist guides you from application to approval — no call-center runaround.' },
  ],
  kicker: 'Apply now and take control of your equipment needs with financing that fits your future.',
  btnHref: '/apply',
  btnLabel: 'Apply Now',
} as const;

const ctaBlock = {
  id: 'sec-11-cta',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: CTA_HTML,
  fields: [
    { name: 'lede', label: 'Lede sentence', type: 'textarea', default: CTA_DEFAULTS.lede },
    { name: 'support', label: 'Supporting paragraph', type: 'textarea', default: CTA_DEFAULTS.support },
    {
      name: 'reasons',
      label: 'Reasons to act',
      type: 'repeater',
      default: CTA_DEFAULTS.reasons,
      fields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
    },
    { name: 'kicker', label: 'CTA kicker', type: 'textarea', default: CTA_DEFAULTS.kicker },
    { name: 'btnHref', label: 'Button URL', type: 'text', default: CTA_DEFAULTS.btnHref },
    { name: 'btnLabel', label: 'Button label', type: 'text', default: CTA_DEFAULTS.btnLabel },
  ],
  values: { ...CTA_DEFAULTS, reasons: CTA_DEFAULTS.reasons.map((r) => ({ ...r })) },
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

  // Widen so the 3-up reasons row breathes alongside the inline CTA card.
  sec.maxWidth = '1200px';
  // White backdrop here to break the alternating tint cadence and let the
  // gradient CTA card carry the visual weight.
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
    id: 'sec-11-title',
    order: 1,
    level: 2,
    content: 'Let Us Help You Get The Equipment You Need',
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
    id: 'sec-11-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, ctaBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-11 -> styled closing CTA band with 3 reasons + Apply Now button.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
