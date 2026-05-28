/**
 * Iter 3 — Business Invoice Financing (post 798), sec-4
 * "How to Access Invoice Financing with Cardiff".
 *
 * Currently 4 bare H4 step titles in a vertical stack with NO descriptions
 * and no visual structure. Replace sec-4 body with:
 *   1. Centered H2 + orange underline (matches iter1 / iter2 pattern).
 *   2. A single html-render block carrying a 4-up horizontal numbered
 *      process card timeline (data-repeat="steps") with auto-incrementing
 *      "01/02/03/04" badges, brand-tinted icon chip, title, description.
 *
 * Template mirrors restyle-home-process.ts (the home-page process band)
 * scaled from 5 → 4 columns; uses `data-repeat="steps"` with `{{steps.field}}`
 * so authors can edit/add/remove steps without code.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632) accents — Material Icons, no emojis.
 *
 * Idempotent: re-running detects sec-4 and rewrites its children;
 * safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 798;
const TARGET_BLOCK_ID = 'sec-4';

const PROCESS_HTML = `<div class="cd-if-proc">
  <div class="cd-if-proc__row">
    <div class="cd-if-proc__col" data-repeat="steps">
      <div class="cd-if-proc__num"></div>
      <div class="cd-if-proc__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
      <div class="cd-if-proc__title" data-field="title">{{steps.title}}</div>
      <div class="cd-if-proc__desc" data-field="description">{{steps.description}}</div>
    </div>
  </div>
  <style>
    .cd-if-proc { max-width: 1140px; margin: 0 auto; counter-reset: cd-if-step; }
    .cd-if-proc__row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; position: relative; }
    .cd-if-proc__row::before { content: ''; position: absolute; top: 96px; left: 12%; right: 12%; height: 2px; background: linear-gradient(to right, transparent, #e8edf6 12%, #e8edf6 88%, transparent); z-index: 0; }
    .cd-if-proc__col { background: #fff; border-radius: 14px; padding: 28px 22px; text-align: center; position: relative; z-index: 1; border: 1px solid #e6ecf5; box-shadow: 0 12px 32px rgba(28,51,112,0.06); counter-increment: cd-if-step; transition: transform .25s ease, box-shadow .25s ease; }
    .cd-if-proc__col:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
    .cd-if-proc__num { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.74rem; color: #ef6632; letter-spacing: 0.22em; margin: 0 0 14px 0; }
    .cd-if-proc__num::before { content: counter(cd-if-step, decimal-leading-zero); }
    .cd-if-proc__icon { display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; border-radius: 16px; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); margin: 0 0 16px 0; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
    .cd-if-proc__col:nth-child(2) .cd-if-proc__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
    .cd-if-proc__col:nth-child(3) .cd-if-proc__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
    .cd-if-proc__col:nth-child(4) .cd-if-proc__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.22); }
    .cd-if-proc__icon .material-icons { color: #fff; font-size: 30px; }
    .cd-if-proc__title { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 1.0625rem; color: #1c3370; letter-spacing: -0.005em; line-height: 1.25; margin: 0 0 10px 0; }
    .cd-if-proc__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9rem; line-height: 1.6; color: #525f7f; margin: 0; }
    @media (max-width: 1024px) {
      .cd-if-proc__row { grid-template-columns: repeat(2, 1fr); }
      .cd-if-proc__row::before { display: none; }
    }
    @media (max-width: 600px) {
      .cd-if-proc__row { grid-template-columns: 1fr; gap: 18px; }
      .cd-if-proc__col { padding: 24px 20px; }
    }
  </style>
</div>`;

const STEPS = [
  {
    title: 'Quick Pre‑Qualification',
    description:
      'Submit a short online application with basic business details. Most applicants receive a pre-qualification decision within hours, with no impact to personal credit.',
    icon: 'assignment_turned_in',
  },
  {
    title: 'Invoice Verification and Funding',
    description:
      'Our team verifies your outstanding invoices and advances up to 100% of their value. Funds can hit your business account in as little as 24 hours after approval.',
    icon: 'receipt_long',
  },
  {
    title: 'Loan Repayment',
    description:
      'Repayment happens when your customer pays their invoice. Costs align with revenue, with all rates and fees disclosed upfront — no surprise charges.',
    icon: 'payments',
  },
  {
    title: 'Repeat as Needed',
    description:
      'Submit new invoices anytime. As your sales grow, your available funding grows with you, giving you a renewable, on-demand source of working capital.',
    icon: 'autorenew',
  },
];

const processBlock = {
  id: 'sec-4-process',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: PROCESS_HTML,
  fields: [
    {
      name: 'steps',
      label: 'Process steps',
      type: 'array',
      itemFields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'icon', type: 'text', label: 'Material icon name' },
      ],
    },
  ],
  values: { steps: STEPS },
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

  // Widen so the 4-col numbered timeline breathes.
  sec.maxWidth = '1200px';
  // White backdrop to contrast the f6f9fc neighbors.
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
    content: 'How to Access Invoice Financing with Cardiff',
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
    id: 'sec-4-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 44px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, processBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-4 -> styled 4-step numbered process timeline.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
