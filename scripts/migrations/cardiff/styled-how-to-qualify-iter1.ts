/**
 * Iteration 1: Replace the "Working Capital / Equipment Financing" stack on
 * post 804 (how-to-qualify) with a true two-column comparison table that
 * matches cardiff.co's original side-by-side layout.
 *
 * Current sec-2 holds 23 sibling blocks that the migrator flattened from the
 * original HTML — heading, intro paragraph, then five Credit Score / Time in
 * Business / Revenue / Citizenship / Ownership rows for "Working Capital",
 * followed by the same five rows for "Equipment Financing". The port renders
 * them as a single linear column with duplicate headings and no comparison
 * structure.
 *
 * Cardiff.co's original presents them as a single section with two parallel
 * columns separated by a vertical divider, each row aligned across columns
 * (Credit Score row | Time in Business row | …). This rebuild replaces sec-2's
 * contents with a single html-render block that ships that layout while
 * keeping the cell copy editable via fields.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 804;
const TARGET_BLOCK_ID = 'sec-2';

const COMPARE_HTML = `
<style>
  .cd-qualify { max-width: 1080px; margin: 0 auto; }
  .cd-qualify__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-qualify__intro strong { color: #1c3370; }
  .cd-qualify__grid { display: grid; grid-template-columns: 1fr 1px 1fr; gap: 0; align-items: stretch; }
  .cd-qualify__divider { background: #e3e8f0; width: 1px; }
  .cd-qualify__col { padding: 0 32px; }
  .cd-qualify__col--left { padding-left: 0; }
  .cd-qualify__col--right { padding-right: 0; }
  .cd-qualify__colTitle { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.875rem; font-weight: 800; color: #1c3370; letter-spacing: -0.01em; margin: 0 0 12px 0; line-height: 1.15; }
  .cd-qualify__colSub { color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.7; margin: 0 0 28px 0; }
  .cd-qualify__cell { padding: 22px 0; border-top: 1px solid #eef2f7; }
  .cd-qualify__cell:first-of-type { border-top: none; padding-top: 8px; }
  .cd-qualify__label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #ef6632; margin: 0 0 8px 0; }
  .cd-qualify__value { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.65; color: #3c4858; margin: 0; }
  @media (max-width: 820px) {
    .cd-qualify__grid { grid-template-columns: 1fr; }
    .cd-qualify__divider { width: 100%; height: 1px; margin: 24px 0; }
    .cd-qualify__col { padding: 0; }
    .cd-qualify__colTitle { font-size: 1.5rem; }
  }
</style>
<div class="cd-qualify">
  <p class="cd-qualify__intro" data-field="intro">{{intro}}</p>
  <div class="cd-qualify__grid">
    <div class="cd-qualify__col cd-qualify__col--left">
      <h3 class="cd-qualify__colTitle" data-field="wcTitle">{{wcTitle}}</h3>
      <p class="cd-qualify__colSub" data-field="wcSub">{{wcSub}}</p>
      <div class="cd-qualify__cell">
        <p class="cd-qualify__label">Credit Score</p>
        <p class="cd-qualify__value" data-field="wcCredit">{{wcCredit}}</p>
      </div>
      <div class="cd-qualify__cell">
        <p class="cd-qualify__label">Time in Business</p>
        <p class="cd-qualify__value" data-field="wcTime">{{wcTime}}</p>
      </div>
      <div class="cd-qualify__cell">
        <p class="cd-qualify__label">Revenue</p>
        <p class="cd-qualify__value" data-field="wcRevenue">{{wcRevenue}}</p>
      </div>
      <div class="cd-qualify__cell">
        <p class="cd-qualify__label">Is US Citizenship Required?</p>
        <p class="cd-qualify__value" data-field="wcCitizen">{{wcCitizen}}</p>
      </div>
      <div class="cd-qualify__cell">
        <p class="cd-qualify__label">Ownership</p>
        <p class="cd-qualify__value" data-field="wcOwnership">{{wcOwnership}}</p>
      </div>
    </div>
    <div class="cd-qualify__divider" aria-hidden="true"></div>
    <div class="cd-qualify__col cd-qualify__col--right">
      <h3 class="cd-qualify__colTitle" data-field="efTitle">{{efTitle}}</h3>
      <p class="cd-qualify__colSub" data-field="efSub">{{efSub}}</p>
      <div class="cd-qualify__cell">
        <p class="cd-qualify__label">Credit Score</p>
        <p class="cd-qualify__value" data-field="efCredit">{{efCredit}}</p>
      </div>
      <div class="cd-qualify__cell">
        <p class="cd-qualify__label">Time in Business</p>
        <p class="cd-qualify__value" data-field="efTime">{{efTime}}</p>
      </div>
      <div class="cd-qualify__cell">
        <p class="cd-qualify__label">Revenue</p>
        <p class="cd-qualify__value" data-field="efRevenue">{{efRevenue}}</p>
      </div>
      <div class="cd-qualify__cell">
        <p class="cd-qualify__label">Is US Citizenship Required?</p>
        <p class="cd-qualify__value" data-field="efCitizen">{{efCitizen}}</p>
      </div>
      <div class="cd-qualify__cell">
        <p class="cd-qualify__label">Ownership</p>
        <p class="cd-qualify__value" data-field="efOwnership">{{efOwnership}}</p>
      </div>
    </div>
  </div>
</div>
`.trim();

const compareBlock = {
  id: 'sec-2-compare',
  type: 'html-render' as const,
  width: 'full' as const,
  html: COMPARE_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea',
      default: "Borrowing for your business used to be overwhelming. Cardiff makes it better by simplifying the application and getting you funded in minutes — not days or weeks. Here's what we look for, side by side, depending on which loan type fits your business." },
    { name: 'wcTitle', label: 'Working Capital — title', type: 'text', default: 'Working Capital' },
    { name: 'wcSub', label: 'Working Capital — subtitle', type: 'textarea',
      default: "For day-to-day cash flow, payroll, marketing, expansion, and seasonal swings. Revenue-driven approval." },
    { name: 'wcCredit', label: 'Working Capital — Credit Score', type: 'textarea',
      default: 'Personal credit scores aren’t as important as other commercial factors. A good rule: if your score is over 500, you’re in the clear.' },
    { name: 'wcTime', label: 'Working Capital — Time in Business', type: 'textarea',
      default: 'We look for at least 1 year of time in business.' },
    { name: 'wcRevenue', label: 'Working Capital — Revenue', type: 'textarea',
      default: '$20,000/month or $240,000 in annual sales, with a minimum of three deposits per month.' },
    { name: 'wcCitizen', label: 'Working Capital — Citizenship', type: 'textarea',
      default: 'US citizenship isn’t required. Cardiff only requires that the business owner be a legal resident.' },
    { name: 'wcOwnership', label: 'Working Capital — Ownership', type: 'textarea',
      default: 'Any owner can execute the contract regardless of their ownership percentage.' },
    { name: 'efTitle', label: 'Equipment Financing — title', type: 'text', default: 'Equipment Financing' },
    { name: 'efSub', label: 'Equipment Financing — subtitle', type: 'textarea',
      default: 'For trucks, machinery, kitchen gear, and other hard assets you can’t live without. Credit-driven approval.' },
    { name: 'efCredit', label: 'Equipment Financing — Credit Score', type: 'textarea',
      default: 'Equipment loans require a 600 credit score or better. Keep in mind equipment loans are credit-based, not revenue-based.' },
    { name: 'efTime', label: 'Equipment Financing — Time in Business', type: 'textarea',
      default: 'Start-ups welcome. Looking for more than $100K and better rates? You’ll need more than two years in business.' },
    { name: 'efRevenue', label: 'Equipment Financing — Revenue', type: 'textarea',
      default: 'Unlike working capital, revenue isn’t a big factor for equipment loans. With a strong credit score and 2+ years in business, you’re likely approved.' },
    { name: 'efCitizen', label: 'Equipment Financing — Citizenship', type: 'textarea',
      default: 'US citizenship isn’t required. Cardiff only requires that the business owner be a legal resident.' },
    { name: 'efOwnership', label: 'Equipment Financing — Ownership', type: 'textarea',
      default: '51% ownership will need to sign on behalf of the company. Personal Guarantees are required for businesses with fewer than ten owners. Corp-Only approvals are available for widely-held corporations.' },
  ],
  values: {
    intro: "Borrowing for your business used to be overwhelming. Cardiff makes it better by simplifying the application and getting you funded in minutes — not days or weeks. Here’s what we look for, side by side, depending on which loan type fits your business.",
    wcTitle: 'Working Capital',
    wcSub: 'For day-to-day cash flow, payroll, marketing, expansion, and seasonal swings. Revenue-driven approval.',
    wcCredit: 'Personal credit scores aren’t as important as other commercial factors. A good rule: if your score is over 500, you’re in the clear.',
    wcTime: 'We look for at least 1 year of time in business.',
    wcRevenue: '$20,000/month or $240,000 in annual sales, with a minimum of three deposits per month.',
    wcCitizen: 'US citizenship isn’t required. Cardiff only requires that the business owner be a legal resident.',
    wcOwnership: 'Any owner can execute the contract regardless of their ownership percentage.',
    efTitle: 'Equipment Financing',
    efSub: 'For trucks, machinery, kitchen gear, and other hard assets you can’t live without. Credit-driven approval.',
    efCredit: 'Equipment loans require a 600 credit score or better. Keep in mind equipment loans are credit-based, not revenue-based.',
    efTime: 'Start-ups welcome. Looking for more than $100K and better rates? You’ll need more than two years in business.',
    efRevenue: 'Unlike working capital, revenue isn’t a big factor for equipment loans. With a strong credit score and 2+ years in business, you’re likely approved.',
    efCitizen: 'US citizenship isn’t required. Cardiff only requires that the business owner be a legal resident.',
    efOwnership: '51% ownership will need to sign on behalf of the company. Personal Guarantees are required for businesses with fewer than ten owners. Corp-Only approvals are available for widely-held corporations.',
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
  const sec2Idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID);
  if (sec2Idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const sec2 = parsed.blocks[sec2Idx];
  if (sec2.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec2.type}); aborting`);
    process.exit(1);
  }
  // Widen the section so the two-column compare has room (was 880px).
  sec2.maxWidth = '1140px';
  // Replace all 23 sub-blocks with one html-render compare block plus a header.
  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-2-title',
    order: 1,
    level: 2,
    content: 'What we look for',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.15',
      margin: '0 0 14px 0',
      textAlign: 'center',
      textTransform: 'uppercase',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-2-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec2.blocks = [headerBlock, dividerBlock, { ...compareBlock, order: 3 }];
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: replaced sec-2 (23 sub-blocks) with side-by-side compare html-render.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
