/**
 * Iter 4 — Restyle the "How to Apply" section (sec-4) on post 837
 * (working-capital). Currently it is bare text: heading + two stripped
 * paragraphs that don't list any of the paperwork the user is told to
 * "have prepared". We turn it into:
 *   1. Centered H2 + orange underline (consistent w/ iter3 sec-3)
 *   2. Light blue band (#f6f9fc) matching neighbor sec-3
 *   3. An html-render checklist of 5 required items in a 2-col grid
 *      with green check chips, plus a closing line + outline CTA panel.
 *
 * Pattern lifted from styled-equipment-leasing-iter3.ts (the proven
 * cardiff card-grid recipe) but adapted to a 2-col checklist motif so
 * it visually contrasts with the 3-col qualify cards in sec-3 above.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-4-apply` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 837;
const TARGET_BLOCK_ID = 'sec-4';

const APPLY_HTML = `
<style>
  .cd-wc-apply { max-width: 1040px; margin: 0 auto; }
  .cd-wc-apply__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 40px auto; }
  .cd-wc-apply__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px 24px; }
  .cd-wc-apply__item { display: flex; align-items: flex-start; gap: 16px; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 22px 22px; box-shadow: 0 8px 22px rgba(28,51,112,0.05); transition: transform .22s ease, box-shadow .22s ease; }
  .cd-wc-apply__item:hover { transform: translateY(-3px); box-shadow: 0 14px 32px rgba(28,51,112,0.10); }
  .cd-wc-apply__check { flex: 0 0 auto; width: 36px; height: 36px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); color: #fff; box-shadow: 0 6px 14px rgba(58,168,86,0.28); }
  .cd-wc-apply__check .material-icons { font-size: 22px; }
  .cd-wc-apply__body { flex: 1 1 auto; min-width: 0; }
  .cd-wc-apply__item-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.05rem; font-weight: 800; color: #1c3370; margin: 0 0 4px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-wc-apply__item-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.6; color: #525f7f; margin: 0; }
  .cd-wc-apply__closer { margin: 44px auto 0 auto; max-width: 880px; text-align: center; padding: 30px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(90,201,111,0.08) 100%); border-radius: 14px; border: 1px solid #e6ecf5; }
  .cd-wc-apply__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0 0 22px 0; font-weight: 500; }
  .cd-wc-apply__cta { display: inline-flex; align-items: center; gap: 8px; padding: 14px 32px; background: #ef6632; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.1em; text-transform: uppercase; box-shadow: 0 10px 24px rgba(239,102,50,0.30); transition: transform .2s ease, box-shadow .2s ease; }
  .cd-wc-apply__cta:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(239,102,50,0.38); }
  .cd-wc-apply__cta .material-icons { font-size: 18px; }
  @media (max-width: 760px) {
    .cd-wc-apply__grid { grid-template-columns: 1fr; gap: 14px; }
    .cd-wc-apply__item { padding: 18px 18px; }
    .cd-wc-apply__closer { padding: 24px 20px; }
  }
</style>
<div class="cd-wc-apply">
  <p class="cd-wc-apply__intro" data-field="intro">{{intro}}</p>
  <div class="cd-wc-apply__grid">
    <div class="cd-wc-apply__item">
      <div class="cd-wc-apply__check"><span class="material-icons">check</span></div>
      <div class="cd-wc-apply__body">
        <h3 class="cd-wc-apply__item-title" data-field="item1Title">{{item1Title}}</h3>
        <p class="cd-wc-apply__item-desc" data-field="item1Desc">{{item1Desc}}</p>
      </div>
    </div>
    <div class="cd-wc-apply__item">
      <div class="cd-wc-apply__check"><span class="material-icons">check</span></div>
      <div class="cd-wc-apply__body">
        <h3 class="cd-wc-apply__item-title" data-field="item2Title">{{item2Title}}</h3>
        <p class="cd-wc-apply__item-desc" data-field="item2Desc">{{item2Desc}}</p>
      </div>
    </div>
    <div class="cd-wc-apply__item">
      <div class="cd-wc-apply__check"><span class="material-icons">check</span></div>
      <div class="cd-wc-apply__body">
        <h3 class="cd-wc-apply__item-title" data-field="item3Title">{{item3Title}}</h3>
        <p class="cd-wc-apply__item-desc" data-field="item3Desc">{{item3Desc}}</p>
      </div>
    </div>
    <div class="cd-wc-apply__item">
      <div class="cd-wc-apply__check"><span class="material-icons">check</span></div>
      <div class="cd-wc-apply__body">
        <h3 class="cd-wc-apply__item-title" data-field="item4Title">{{item4Title}}</h3>
        <p class="cd-wc-apply__item-desc" data-field="item4Desc">{{item4Desc}}</p>
      </div>
    </div>
    <div class="cd-wc-apply__item">
      <div class="cd-wc-apply__check"><span class="material-icons">check</span></div>
      <div class="cd-wc-apply__body">
        <h3 class="cd-wc-apply__item-title" data-field="item5Title">{{item5Title}}</h3>
        <p class="cd-wc-apply__item-desc" data-field="item5Desc">{{item5Desc}}</p>
      </div>
    </div>
    <div class="cd-wc-apply__item">
      <div class="cd-wc-apply__check"><span class="material-icons">check</span></div>
      <div class="cd-wc-apply__body">
        <h3 class="cd-wc-apply__item-title" data-field="item6Title">{{item6Title}}</h3>
        <p class="cd-wc-apply__item-desc" data-field="item6Desc">{{item6Desc}}</p>
      </div>
    </div>
  </div>
  <div class="cd-wc-apply__closer">
    <p class="cd-wc-apply__closer-text" data-field="closer">{{closer}}</p>
    <a class="cd-wc-apply__cta" data-field="ctaUrl" href="{{ctaUrl}}">
      <span data-field="ctaLabel">{{ctaLabel}}</span>
      <span class="material-icons">arrow_forward</span>
    </a>
  </div>
</div>
`.trim();

const APPLY_DEFAULTS = {
  intro:
    'To apply for a Cardiff working capital loan, have a few things ready. Most applicants finish the form in minutes once these are within reach.',
  item1Title: 'Government-issued ID',
  item1Desc: "A driver's license or passport for each business owner with 20% or greater ownership.",
  item2Title: 'Business EIN or tax ID',
  item2Desc: 'Proof of business formation and your federal employer identification number.',
  item3Title: 'Recent bank statements',
  item3Desc: 'The last 3–6 months of business checking statements so we can verify cash flow.',
  item4Title: 'Voided business check',
  item4Desc: 'Used to link your business checking account for fast funding and ACH repayment.',
  item5Title: 'Most recent tax return',
  item5Desc: 'Your latest business tax return helps confirm annual revenue and time in business.',
  item6Title: 'Profit & loss snapshot',
  item6Desc: 'A simple year-to-date P&L (or recent processor statements for retail/restaurant).',
  closer:
    'When your paperwork is in order, fill out the application and find out what terms your lender can offer to keep your cash flowing as your business moves along.',
  ctaLabel: 'Start your application',
  ctaUrl: 'https://cardiff.co/business/apply',
} as const;

const applyBlock = {
  id: 'sec-4-apply',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: APPLY_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: APPLY_DEFAULTS.intro },
    { name: 'item1Title', label: 'Item 1 — title', type: 'text', default: APPLY_DEFAULTS.item1Title },
    { name: 'item1Desc', label: 'Item 1 — description', type: 'textarea', default: APPLY_DEFAULTS.item1Desc },
    { name: 'item2Title', label: 'Item 2 — title', type: 'text', default: APPLY_DEFAULTS.item2Title },
    { name: 'item2Desc', label: 'Item 2 — description', type: 'textarea', default: APPLY_DEFAULTS.item2Desc },
    { name: 'item3Title', label: 'Item 3 — title', type: 'text', default: APPLY_DEFAULTS.item3Title },
    { name: 'item3Desc', label: 'Item 3 — description', type: 'textarea', default: APPLY_DEFAULTS.item3Desc },
    { name: 'item4Title', label: 'Item 4 — title', type: 'text', default: APPLY_DEFAULTS.item4Title },
    { name: 'item4Desc', label: 'Item 4 — description', type: 'textarea', default: APPLY_DEFAULTS.item4Desc },
    { name: 'item5Title', label: 'Item 5 — title', type: 'text', default: APPLY_DEFAULTS.item5Title },
    { name: 'item5Desc', label: 'Item 5 — description', type: 'textarea', default: APPLY_DEFAULTS.item5Desc },
    { name: 'item6Title', label: 'Item 6 — title', type: 'text', default: APPLY_DEFAULTS.item6Title },
    { name: 'item6Desc', label: 'Item 6 — description', type: 'textarea', default: APPLY_DEFAULTS.item6Desc },
    { name: 'closer', label: 'Closing line', type: 'textarea', default: APPLY_DEFAULTS.closer },
    { name: 'ctaLabel', label: 'CTA label', type: 'text', default: APPLY_DEFAULTS.ctaLabel },
    { name: 'ctaUrl', label: 'CTA URL', type: 'text', default: APPLY_DEFAULTS.ctaUrl },
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

  // Widen so the 2-col checklist breathes; soft blue band matches sec-3.
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
    id: 'sec-4-title',
    order: 1,
    level: 2,
    content: 'How to Apply',
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
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-4-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, applyBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-4 -> styled "How to Apply" 6-item checklist + CTA panel.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
