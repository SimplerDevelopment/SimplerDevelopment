/**
 * Iter 7 — post 817 (Industries · Trucking). The single biggest remaining
 * content gap on the trucking page is the qualification-requirements matrix
 * that lives, fully unstyled and partially buried, in the cardiff.co source
 * block #9 ("Working Capital Credit Score 500 FICO Time in Business 6 MO
 * Revenue $10K MO $120K YR Citizenship Status Legal Residency Ownership Any
 * Owner Equipment Financing Credit Score 600+ FICO Time in Business 2 YRS
 * Revenue None! Citizenship Status Legal Residency Ownership 51%"). None of
 * iters 1-6 ported it — checked with `bun -e` (no "FICO" / "Time in Business"
 * / "Citizenship" anywhere in post 817 content).
 *
 * This adds a new section `sec-qual` (a two-product qualification grid)
 * between `sec-1` (hero/stats + intro) and `sec-2` (loan products grid).
 * That placement matches the source flow: intro → qualify → products →
 * reviews → why → faq → cta.
 *
 * Reuses the icon-card grid pattern established by
 * scripts/migrations/cardiff/styled-equipment-leasing-iter3.ts:
 *   - section wrapper with centered H2 + orange rule
 *   - html-render child with a card grid on a light-blue band
 *   - data-repeat="products" so editors can add a 3rd financing product
 *     (e.g. SBA Loans) later without touching the script
 *   - each product card has a 4-row requirements list (data-repeat="reqs")
 *
 * Idempotent: re-running replaces any existing `sec-qual` in place; otherwise
 * splices it directly after `sec-1`.
 *
 * Brand palette: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798. Raleway +
 * Open Sans. No emojis (Material Icons via <span class="material-icons">).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const SEC_ID = 'sec-qual';
const INSERT_AFTER_ID = 'sec-1';

const QUAL_HTML = `
<style>
  .cd-trk-qual { max-width: 1140px; margin: 0 auto; }
  .cd-trk-qual__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-trk-qual__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; }
  .cd-trk-qual__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 36px 32px; box-shadow: 0 12px 32px rgba(28,51,112,0.07); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-trk-qual__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.13); }
  .cd-trk-qual__head { display: flex; align-items: center; gap: 16px; margin: 0 0 22px 0; padding: 0 0 18px 0; border-bottom: 1px solid #eef2f8; }
  .cd-trk-qual__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); flex-shrink: 0; }
  .cd-trk-qual__card:nth-child(2) .cd-trk-qual__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-trk-qual__card:nth-child(3) .cd-trk-qual__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-trk-qual__icon .material-icons { font-size: 30px; }
  .cd-trk-qual__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.375rem; font-weight: 800; color: #1c3370; margin: 0; letter-spacing: -0.005em; line-height: 1.2; }
  .cd-trk-qual__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
  .cd-trk-qual__row { display: grid; grid-template-columns: 22px 1fr auto; gap: 12px; align-items: baseline; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-trk-qual__check { color: #5ac96f; font-size: 18px; line-height: 1; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
  .cd-trk-qual__check .material-icons { font-size: 18px; }
  .cd-trk-qual__label { color: #25418b; font-size: 0.9375rem; font-weight: 600; letter-spacing: -0.002em; }
  .cd-trk-qual__value { color: #1c3370; font-size: 0.9375rem; font-weight: 700; text-align: right; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-trk-qual__cta { margin: 28px 0 0 0; text-align: center; }
  .cd-trk-qual__cta a { display: inline-block; background: #ef6632; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.8125rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 12px 28px; border-radius: 6px; text-decoration: none; box-shadow: 0 8px 20px rgba(239,102,50,0.32); transition: transform .15s ease, box-shadow .15s ease; }
  .cd-trk-qual__cta a:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(239,102,50,0.42); }
  @media (max-width: 820px) {
    .cd-trk-qual__grid { grid-template-columns: 1fr; gap: 20px; }
    .cd-trk-qual__card { padding: 28px 22px; }
    .cd-trk-qual__head { gap: 14px; }
    .cd-trk-qual__icon { width: 48px; height: 48px; border-radius: 12px; }
    .cd-trk-qual__icon .material-icons { font-size: 26px; }
    .cd-trk-qual__title { font-size: 1.2rem; }
  }
</style>
<div class="cd-trk-qual">
  <p class="cd-trk-qual__intro" data-field="intro">{{intro}}</p>
  <div class="cd-trk-qual__grid">
    <div class="cd-trk-qual__card" data-repeat="products">
      <div class="cd-trk-qual__head">
        <div class="cd-trk-qual__icon"><span class="material-icons" data-field="icon">{{products.icon}}</span></div>
        <h3 class="cd-trk-qual__title" data-field="name">{{products.name}}</h3>
      </div>
      <ul class="cd-trk-qual__list">
        <li class="cd-trk-qual__row" data-repeat="reqs">
          <span class="cd-trk-qual__check"><span class="material-icons">check_circle</span></span>
          <span class="cd-trk-qual__label" data-field="label">{{reqs.label}}</span>
          <span class="cd-trk-qual__value" data-field="value">{{reqs.value}}</span>
        </li>
      </ul>
    </div>
  </div>
  <div class="cd-trk-qual__cta">
    <a data-field="ctaUrl" href="{{ctaUrl}}"><span data-field="ctaText">{{ctaText}}</span></a>
  </div>
</div>
`.trim();

const QUAL_DEFAULTS = {
  intro:
    'Cardiff matches your trucking business with the financing product that fits — here are the baseline qualifications for the two most common paths for owner-operators and fleets.',
  products: [
    {
      icon: 'payments',
      name: 'Working Capital',
      reqs: [
        { label: 'Credit Score', value: '500 FICO' },
        { label: 'Time in Business', value: '6 months' },
        { label: 'Revenue', value: '$10K / month · $120K / year' },
        { label: 'Citizenship Status', value: 'Legal Residency' },
        { label: 'Ownership', value: 'Any Owner' },
      ],
    },
    {
      icon: 'local_shipping',
      name: 'Equipment Financing',
      reqs: [
        { label: 'Credit Score', value: '600+ FICO' },
        { label: 'Time in Business', value: '2 years' },
        { label: 'Revenue', value: 'No minimum' },
        { label: 'Citizenship Status', value: 'Legal Residency' },
        { label: 'Ownership', value: '51%+' },
      ],
    },
  ],
  ctaText: 'Apply Now',
  ctaUrl: 'https://cardiff.co/business/apply',
};

const qualRenderBlock = {
  id: 'sec-qual-render',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: QUAL_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea' as const },
    {
      name: 'products',
      label: 'Product cards',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Icon (Material Icons name)', type: 'text' as const },
        { name: 'name', label: 'Product name', type: 'text' as const },
        {
          name: 'reqs',
          label: 'Requirements',
          type: 'array' as const,
          itemFields: [
            { name: 'label', label: 'Label', type: 'text' as const },
            { name: 'value', label: 'Value', type: 'text' as const },
          ],
        },
      ],
    },
    { name: 'ctaText', label: 'CTA button text', type: 'text' as const },
    { name: 'ctaUrl', label: 'CTA button URL', type: 'text' as const },
  ],
  values: { ...QUAL_DEFAULTS },
};

const sectionBlock = {
  id: SEC_ID,
  type: 'section' as const,
  width: 'full' as const,
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
      id: 'sec-qual-title',
      order: 1,
      level: 2,
      content: 'How to Qualify for a Trucking Loan',
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
      id: 'sec-qual-div',
      order: 2,
      content:
        '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
      style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
    },
    qualRenderBlock,
  ],
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

  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === SEC_ID);
  if (existingIdx >= 0) {
    const prevOrder = parsed.blocks[existingIdx].order ?? existingIdx + 1;
    parsed.blocks[existingIdx] = { ...sectionBlock, order: prevOrder };
    console.log(`Replaced existing ${SEC_ID} at index ${existingIdx}.`);
  } else {
    const afterIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === INSERT_AFTER_ID);
    if (afterIdx < 0) {
      console.error(`Post ${POST_ID}: could not find ${INSERT_AFTER_ID} to insert after`);
      process.exit(1);
    }
    const baseOrder = parsed.blocks[afterIdx].order ?? afterIdx + 1;
    parsed.blocks.splice(afterIdx + 1, 0, { ...sectionBlock, order: baseOrder + 1 });
    // Bump everything after the insert point so order stays monotonic.
    for (let i = afterIdx + 2; i < parsed.blocks.length; i++) {
      const cur = parsed.blocks[i].order;
      parsed.blocks[i].order = typeof cur === 'number' ? cur + 1 : i + 1;
    }
    console.log(`Inserted ${SEC_ID} at index ${afterIdx + 1} (after ${INSERT_AFTER_ID}).`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: ${parsed.blocks.length} blocks.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
