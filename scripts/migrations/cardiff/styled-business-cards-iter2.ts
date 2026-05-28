/**
 * Iter 2: Replace post 797 (business-cards), block 'sec-2' ("Business Card" benefits)
 * with a blue full-width section featuring a white-card benefits grid that matches
 * cardiff.co's deep-blue brand band.
 *
 * Original cardiff.co/business-loans/products/business-cards/ renders the
 * "Business Card" benefits as a styled section, while our port renders them as
 * plain stacked cards with orange checkmarks on a white background — losing the
 * blue brand moment.
 *
 * Same pattern as styled-sba-loans-iter2.ts: swap the section block for an
 * `html-render` block. Uses `data-repeat="cards"` + namespaced `{{cards.field}}`
 * + `data-field="field"` for the repeating card list (so editors can add/remove
 * benefits without touching HTML).
 *
 * Idempotent: detects if sec-2 has already been replaced (type === 'html-render')
 * and re-applies cleanly.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 797;
const TARGET_BLOCK_ID = 'sec-2';

const SEC2_HTML = `
<style>
  .cd-bc-benefits { position: relative; background: linear-gradient(180deg, #1c3370 0%, #25418b 100%); color: #fff; padding: 96px 24px 110px 24px; overflow: hidden; }
  .cd-bc-benefits::before { content: ''; position: absolute; top: -120px; right: -120px; width: 380px; height: 380px; background: radial-gradient(circle, rgba(90,201,111,0.18) 0%, rgba(90,201,111,0) 70%); pointer-events: none; }
  .cd-bc-benefits::after { content: ''; position: absolute; bottom: -160px; left: -120px; width: 420px; height: 420px; background: radial-gradient(circle, rgba(255,183,152,0.10) 0%, rgba(255,183,152,0) 70%); pointer-events: none; }
  .cd-bc-benefits__inner { position: relative; z-index: 2; max-width: 1200px; margin: 0 auto; }
  .cd-bc-benefits__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.4rem; font-weight: 800; line-height: 1.15; letter-spacing: -0.015em; text-transform: uppercase; text-align: center; margin: 0 0 18px 0; color: #fff; }
  .cd-bc-benefits__rule { width: 56px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 26px auto; }
  .cd-bc-benefits__intro { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.65; color: rgba(255,255,255,0.88); max-width: 760px; margin: 0 auto 52px auto; text-align: center; }
  .cd-bc-benefits__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; margin: 0 0 48px 0; }
  .cd-bc-benefits__card { background: #ffffff; border-radius: 10px; padding: 30px 22px 26px 22px; text-align: center; box-shadow: 0 18px 44px rgba(7, 18, 50, 0.28); transition: transform 0.22s ease, box-shadow 0.22s ease; display: flex; flex-direction: column; align-items: center; }
  .cd-bc-benefits__card:hover { transform: translateY(-4px); box-shadow: 0 26px 58px rgba(7, 18, 50, 0.36); }
  .cd-bc-benefits__icon { display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #ef6632 0%, #ffb798 100%); color: #fff; margin: 0 auto 16px auto; box-shadow: 0 10px 22px rgba(239,102,50,0.32); }
  .cd-bc-benefits__icon .material-icons { font-size: 28px; }
  .cd-bc-benefits__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; color: #1c3370; margin: 0; line-height: 1.3; }
  .cd-bc-benefits__cta-wrap { text-align: center; }
  .cd-bc-benefits__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 17px 38px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-bc-benefits__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 44px rgba(90,201,111,0.55); }
  @media (max-width: 1000px) { .cd-bc-benefits__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 600px) {
    .cd-bc-benefits { padding: 64px 18px 76px 18px; }
    .cd-bc-benefits__title { font-size: 1.75rem; }
    .cd-bc-benefits__grid { grid-template-columns: 1fr; gap: 16px; }
  }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<section class="cd-bc-benefits">
  <div class="cd-bc-benefits__inner">
    <h2 class="cd-bc-benefits__title" data-field="title">{{title}}</h2>
    <div class="cd-bc-benefits__rule"></div>
    <p class="cd-bc-benefits__intro" data-field="intro">{{intro}}</p>
    <div class="cd-bc-benefits__grid">
      <div class="cd-bc-benefits__card" data-repeat="cards">
        <div class="cd-bc-benefits__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
        <h3 class="cd-bc-benefits__card-title" data-field="label">{{cards.label}}</h3>
      </div>
    </div>
    <div class="cd-bc-benefits__cta-wrap">
      <a class="cd-bc-benefits__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
    </div>
  </div>
</section>
`.trim();

const FIELDS = [
  { name: 'title', label: 'Section title', type: 'text', default: 'Business Card' },
  {
    name: 'intro',
    label: 'Intro copy',
    type: 'textarea',
    default:
      'Built for everyday business spend — keep personal and business expenses separate, earn travel benefits, and manage your account online 24/7.',
  },
  {
    name: 'cards',
    label: 'Benefit cards',
    type: 'repeater',
    fields: [
      { name: 'icon', label: 'Material icon', type: 'text' },
      { name: 'label', label: 'Benefit', type: 'text' },
    ],
    default: [
      { icon: 'percent', label: '0% Introductory APR for 12 Months on Purchases and Balance Transfers' },
      { icon: 'flight_takeoff', label: 'Enhanced Travel Benefits' },
      { icon: 'support_agent', label: '24/7 Cardmember Service' },
      { icon: 'receipt_long', label: 'Detailed Statements and Online Account Management' },
      { icon: 'account_balance_wallet', label: 'Separate Your Personal and Business Expenses' },
      { icon: 'money_off', label: 'No Annual Fee' },
    ],
  },
  { name: 'ctaText', label: 'CTA text', type: 'text', default: 'Apply Now' },
  { name: 'ctaUrl', label: 'CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
];

const VALUES: Record<string, unknown> = {};
for (const f of FIELDS) VALUES[f.name] = (f as { default: unknown }).default;

const newSec2Block = {
  id: TARGET_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 2,
  html: SEC2_HTML,
  fields: FIELDS,
  values: VALUES,
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${POST_ID} not found`);
    process.exit(1);
  }
  const parsed = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }
  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id='${TARGET_BLOCK_ID}'; aborting`);
    process.exit(1);
  }
  const existing = parsed.blocks[idx];
  if (existing.type !== 'section' && existing.type !== 'html-render') {
    console.error(
      `Post ${POST_ID}: block '${TARGET_BLOCK_ID}' has unexpected type '${existing.type}'; aborting`,
    );
    process.exit(1);
  }
  const wasAlreadyHtmlRender = existing.type === 'html-render';
  parsed.blocks[idx] = newSec2Block;
  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced '${TARGET_BLOCK_ID}' with blue benefits band` +
      (wasAlreadyHtmlRender ? ' (was already html-render — reapplied)' : ' (was section)') +
      `. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
