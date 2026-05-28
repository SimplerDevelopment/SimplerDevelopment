/**
 * Iter 5: Restyle sec-5 "Term Loan vs. Other Funding Options" on post 830
 * (short-term-working-capital-loans). The port currently shows the H2 + a
 * "Here’s a quick breakdown:" lead-in but NO breakdown — leaving the reader
 * staring at an empty promise. We replace sec-5's children with:
 *   1. Centered H2 + orange underline (consistent with iter2/iter3 pattern)
 *   2. Short intro paragraph
 *   3. A single html-render block carrying a 4-row comparison strip rendered
 *      via `data-repeat="options"` and `{{options.field}}` placeholders.
 *      Each row: funding option name, "best for" line, repayment, speed, and
 *      a fit-rating chip — all brand palette only.
 *   4. A closing paragraph reinforcing why a term loan is the leading pick.
 *
 * Idempotent: detects an existing `sec-5-compare` html-render block and
 * rewrites in place; otherwise replaces sec-5 children wholesale.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 830;
const TARGET_BLOCK_ID = 'sec-5';
const COMPARE_BLOCK_ID = 'sec-5-compare';

const COMPARE_HTML = `
<style>
  .cd-st-cmp { max-width: 1160px; margin: 0 auto; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-st-cmp__row { display: grid; grid-template-columns: minmax(220px, 280px) 1fr auto; gap: 32px; align-items: center; padding: 26px 28px; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; box-shadow: 0 8px 22px rgba(28,51,112,0.05); margin: 0 0 18px 0; transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; }
  .cd-st-cmp__row:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(28,51,112,0.10); border-color: #d6e0ee; }
  .cd-st-cmp__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-st-cmp__name-sub { display: block; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; font-weight: 600; color: #ef6632; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 6px 0; }
  .cd-st-cmp__meta { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 28px; }
  .cd-st-cmp__meta-item { display: flex; flex-direction: column; gap: 2px; }
  .cd-st-cmp__meta-label { font-size: 0.75rem; font-weight: 700; color: #8a96ad; text-transform: uppercase; letter-spacing: 0.08em; }
  .cd-st-cmp__meta-value { font-size: 0.9375rem; font-weight: 600; color: #25418b; line-height: 1.45; }
  .cd-st-cmp__chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; }
  .cd-st-cmp__chip .material-icons { font-size: 16px; }
  .cd-st-cmp__chip--best { background: rgba(90,201,111,0.14); color: #2e8645; }
  .cd-st-cmp__chip--good { background: rgba(28,51,112,0.10); color: #1c3370; }
  .cd-st-cmp__chip--fair { background: rgba(255,183,152,0.30); color: #c4521e; }
  .cd-st-cmp__chip--avoid { background: rgba(239,102,50,0.14); color: #d8501e; }
  @media (max-width: 880px) {
    .cd-st-cmp__row { grid-template-columns: 1fr; gap: 18px; padding: 22px 22px; }
    .cd-st-cmp__meta { grid-template-columns: 1fr; gap: 10px; }
    .cd-st-cmp__chip { align-self: flex-start; }
  }
</style>
<div class="cd-st-cmp">
  <div class="cd-st-cmp__row" data-repeat="options">
    <div>
      <span class="cd-st-cmp__name-sub" data-field="kicker">{{options.kicker}}</span>
      <h3 class="cd-st-cmp__name" data-field="name">{{options.name}}</h3>
    </div>
    <div class="cd-st-cmp__meta">
      <div class="cd-st-cmp__meta-item">
        <span class="cd-st-cmp__meta-label">Repayment</span>
        <span class="cd-st-cmp__meta-value" data-field="repayment">{{options.repayment}}</span>
      </div>
      <div class="cd-st-cmp__meta-item">
        <span class="cd-st-cmp__meta-label">Speed</span>
        <span class="cd-st-cmp__meta-value" data-field="speed">{{options.speed}}</span>
      </div>
      <div class="cd-st-cmp__meta-item" style="grid-column: 1 / -1;">
        <span class="cd-st-cmp__meta-label">Best for</span>
        <span class="cd-st-cmp__meta-value" data-field="bestFor">{{options.bestFor}}</span>
      </div>
    </div>
    <span class="cd-st-cmp__chip cd-st-cmp__chip--{{options.fitClass}}">
      <span class="material-icons" data-field="fitIcon">{{options.fitIcon}}</span>
      <span data-field="fitLabel">{{options.fitLabel}}</span>
    </span>
  </div>
</div>
`.trim();

const COMPARE_DEFAULTS = {
  options: [
    {
      kicker: 'Cardiff pick',
      name: 'Short-Term Term Loan',
      repayment: 'Fixed daily or weekly payments over a defined term',
      speed: 'Same-day decision, often same-day funding',
      bestFor: 'Owners who want predictable repayment and a clear payoff date for a specific growth or cash-flow need.',
      fitClass: 'best',
      fitIcon: 'check_circle',
      fitLabel: 'Leading choice',
    },
    {
      kicker: 'Alternative',
      name: 'Business Line of Credit',
      repayment: 'Revolving draws, interest only on what you use',
      speed: 'Days to set up, then on-demand access',
      bestFor: 'Ongoing, unpredictable working-capital needs where you may draw and repay repeatedly.',
      fitClass: 'good',
      fitIcon: 'thumb_up',
      fitLabel: 'Solid fit',
    },
    {
      kicker: 'Alternative',
      name: 'Merchant Cash Advance',
      repayment: 'A percentage of daily card sales until repaid',
      speed: 'Very fast, but variable total cost',
      bestFor: 'High-volume card-processing businesses comfortable with a fluctuating effective rate.',
      fitClass: 'fair',
      fitIcon: 'priority_high',
      fitLabel: 'Use with caution',
    },
    {
      kicker: 'Alternative',
      name: 'Long-Term Bank Loan',
      repayment: 'Monthly payments over several years',
      speed: 'Weeks of underwriting, heavy paperwork',
      bestFor: 'Large, long-horizon investments where a multi-year amortization is appropriate.',
      fitClass: 'avoid',
      fitIcon: 'schedule',
      fitLabel: 'Too slow for urgency',
    },
  ],
};

const compareBlock = {
  id: COMPARE_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: COMPARE_HTML,
  fields: [
    {
      name: 'options',
      label: 'Funding option rows',
      type: 'array' as const,
      itemFields: [
        { name: 'kicker', label: 'Eyebrow label', type: 'text' as const },
        { name: 'name', label: 'Funding option name', type: 'text' as const },
        { name: 'repayment', label: 'Repayment summary', type: 'text' as const },
        { name: 'speed', label: 'Speed summary', type: 'text' as const },
        { name: 'bestFor', label: 'Best for', type: 'textarea' as const },
        { name: 'fitClass', label: 'Fit chip variant (best | good | fair | avoid)', type: 'text' as const },
        { name: 'fitIcon', label: 'Material icon for fit chip', type: 'text' as const },
        { name: 'fitLabel', label: 'Fit chip label', type: 'text' as const },
      ],
    },
  ],
  values: { ...COMPARE_DEFAULTS },
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

  // Preserve any existing compare-block values if a previous iter5 already ran.
  const existing = (sec.blocks || []).find((b: any) => b?.id === COMPARE_BLOCK_ID);
  if (existing && existing.values && Array.isArray(existing.values.options) && existing.values.options.length) {
    compareBlock.values = { options: existing.values.options };
  }

  // Widen so the comparison rows breathe; keep neutral white background to
  // contrast the surrounding light-blue bands.
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
    id: 'sec-5-title',
    order: 1,
    level: 2 as const,
    content: 'Term Loan vs. Other Funding Options',
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
    id: 'sec-5-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 28px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  const introBlock = {
    type: 'text' as const,
    id: 'sec-5-p-intro',
    order: 3,
    content: 'Wondering how a term loan compares to other common forms of financing? Here’s a quick breakdown:',
    style: {
      color: '#525f7f',
      fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '1.0625rem',
      lineHeight: '1.75',
      margin: '0 auto 36px auto',
      maxWidth: '760px',
      textAlign: 'center' as const,
    },
  };
  const closingBlock = {
    type: 'text' as const,
    id: 'sec-5-p-close',
    order: 5,
    content: 'If you value structured repayment and cost clarity, a short-term term loan is often the leading choice.',
    style: {
      color: '#25418b',
      fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '1.0625rem',
      lineHeight: '1.75',
      fontWeight: '500',
      margin: '32px auto 0 auto',
      maxWidth: '780px',
      textAlign: 'center' as const,
    },
  };

  sec.blocks = [headerBlock, dividerBlock, introBlock, compareBlock, closingBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-5 -> styled 4-row funding-options comparison. Children: ${sec.blocks.length}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
