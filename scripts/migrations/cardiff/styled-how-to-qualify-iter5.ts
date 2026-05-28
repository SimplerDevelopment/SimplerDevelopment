/**
 * How to Qualify page (post id 804) — iteration 5.
 *
 * Iters 1-4 styled the comparison grid (sec-2), hero, right-lender card
 * (sec-4), and the final dark-blue CTA band. The single biggest remaining
 * unstyled section is `sec-3` — a centered H2 "Are You Ready to Apply?"
 * followed by one paragraph and an orange rule, with no visual chrome
 * and no CTAs. It also duplicates the headline used by the iter4 CTA
 * band that immediately follows on the page (after sec-4), so the page
 * currently shows the same "Are You Ready to Apply?" twice.
 *
 * Fix: repurpose sec-3 into a 3-step "How the Application Works" icon-card
 * grid that bridges sec-2 (what we look for) and sec-4 (find the right
 * lender) before the final CTA band lands. Same icon-card-grid pattern as
 * styled-equipment-leasing-iter3.ts, with a `data-repeat="steps"` strip
 * so the step count is editable in the visual editor without touching
 * the html shell. Brand palette only — deep blue, orange, green, peach.
 *
 * Idempotent: detects the `sec-3` section block (or the already-migrated
 * `sec-3-how-it-works-iter5` html-render block) and rewrites it in place.
 * Re-running just refreshes html/values.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 804;
  const TARGET_BLOCK_IDS = ['sec-3', 'sec-3-how-it-works-iter5'];
  const NEW_BLOCK_ID = 'sec-3-how-it-works-iter5';

  const HOW_HTML = `
<style>
  .cd-htq-how { max-width: 1140px; margin: 0 auto; }
  .cd-htq-how__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 720px; margin: 0 auto 48px auto; }
  .cd-htq-how__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-htq-how__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 36px 28px 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-htq-how__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-htq-how__step { position: absolute; top: -14px; left: 28px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.7rem; letter-spacing: 0.22em; text-transform: uppercase; color: #ffffff; background: #ef6632; padding: 6px 12px; border-radius: 999px; font-weight: 800; box-shadow: 0 6px 14px rgba(239,102,50,0.32); }
  .cd-htq-how__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 6px 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-htq-how__card:nth-child(2) .cd-htq-how__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-htq-how__card:nth-child(3) .cd-htq-how__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-htq-how__icon .material-icons { font-size: 30px; }
  .cd-htq-how__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-htq-how__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-htq-how__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-htq-how__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-htq-how__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-htq-how__grid { grid-template-columns: 1fr; gap: 22px; }
    .cd-htq-how__card { padding: 32px 22px 26px 22px; }
    .cd-htq-how__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-htq-how">
  <p class="cd-htq-how__intro" data-field="intro">{{intro}}</p>
  <div class="cd-htq-how__grid">
    <article class="cd-htq-how__card" data-repeat="steps">
      <span class="cd-htq-how__step" data-field="label">{{steps.label}}</span>
      <div class="cd-htq-how__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
      <h3 class="cd-htq-how__title" data-field="title">{{steps.title}}</h3>
      <p class="cd-htq-how__desc" data-field="desc">{{steps.desc}}</p>
    </article>
  </div>
  <div class="cd-htq-how__closer">
    <p class="cd-htq-how__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

  const HOW_DEFAULTS = {
    intro:
      'Whether you know how much you’d like to borrow or what equipment you’re looking to finance, applying with Cardiff is a simple three-step process. If you’ve got 60 seconds, we’ve got an answer.',
    steps: [
      {
        label: 'Step 1',
        icon: 'edit_note',
        title: 'Apply in 60 Seconds',
        desc: 'Fill out our short online application. No tax returns, no collateral, no fees to apply — just a few basics about your business so we can match you with the right product.',
      },
      {
        label: 'Step 2',
        icon: 'bolt',
        title: 'Get a Same-Day Decision',
        desc: 'A funding specialist reviews your application and gets back to you the same day with a tailored offer. You’ll see exact terms, repayment options, and what to expect next.',
      },
      {
        label: 'Step 3',
        icon: 'account_balance_wallet',
        title: 'Get Funded Fast',
        desc: 'Once you accept, funds can hit your account in as little as 24 hours. Use the capital to buy equipment, cover payroll, or seize a growth opportunity — your call.',
      },
    ],
    closer:
      'No collateral required. Up to $250,000. We work with credit scores starting at 500 and revenue-based options when credit history is thin.',
  } as const;

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-3-title-iter5',
    order: 1,
    level: 2,
    content: 'How the Application Works',
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
    id: 'sec-3-div-iter5',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  const howBlock = {
    id: NEW_BLOCK_ID,
    type: 'html-render' as const,
    width: 'full' as const,
    order: 3,
    html: HOW_HTML,
    fields: [
      { name: 'intro', label: 'Intro paragraph', type: 'textarea' as const, default: HOW_DEFAULTS.intro },
      {
        name: 'steps',
        label: 'Application steps',
        type: 'array' as const,
        itemFields: [
          { name: 'label', label: 'Step label (e.g. Step 1)', type: 'text' as const },
          { name: 'icon', label: 'Material icon name', type: 'text' as const },
          { name: 'title', label: 'Step title', type: 'text' as const },
          { name: 'desc', label: 'Step description', type: 'textarea' as const },
        ],
      },
      { name: 'closer', label: 'Closing summary', type: 'textarea' as const, default: HOW_DEFAULTS.closer },
    ],
    values: { ...HOW_DEFAULTS },
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

  const idx = parsed.blocks.findIndex(
    (b: { id?: string }) => b && TARGET_BLOCK_IDS.includes(b.id ?? ''),
  );
  if (idx === -1) {
    console.error(
      `Post ${POST_ID}: no block with id in ${JSON.stringify(TARGET_BLOCK_IDS)}; aborting`,
    );
    process.exit(1);
  }

  const existing = parsed.blocks[idx];
  const wasId = existing?.id;
  const order = typeof existing?.order === 'number' ? existing.order : idx + 1;

  // Rebuild as a styled section: title + rule + the data-repeat icon-card grid.
  parsed.blocks[idx] = {
    type: 'section' as const,
    id: 'sec-3',
    order,
    maxWidth: '1200px',
    style: {
      backgroundColor: '#f6f9fc',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [headerBlock, dividerBlock, howBlock],
  };

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced '${wasId}' (idx ${idx}) with styled 3-step "How the Application Works" section.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
