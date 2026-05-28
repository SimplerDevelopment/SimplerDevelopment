/**
 * Iter 8: Restyle sec-10 on post 828 (revenue-based). The H2 currently
 * reads "Frequently Asked Questions" but the body holds two checklist
 * groups ("businesses that benefit" + "this loan is right for you if")
 * rendered as default card-grid primitives. The card text was also
 * mangled at import time (hyphens split "Service-based" → title "Service"
 * + desc "based businesses..." and "E-commerce" → "E" + "commerce ...").
 * It's the final bare gap on the page.
 *
 * Fix: rewrite the H2 to its true subject, replace the two card-grids
 * with a single html-render slab containing two `data-repeat` checklist
 * grids on the cohesive light-blue band, restoring the mangled copy.
 *
 * Idempotent: looks up sec-10 by id and rewrites its blocks; safe to
 * re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 828;
  const TARGET_BLOCK_ID = 'sec-10';

  const FIT_HTML = `
<style>
  .cd-rbl-fit { max-width: 1140px; margin: 0 auto; }
  .cd-rbl-fit__group { margin: 0 auto 40px auto; }
  .cd-rbl-fit__group:last-child { margin-bottom: 0; }
  .cd-rbl-fit__lead { text-align: center; color: #25418b; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 700; line-height: 1.4; max-width: 820px; margin: 0 auto 24px auto; letter-spacing: -0.005em; }
  .cd-rbl-fit__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .cd-rbl-fit__row { display: flex; gap: 14px; align-items: flex-start; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 10px; padding: 18px 20px; box-shadow: 0 6px 18px rgba(28,51,112,0.05); transition: transform .2s ease, box-shadow .2s ease; }
  .cd-rbl-fit__row:hover { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(28,51,112,0.1); }
  .cd-rbl-fit__check { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); color: #fff; box-shadow: 0 4px 10px rgba(58,168,86,0.28); }
  .cd-rbl-fit__check .material-icons { font-size: 18px; }
  .cd-rbl-fit__text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9875rem; line-height: 1.6; color: #525f7f; margin: 0; padding-top: 4px; }
  @media (max-width: 760px) {
    .cd-rbl-fit__grid { grid-template-columns: 1fr; gap: 12px; }
    .cd-rbl-fit__lead { font-size: 1.125rem; }
    .cd-rbl-fit__row { padding: 16px 18px; }
  }
</style>
<div class="cd-rbl-fit">
  <div class="cd-rbl-fit__group">
    <p class="cd-rbl-fit__lead" data-field="leadA">{{leadA}}</p>
    <div class="cd-rbl-fit__grid">
      <div class="cd-rbl-fit__row" data-repeat="industries">
        <div class="cd-rbl-fit__check"><span class="material-icons">check</span></div>
        <p class="cd-rbl-fit__text" data-field="text">{{industries.text}}</p>
      </div>
    </div>
  </div>
  <div class="cd-rbl-fit__group">
    <p class="cd-rbl-fit__lead" data-field="leadB">{{leadB}}</p>
    <div class="cd-rbl-fit__grid">
      <div class="cd-rbl-fit__row" data-repeat="signals">
        <div class="cd-rbl-fit__check"><span class="material-icons">check</span></div>
        <p class="cd-rbl-fit__text" data-field="text">{{signals.text}}</p>
      </div>
    </div>
  </div>
</div>
`.trim();

  const FIT_DEFAULTS = {
    leadA:
      'Revenue-based loans are ideal for covering cash flow gaps — businesses with fluctuating income streams often choose this type of financing:',
    industries: [
      { text: 'Retail businesses that experience high and low sales cycles' },
      { text: 'Restaurants that see a surge during the holiday season or special events' },
      { text: 'Service-based businesses with inconsistent revenue or project-based work' },
      { text: 'E-commerce companies with spikes in sales during holidays or product launches' },
    ],
    leadB: 'A revenue-based loan may be a good fit for you if:',
    signals: [
      { text: 'Your business experiences varying monthly sales or seasonal cash flow issues' },
      { text: 'You need fast access to capital with flexible repayment terms' },
      { text: 'You don’t have collateral to offer, but have a solid revenue stream' },
    ],
  } as const;

  const fitBlock = {
    id: 'sec-10-fit',
    type: 'html-render' as const,
    width: 'full' as const,
    order: 3,
    html: FIT_HTML,
    fields: [
      { name: 'leadA', label: 'Industries lead', type: 'textarea' as const, default: FIT_DEFAULTS.leadA },
      {
        name: 'industries',
        label: 'Industries that benefit',
        type: 'array' as const,
        itemFields: [{ name: 'text', label: 'Item', type: 'textarea' as const }],
      },
      { name: 'leadB', label: 'Fit-signals lead', type: 'textarea' as const, default: FIT_DEFAULTS.leadB },
      {
        name: 'signals',
        label: 'Fit signals',
        type: 'array' as const,
        itemFields: [{ name: 'text', label: 'Item', type: 'textarea' as const }],
      },
    ],
    values: { ...FIT_DEFAULTS },
  };

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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(
      `Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`,
    );
    process.exit(1);
  }

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
    id: 'sec-10-title',
    order: 1,
    level: 2,
    content: 'Is a Revenue-Based Loan Right for Your Business?',
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
    id: 'sec-10-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, fitBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-10 -> styled "Is a Revenue-Based Loan Right for Your Business?" checklist band.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
