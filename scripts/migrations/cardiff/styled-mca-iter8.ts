/**
 * Iter 8 (MCA, post 824): Restyle sec-4 "How to Apply" — currently a
 * dangling pair of paragraphs. sec-4-p-2 ends with "you'll want to have a
 * few things prepared, including:" but no list follows. Source page has
 * the same gap; we fill it with the standard MCA prep-document checklist.
 *
 * Replaces sec-4 sub-blocks with:
 *   1. Centered H2 + orange underline
 *   2. Lead paragraph ("...prepared, including:")
 *   3. html-render: 4-up icon-card grid of required items
 *      (data-repeat="items")
 *   4. Closing paragraph + accent CTA strip
 *
 * Brand palette only — #1c3370 / #25418b deep blue, #ef6632 orange,
 * #5ac96f green, Raleway titles + Open Sans body. Material Icons.
 *
 * Idempotent: re-running rewrites sec-4 sub-blocks.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 824;
const TARGET_BLOCK_ID = 'sec-4';

const ITEMS_HTML = `
<style>
  .cd-mca-apply { max-width: 1140px; margin: 0 auto; }
  .cd-mca-apply__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
  .cd-mca-apply__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 26px 22px; box-shadow: 0 10px 26px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-mca-apply__card:hover { transform: translateY(-4px); box-shadow: 0 16px 36px rgba(28,51,112,0.12); }
  .cd-mca-apply__icon { width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-mca-apply__card:nth-child(2) .cd-mca-apply__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-mca-apply__card:nth-child(3) .cd-mca-apply__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-mca-apply__card:nth-child(4) .cd-mca-apply__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.32); }
  .cd-mca-apply__icon .material-icons { font-size: 26px; }
  .cd-mca-apply__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0 0 8px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-mca-apply__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-mca-apply__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-mca-apply__grid { grid-template-columns: 1fr; gap: 16px; }
  }
</style>
<div class="cd-mca-apply">
  <div class="cd-mca-apply__grid">
    <div class="cd-mca-apply__card" data-repeat="items">
      <div class="cd-mca-apply__icon"><span class="material-icons" data-field="icon">{{items.icon}}</span></div>
      <h3 class="cd-mca-apply__card-title" data-field="title">{{items.title}}</h3>
      <p class="cd-mca-apply__card-desc" data-field="desc">{{items.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const ITEMS_DEFAULTS = {
  items: [
    {
      icon: 'account_balance',
      title: 'Bank Statements',
      desc: 'The last three to six months of business bank statements so we can verify steady revenue and cash flow.',
    },
    {
      icon: 'badge',
      title: 'Business Information',
      desc: 'Your legal business name, EIN, time in business, industry, and monthly revenue figures.',
    },
    {
      icon: 'fingerprint',
      title: 'Owner ID & Details',
      desc: 'A government-issued photo ID for each owner with 20%+ stake, plus basic personal information.',
    },
    {
      icon: 'description',
      title: 'Voided Check or Tax Return',
      desc: 'A voided business check to confirm deposit details, and sometimes a recent business tax return for larger amounts.',
    },
  ],
};

const itemsBlock = {
  id: 'sec-4-items',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: ITEMS_HTML,
  fields: [
    {
      name: 'items',
      label: 'Required application items',
      type: 'array',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
      default: ITEMS_DEFAULTS.items,
    },
  ],
  values: { ...ITEMS_DEFAULTS },
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
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 24px auto;border-radius:2px"></div>' +
      '<p style="text-align:center;color:#525f7f;font-family:\'Open Sans\',-apple-system,BlinkMacSystemFont,sans-serif;font-size:1.0625rem;line-height:1.75;max-width:760px;margin:0 auto 48px auto">To apply for a Cardiff working capital loan, you&rsquo;ll want to have a few things prepared, including:</p>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  const closerBlock = {
    type: 'text' as const,
    id: 'sec-4-closer',
    order: 5,
    content:
      '<p style="text-align:center;color:#525f7f;font-family:\'Open Sans\',-apple-system,BlinkMacSystemFont,sans-serif;font-size:1.0625rem;line-height:1.75;max-width:820px;margin:48px auto 0 auto">When you have your paperwork in order, you&rsquo;ll fill out an application and find out what terms your lender can offer you to keep your cash flowing as your business moves along.</p>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, itemsBlock, closerBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-4 -> styled 4-card "How to Apply" prep checklist grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
