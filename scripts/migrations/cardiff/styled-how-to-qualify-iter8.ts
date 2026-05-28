/**
 * How to Qualify page (post id 804) — iteration 8.
 *
 * Iters 1-7 styled hero, sec-1 (trust pillars), sec-2 (compare grid),
 * sec-3 (how-it-works steps), sec-4 (right-lender card), sec-faq
 * (accordion), and the final dark-blue CTA band. A real qualifier-funnel
 * gap remains: nowhere on the page do we tell the applicant *what to
 * have ready before clicking Apply*. The accordion answers "do I
 * qualify?", but the visitor who answers "yes" then bounces because
 * gathering bank statements / EIN / driver's license feels unbounded.
 *
 * Fix: insert a new `sec-docs` section between `sec-3` (how the
 * application works) and `sec-4-right-lender-iter3`. Same brand-aligned
 * icon-card grid pattern as styled-equipment-leasing-iter3.ts, but
 * driven by `data-repeat="docs"` so the doc list is fully editable in
 * the visual editor without touching the html shell. Four cards: ID,
 * Bank statements, Business info (EIN/formation), Equipment quote
 * (conditional — only for equipment financing files).
 *
 * Idempotent: detects the `sec-docs` section by id and rewrites it in
 * place; re-running just refreshes html/values and re-numbers orders
 * 1..N so the final CTA stays last.
 *
 * Run: bunx tsx scripts/migrations/cardiff/styled-how-to-qualify-iter8.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 804;
  const DOCS_SECTION_ID = 'sec-docs';
  const DOCS_RENDER_ID = 'sec-docs-grid-iter8';
  const ANCHOR_PREV_ID = 'sec-3';
  const FINAL_CTA_ID = 'final-cta-band';

  const DOCS_HTML = `
<style>
  .cd-htq-docs { max-width: 1140px; margin: 0 auto; }
  .cd-htq-docs__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 720px; margin: 0 auto 40px auto; }
  .cd-htq-docs__intro strong { color: #1c3370; }
  .cd-htq-docs__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-htq-docs__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 30px 24px 28px 24px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; align-items: flex-start; }
  .cd-htq-docs__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-htq-docs__icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-htq-docs__card:nth-child(2) .cd-htq-docs__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-htq-docs__card:nth-child(3) .cd-htq-docs__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-htq-docs__card:nth-child(4) .cd-htq-docs__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.34); }
  .cd-htq-docs__icon .material-icons { font-size: 28px; }
  .cd-htq-docs__cardTitle { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0 0 8px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-htq-docs__cardDesc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.6; color: #525f7f; margin: 0; }
  .cd-htq-docs__note { margin: 36px auto 0 auto; max-width: 820px; text-align: center; padding: 22px 28px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(90,201,111,0.08) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-htq-docs__noteText { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #25418b; margin: 0; font-weight: 500; }
  .cd-htq-docs__noteText .material-icons { color: #5ac96f; font-size: 18px; vertical-align: -3px; margin-right: 6px; }
  @media (max-width: 980px) {
    .cd-htq-docs__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-htq-docs__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-htq-docs__card { padding: 24px 20px; }
    .cd-htq-docs__note { padding: 18px 18px; }
  }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<div class="cd-htq-docs">
  <p class="cd-htq-docs__intro" data-field="intro">{{intro}}</p>
  <div class="cd-htq-docs__grid" data-repeat="docs">
    <div class="cd-htq-docs__card">
      <div class="cd-htq-docs__icon"><span class="material-icons" data-field="icon">{{docs.icon}}</span></div>
      <h3 class="cd-htq-docs__cardTitle" data-field="title">{{docs.title}}</h3>
      <p class="cd-htq-docs__cardDesc" data-field="desc">{{docs.desc}}</p>
    </div>
  </div>
  <div class="cd-htq-docs__note">
    <p class="cd-htq-docs__noteText"><span class="material-icons">lock</span><span data-field="note">{{note}}</span></p>
  </div>
</div>
`.trim();

  const DOCS_DEFAULTS = {
    intro:
      "Gathering paperwork upfront keeps your application moving. Most Cardiff files clear underwriting with just these four items — and only the last is unique to equipment financing.",
    docs: [
      {
        icon: 'badge',
        title: 'Government-issued ID',
        desc: "A driver's license or passport for each owner signing the application. Used for identity verification only.",
      },
      {
        icon: 'account_balance',
        title: '3 months of bank statements',
        desc: "Recent business checking statements so underwriting can verify revenue, deposits, and cash-flow rhythm.",
      },
      {
        icon: 'description',
        title: 'Business info & EIN',
        desc: "Legal business name, formation date, entity type, and Employer Identification Number. No tax returns required for most files.",
      },
      {
        icon: 'receipt_long',
        title: 'Equipment quote (if applicable)',
        desc: "For equipment financing only: a written quote or invoice from the seller showing make, model, year, and total price.",
      },
    ],
    note:
      "Your information stays private. Cardiff uses bank-level encryption and never sells applicant data — your soft-pull pre-qualification does not affect your credit score.",
  };

  const docsRender = {
    id: DOCS_RENDER_ID,
    type: 'html-render' as const,
    width: 'full' as const,
    order: 3,
    html: DOCS_HTML,
    fields: [
      { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: DOCS_DEFAULTS.intro },
      {
        name: 'docs',
        label: 'Documents (repeating)',
        type: 'repeater',
        itemFields: [
          { name: 'icon', label: 'Material icon name', type: 'text' },
          { name: 'title', label: 'Title', type: 'text' },
          { name: 'desc', label: 'Description', type: 'textarea' },
        ],
        default: DOCS_DEFAULTS.docs,
      },
      { name: 'note', label: 'Trust note', type: 'textarea', default: DOCS_DEFAULTS.note },
    ],
    values: { ...DOCS_DEFAULTS },
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-docs-title-iter8',
    order: 1,
    level: 2,
    content: "What you'll need to apply",
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
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
    id: 'sec-docs-div-iter8',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  const docsSection = {
    type: 'section' as const,
    id: DOCS_SECTION_ID,
    order: 0, // renumbered below
    maxWidth: '1200px',
    style: {
      backgroundColor: '#ffffff',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [headerBlock, dividerBlock, docsRender],
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

  // Idempotency: drop any prior docs section.
  parsed.blocks = parsed.blocks.filter((b: { id?: string }) => b?.id !== DOCS_SECTION_ID);

  // Anchor on sec-3 (how-it-works). Insert directly after it.
  const anchorIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === ANCHOR_PREV_ID,
  );
  if (anchorIdx === -1) {
    console.error(
      `Post ${POST_ID}: anchor block id=${ANCHOR_PREV_ID} not found; aborting`,
    );
    process.exit(1);
  }

  parsed.blocks.splice(anchorIdx + 1, 0, docsSection);

  // Re-number block.order 1..N so the renderer's sort is deterministic.
  parsed.blocks.forEach((b: { order?: number }, i: number) => {
    b.order = i + 1;
  });

  // Sanity: final CTA must remain last.
  const lastBlock = parsed.blocks[parsed.blocks.length - 1];
  if (lastBlock?.id !== FINAL_CTA_ID) {
    console.warn(
      `WARN: last block is ${lastBlock?.id}, expected ${FINAL_CTA_ID} — review order.`,
    );
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: inserted styled "What you'll need to apply" docs grid (id=${DOCS_SECTION_ID}, ${DOCS_DEFAULTS.docs.length} cards) between ${ANCHOR_PREV_ID} and sec-4.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
