/**
 * Iter 9 (MCA, post 824): Restyle sec-9 "How MCA Loans Work at Cardiff" —
 * currently only a centered H2 + orange divider with NO body content. The
 * source page describes a simple 4-step process (apply -> approve -> fund
 * -> repay-from-sales); the port shows nothing.
 *
 * Replaces sec-9 sub-blocks with:
 *   1. Centered H2 + orange underline
 *   2. Lead intro paragraph
 *   3. html-render: 4-up numbered process-step icon-card grid
 *      (data-repeat="steps")
 *   4. Closing accent strip with summary line
 *
 * Brand palette only — #1c3370 / #25418b deep blue, #ef6632 orange,
 * #5ac96f green, #ffb798 peach. Raleway titles + Open Sans body.
 * Material Icons (no emojis).
 *
 * Idempotent: re-running rewrites sec-9 sub-blocks.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 824;
const TARGET_BLOCK_ID = 'sec-9';

const STEPS_HTML = `
<style>
  .cd-mca-how { max-width: 1140px; margin: 0 auto; }
  .cd-mca-how__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-mca-how__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 30px 24px 26px 24px; box-shadow: 0 12px 30px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-mca-how__card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(28,51,112,0.12); }
  .cd-mca-how__step { position: absolute; top: -14px; right: 18px; min-width: 36px; height: 28px; padding: 0 10px; border-radius: 14px; background: #1c3370; color: #fff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; font-weight: 800; letter-spacing: 0.04em; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 14px rgba(28,51,112,0.22); }
  .cd-mca-how__card:nth-child(2) .cd-mca-how__step { background: #ef6632; box-shadow: 0 6px 14px rgba(239,102,50,0.28); }
  .cd-mca-how__card:nth-child(3) .cd-mca-how__step { background: #5ac96f; box-shadow: 0 6px 14px rgba(58,168,86,0.28); }
  .cd-mca-how__card:nth-child(4) .cd-mca-how__step { background: #25418b; box-shadow: 0 6px 14px rgba(37,65,139,0.28); }
  .cd-mca-how__icon { width: 54px; height: 54px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-mca-how__card:nth-child(2) .cd-mca-how__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-mca-how__card:nth-child(3) .cd-mca-how__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-mca-how__card:nth-child(4) .cd-mca-how__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.32); }
  .cd-mca-how__icon .material-icons { font-size: 28px; }
  .cd-mca-how__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.28; }
  .cd-mca-how__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  .cd-mca-how__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 26px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-mca-how__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-mca-how__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-mca-how__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-mca-how__card { padding: 26px 22px; }
    .cd-mca-how__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-mca-how">
  <div class="cd-mca-how__grid">
    <div class="cd-mca-how__card" data-repeat="steps">
      <span class="cd-mca-how__step" data-field="label">{{steps.label}}</span>
      <div class="cd-mca-how__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
      <h3 class="cd-mca-how__card-title" data-field="title">{{steps.title}}</h3>
      <p class="cd-mca-how__card-desc" data-field="desc">{{steps.desc}}</p>
    </div>
  </div>
  <div class="cd-mca-how__closer">
    <p class="cd-mca-how__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const STEPS_DEFAULTS = {
  steps: [
    {
      label: 'STEP 1',
      icon: 'edit_note',
      title: 'Apply Online',
      desc: 'Complete a short application and share a few months of recent business bank statements so we can size an advance that fits your revenue.',
    },
    {
      label: 'STEP 2',
      icon: 'fact_check',
      title: 'Get a Same-Day Decision',
      desc: 'Our team reviews your application and revenue picture quickly — most businesses receive an approval and offer the same day they apply.',
    },
    {
      label: 'STEP 3',
      icon: 'account_balance_wallet',
      title: 'Receive Your Funds',
      desc: 'Once you accept the offer and sign your agreement, the advance is wired directly to your business bank account — often within 24 hours.',
    },
    {
      label: 'STEP 4',
      icon: 'show_chart',
      title: 'Repay from Daily Sales',
      desc: 'Repayment flexes with your business. A small, agreed-upon percentage of daily card sales is collected automatically until the advance is paid off.',
    },
  ],
  closer:
    'Because repayment scales with your sales, an MCA from Cardiff keeps cash flow predictable through busy and slow seasons alike.',
};

const stepsBlock = {
  id: 'sec-9-steps',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: STEPS_HTML,
  fields: [
    {
      name: 'steps',
      label: 'How-it-works steps',
      type: 'array',
      itemFields: [
        { name: 'label', label: 'Step label (e.g. STEP 1)', type: 'text' },
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
      default: STEPS_DEFAULTS.steps,
    },
    {
      name: 'closer',
      label: 'Closing summary',
      type: 'textarea',
      default: STEPS_DEFAULTS.closer,
    },
  ],
  values: { ...STEPS_DEFAULTS },
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

  // Widen so the 4-col step grid breathes; soft blue band to distinguish it.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-9-title',
    order: 1,
    level: 2,
    content: 'How MCA Loans Work at Cardiff',
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
    id: 'sec-9-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 24px auto;border-radius:2px"></div>' +
      '<p style="text-align:center;color:#525f7f;font-family:\'Open Sans\',-apple-system,BlinkMacSystemFont,sans-serif;font-size:1.0625rem;line-height:1.75;max-width:760px;margin:0 auto 48px auto">From application to funding, Cardiff keeps the merchant cash advance process simple, fast, and transparent — so you can focus on running your business.</p>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, stepsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-9 -> styled 4-step "How MCA Loans Work" process grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
