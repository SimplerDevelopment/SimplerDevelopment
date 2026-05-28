/**
 * Iter 7: Restyle the "How to Qualify for a Revenue-Based Business Loan"
 * section on post 828 (revenue-based). This is sec-8 — currently a header,
 * a lead paragraph, then a generic 2-col `card-grid` of four qualifying
 * criteria (Minimum Monthly Revenue, Time in Business, Financial Docs,
 * No Collateral) rendered with the default Card component (flat
 * check_circle icons, no visual hierarchy, no brand accent, no responsive
 * polish).
 *
 * It's the single biggest remaining gap on the page: every other
 * content-band (sec-1/3/5/6/7) has been ported to a cohesive html-render
 * slab; sec-8 sticks out as bare primitives.
 *
 * Fix: replace sec-8's sub-blocks with:
 *   1. Centered H2 + orange underline (same pattern as iter3)
 *   2. A single html-render block carrying a 4-up icon-card grid on a
 *      light-blue gradient backdrop. Each card has a circular brand-blue
 *      icon chip (Material Icons), title, and copy. Repeats via
 *      `data-repeat="criteria"` so the portal editor can add/remove
 *      criteria without touching markup, with `{{criteria.icon}}` /
 *      `{{criteria.title}}` / `{{criteria.desc}}` placeholders inside.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-8-qualify` and rewrites it; safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 828;
  const TARGET_BLOCK_ID = 'sec-8';

  const QUALIFY_HTML = `
<style>
  .cd-rbl-qual { max-width: 1140px; margin: 0 auto; }
  .cd-rbl-qual__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-rbl-qual__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
  .cd-rbl-qual__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; gap: 20px; align-items: flex-start; }
  .cd-rbl-qual__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-rbl-qual__icon { flex: 0 0 auto; width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-rbl-qual__card:nth-child(2) .cd-rbl-qual__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-rbl-qual__card:nth-child(3) .cd-rbl-qual__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-rbl-qual__card:nth-child(4) .cd-rbl-qual__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.36); }
  .cd-rbl-qual__icon .material-icons { font-size: 30px; }
  .cd-rbl-qual__body { flex: 1 1 auto; min-width: 0; }
  .cd-rbl-qual__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-rbl-qual__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-rbl-qual__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-rbl-qual__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 760px) {
    .cd-rbl-qual__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-rbl-qual__card { padding: 26px 22px; flex-direction: column; gap: 14px; }
    .cd-rbl-qual__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-rbl-qual">
  <p class="cd-rbl-qual__intro" data-field="intro">{{intro}}</p>
  <div class="cd-rbl-qual__grid">
    <div class="cd-rbl-qual__card" data-repeat="criteria">
      <div class="cd-rbl-qual__icon"><span class="material-icons" data-field="icon">{{criteria.icon}}</span></div>
      <div class="cd-rbl-qual__body">
        <h3 class="cd-rbl-qual__card-title" data-field="title">{{criteria.title}}</h3>
        <p class="cd-rbl-qual__card-desc" data-field="desc">{{criteria.desc}}</p>
      </div>
    </div>
  </div>
  <div class="cd-rbl-qual__closer">
    <p class="cd-rbl-qual__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

  const QUALIFY_DEFAULTS = {
    intro:
      'To qualify for a revenue-based business loan with Cardiff, you need to meet a few basic criteria:',
    criteria: [
      {
        icon: 'attach_money',
        title: 'Minimum Monthly Revenue',
        desc: 'Generally, we want to see a minimum monthly revenue of $20,000 per month.',
      },
      {
        icon: 'schedule',
        title: 'Time in Business',
        desc: 'If your company has been operational for at least six months, and you can demonstrate stability and a consistent revenue stream, you may be a strong candidate.',
      },
      {
        icon: 'description',
        title: 'Financial Documentation',
        desc: "You will need to provide recent business bank statements by connecting your account through Plaid to show your business’s cash flow and growth potential.",
      },
      {
        icon: 'lock_open',
        title: 'No Collateral',
        desc: 'We don’t require collateral for revenue-based loans, making them a more accessible option for businesses with limited assets.',
      },
    ],
    closer:
      'Meet these criteria? You’re likely a strong candidate — most applicants receive a same-day decision, and funding can land as fast as the same business day.',
  } as const;

  const qualifyBlock = {
    id: 'sec-8-qualify',
    type: 'html-render' as const,
    width: 'full' as const,
    order: 3,
    html: QUALIFY_HTML,
    fields: [
      { name: 'intro', label: 'Intro paragraph', type: 'textarea' as const, default: QUALIFY_DEFAULTS.intro },
      {
        name: 'criteria',
        label: 'Qualifying criteria',
        type: 'array' as const,
        itemFields: [
          { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'check_circle' },
          { name: 'title', label: 'Title', type: 'text' as const },
          { name: 'desc', label: 'Description', type: 'textarea' as const },
        ],
      },
      { name: 'closer', label: 'Closing summary', type: 'textarea' as const, default: QUALIFY_DEFAULTS.closer },
    ],
    values: { ...QUALIFY_DEFAULTS },
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

  // Widen so the 2-col card grid breathes; soft blue-tinted backdrop sets
  // this band apart from the dense neighbors above/below.
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
    id: 'sec-8-title',
    order: 1,
    level: 2,
    content: 'How to Qualify for a Revenue-Based Business Loan',
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
    id: 'sec-8-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, qualifyBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-8 -> styled 4-card "How to Qualify" icon-card grid.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
