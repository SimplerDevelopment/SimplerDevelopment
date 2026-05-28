/**
 * Iter 10 — Working Capital page (post 837).
 *
 * Polish: refactor `sec-4-apply` (the "What you'll need to apply" checklist
 * grid) from 14 hard-coded fields (intro + 6x item title/desc + closer +
 * ctaLabel + ctaUrl) into the cleaner `data-repeat="items"` array pattern
 * that sec-3-qualify (iter8), sec-2-kinds, sec-1b-scenarios, sec-4b-why all
 * already use. Same visual output (green check chip + 2-col grid + closer
 * card with orange CTA), but content editors can now add / remove / reorder
 * application requirements in the portal without code changes.
 *
 * Mirrors scripts/migrations/cardiff/styled-equipment-leasing-iter3.ts'
 * card-grid recipe, adapted to the iter4 "checklist" visual (check chip
 * instead of icon tile). Uses `data-repeat="items"` with
 * `{{items.title}}` / `{{items.desc}}` placeholders.
 *
 * Brand: #1c3370 / #25418b headings, #5ac96f check chips, #ef6632 CTA,
 * Raleway titles, Open Sans body.
 *
 * Idempotent: detects existing `sec-4-apply` html-render and rewrites it.
 * Preserves any author overrides for intro / closer / ctaLabel / ctaUrl
 * if already present in values; items array is intentionally re-seeded
 * (schema shape changed from 6x flat fields).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 837;
const SECTION_ID = 'sec-4';
const TARGET_BLOCK_ID = 'sec-4-apply';

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
    <div class="cd-wc-apply__item" data-repeat="items">
      <div class="cd-wc-apply__check"><span class="material-icons">check</span></div>
      <div class="cd-wc-apply__body">
        <h3 class="cd-wc-apply__item-title">{{items.title}}</h3>
        <p class="cd-wc-apply__item-desc">{{items.desc}}</p>
      </div>
    </div>
  </div>
  <div class="cd-wc-apply__closer">
    <p class="cd-wc-apply__closer-text" data-field="closer">{{closer}}</p>
    <a class="cd-wc-apply__cta" href="{{ctaUrl}}">
      <span data-field="ctaLabel">{{ctaLabel}}</span>
      <span class="material-icons">arrow_forward</span>
    </a>
  </div>
</div>
`.trim();

const APPLY_DEFAULTS = {
  intro:
    "To apply for a Cardiff working capital loan, have a few things ready. Most applicants finish the form in minutes once these are within reach.",
  items: [
    {
      title: 'Government-issued ID',
      desc: "A driver's license or passport for each business owner with 20% or greater ownership.",
    },
    {
      title: 'Business EIN or tax ID',
      desc: 'Proof of business formation and your federal employer identification number.',
    },
    {
      title: 'Recent bank statements',
      desc: 'The last 3–6 months of business checking statements so we can verify cash flow.',
    },
    {
      title: 'Voided business check',
      desc: 'Used to link your business checking account for fast funding and ACH repayment.',
    },
    {
      title: 'Most recent tax return',
      desc: 'Your latest business tax return helps confirm annual revenue and time in business.',
    },
    {
      title: 'Profit & loss snapshot',
      desc: 'A simple year-to-date P&L (or recent processor statements for retail/restaurant).',
    },
  ],
  closer:
    'When your paperwork is in order, fill out the application and find out what terms your lender can offer to keep your cash flowing as your business moves along.',
  ctaLabel: 'Start your application',
  ctaUrl: 'https://cardiff.co/business/apply',
} as const;

const applyBlock = {
  id: TARGET_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: APPLY_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: APPLY_DEFAULTS.intro },
    {
      name: 'items',
      label: 'Application requirements',
      type: 'array',
      itemFields: [
        { name: 'title', label: 'Item title', type: 'text' },
        { name: 'desc', label: 'Item description', type: 'textarea' },
      ],
    },
    { name: 'closer', label: 'Closing line', type: 'textarea', default: APPLY_DEFAULTS.closer },
    { name: 'ctaLabel', label: 'CTA label', type: 'text', default: APPLY_DEFAULTS.ctaLabel },
    { name: 'ctaUrl', label: 'CTA URL', type: 'text', default: APPLY_DEFAULTS.ctaUrl },
  ],
  values: {
    intro: APPLY_DEFAULTS.intro,
    items: APPLY_DEFAULTS.items.map((i) => ({ ...i })),
    closer: APPLY_DEFAULTS.closer,
    ctaLabel: APPLY_DEFAULTS.ctaLabel,
    ctaUrl: APPLY_DEFAULTS.ctaUrl,
  },
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

  const secIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === SECTION_ID);
  if (secIdx === -1) {
    console.error(`Post ${POST_ID}: section ${SECTION_ID} not found; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[secIdx];
  if (sec.type !== 'section' || !Array.isArray(sec.blocks)) {
    console.error(`Post ${POST_ID}: block ${SECTION_ID} is not a section with blocks[]; aborting`);
    process.exit(1);
  }

  const childIdx = sec.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
  if (childIdx === -1) {
    console.error(
      `Post ${POST_ID}: ${TARGET_BLOCK_ID} not found inside ${SECTION_ID}; aborting`,
    );
    process.exit(1);
  }
  const existing = sec.blocks[childIdx];
  if (existing?.type !== 'html-render') {
    console.error(
      `Post ${POST_ID}: ${TARGET_BLOCK_ID} is not html-render (was ${existing?.type}); aborting`,
    );
    process.exit(1);
  }

  // Preserve any author overrides for the scalar fields (items array is
  // intentionally re-seeded — schema shape changed from 6x flat fields).
  const pickStr = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.trim().length > 0 ? v : fallback;
  applyBlock.values.intro = pickStr(existing.values?.intro, APPLY_DEFAULTS.intro);
  applyBlock.values.closer = pickStr(existing.values?.closer, APPLY_DEFAULTS.closer);
  applyBlock.values.ctaLabel = pickStr(existing.values?.ctaLabel, APPLY_DEFAULTS.ctaLabel);
  applyBlock.values.ctaUrl = pickStr(existing.values?.ctaUrl, APPLY_DEFAULTS.ctaUrl);

  sec.blocks[childIdx] = applyBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: refactored ${TARGET_BLOCK_ID} to data-repeat="items" (6 items).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
