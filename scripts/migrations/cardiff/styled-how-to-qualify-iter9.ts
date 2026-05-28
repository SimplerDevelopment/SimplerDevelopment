/**
 * How to Qualify page (post id 804) — iteration 9.
 *
 * Iters 1-8 covered hero, what-to-expect pillars, what-we-look-for compare
 * grid, how-the-application-works steps, what-you'll-need docs grid,
 * "is Cardiff the right lender" industries list, qualification FAQ
 * accordion, and the final CTA band.
 *
 * Remaining qualifier-funnel gap: the page never tells applicants the
 * common *self-fixable* reasons files get declined or delayed. The FAQ
 * answers "do I qualify?" in principle, but it does not warn the
 * borderline applicant about the small, fixable issues that cost a real
 * percentage of files (recent NSFs, sub-500 score, missing EIN, < 4
 * months in business). Surfacing these upfront raises pre-qual conversion
 * AND reduces wasted underwriter cycles on files that can be fixed and
 * re-submitted next month.
 *
 * Fix: insert a new `sec-pitfalls` section between `sec-faq` and the
 * `final-cta-band`. Same brand-aligned icon-card grid pattern as
 * styled-equipment-leasing-iter3.ts and the iter8 docs grid, but driven
 * by `data-repeat="pitfalls"` so the list is fully editable in the visual
 * editor without touching the html shell. Four cards: NSFs, low score,
 * thin history, missing business basics — each paired with a concrete
 * "how to fix it before re-applying" line.
 *
 * Idempotent: detects the `sec-pitfalls` section by id and rewrites it
 * in place; re-running just refreshes html/values and re-numbers orders
 * 1..N so the final CTA stays last.
 *
 * Run: bunx tsx scripts/migrations/cardiff/styled-how-to-qualify-iter9.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 804;
  const PITFALLS_SECTION_ID = 'sec-pitfalls';
  const PITFALLS_RENDER_ID = 'sec-pitfalls-grid-iter9';
  const ANCHOR_PREV_ID = 'sec-faq';
  const FINAL_CTA_ID = 'final-cta-band';

  const PITFALLS_HTML = `
<style>
  .cd-htq-pit { max-width: 1140px; margin: 0 auto; }
  .cd-htq-pit__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 740px; margin: 0 auto 40px auto; }
  .cd-htq-pit__intro strong { color: #1c3370; }
  .cd-htq-pit__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-htq-pit__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 28px 24px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-htq-pit__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-htq-pit__icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); color: #fff; box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-htq-pit__card:nth-child(2) .cd-htq-pit__icon { background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-htq-pit__card:nth-child(3) .cd-htq-pit__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.34); }
  .cd-htq-pit__card:nth-child(4) .cd-htq-pit__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-htq-pit__icon .material-icons { font-size: 28px; }
  .cd-htq-pit__cardTitle { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0 0 8px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-htq-pit__cardDesc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.6; color: #525f7f; margin: 0 0 14px 0; }
  .cd-htq-pit__fix { margin-top: auto; padding: 12px 14px; background: rgba(90,201,111,0.10); border-left: 3px solid #5ac96f; border-radius: 6px; }
  .cd-htq-pit__fixLabel { font-family: 'Raleway', sans-serif; font-size: 0.6875rem; font-weight: 800; color: #3aa856; letter-spacing: 0.06em; text-transform: uppercase; display: block; margin: 0 0 4px 0; }
  .cd-htq-pit__fixText { font-family: 'Open Sans', sans-serif; font-size: 0.875rem; line-height: 1.55; color: #25418b; margin: 0; }
  .cd-htq-pit__note { margin: 36px auto 0 auto; max-width: 820px; text-align: center; padding: 22px 28px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-htq-pit__noteText { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #25418b; margin: 0; font-weight: 500; }
  .cd-htq-pit__noteText .material-icons { color: #ef6632; font-size: 18px; vertical-align: -3px; margin-right: 6px; }
  @media (max-width: 980px) {
    .cd-htq-pit__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-htq-pit__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-htq-pit__card { padding: 24px 20px; }
    .cd-htq-pit__note { padding: 18px 18px; }
  }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<div class="cd-htq-pit">
  <p class="cd-htq-pit__intro" data-field="intro">{{intro}}</p>
  <div class="cd-htq-pit__grid" data-repeat="pitfalls">
    <div class="cd-htq-pit__card">
      <div class="cd-htq-pit__icon"><span class="material-icons" data-field="icon">{{pitfalls.icon}}</span></div>
      <h3 class="cd-htq-pit__cardTitle" data-field="title">{{pitfalls.title}}</h3>
      <p class="cd-htq-pit__cardDesc" data-field="desc">{{pitfalls.desc}}</p>
      <div class="cd-htq-pit__fix">
        <span class="cd-htq-pit__fixLabel">How to fix it</span>
        <p class="cd-htq-pit__fixText" data-field="fix">{{pitfalls.fix}}</p>
      </div>
    </div>
  </div>
  <div class="cd-htq-pit__note">
    <p class="cd-htq-pit__noteText"><span class="material-icons">refresh</span><span data-field="note">{{note}}</span></p>
  </div>
</div>
`.trim();

  const PITFALLS_DEFAULTS = {
    intro:
      "Most declined files have one of a handful of fixable issues. Spend 10 minutes clearing these before you apply — or wait a month and re-apply from a stronger position.",
    pitfalls: [
      {
        icon: 'warning_amber',
        title: 'Recent overdrafts or NSFs',
        desc: 'More than a couple of non-sufficient-funds or overdraft events in the last 90 days signals cash-flow stress and is the most common reason files stall.',
        fix: 'Wait 30–60 days of clean statements before applying, or open a dedicated business checking account and route deposits there.',
      },
      {
        icon: 'credit_score',
        title: 'Credit score below 500',
        desc: 'Cardiff works with thin credit, but a personal FICO under 500 narrows your product options dramatically and almost always triggers a manual review.',
        fix: 'Pay down revolving balances under 30% utilization, dispute any reporting errors, and re-pull your score in 30 days before applying.',
      },
      {
        icon: 'event_busy',
        title: 'Less than 4 months in business',
        desc: 'Cardiff requires at least 4 months of operating history so underwriting can verify a real revenue rhythm — not a launch spike.',
        fix: 'If you’re close, wait until you have 4 full months of deposits in your business bank account, then apply with all 4 statements.',
      },
      {
        icon: 'badge',
        title: 'Missing or mismatched business info',
        desc: 'A legal name that doesn’t match your EIN letter, an outdated address, or a missing entity-formation date will pause underwriting until corrected.',
        fix: 'Pull your EIN confirmation (SS-4) and Secretary of State filing first; apply with the exact legal name and formation date shown there.',
      },
    ],
    note:
      "Already applied and got a soft decline? Most of these issues clear in 30–60 days. Re-apply when you do — Cardiff does not penalize repeat applications and your prior file speeds re-underwriting.",
  };

  const pitfallsRender = {
    id: PITFALLS_RENDER_ID,
    type: 'html-render' as const,
    width: 'full' as const,
    order: 3,
    html: PITFALLS_HTML,
    fields: [
      { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: PITFALLS_DEFAULTS.intro },
      {
        name: 'pitfalls',
        label: 'Pitfalls (repeating)',
        type: 'repeater',
        itemFields: [
          { name: 'icon', label: 'Material icon name', type: 'text' },
          { name: 'title', label: 'Title', type: 'text' },
          { name: 'desc', label: 'Description', type: 'textarea' },
          { name: 'fix', label: 'How to fix it', type: 'textarea' },
        ],
        default: PITFALLS_DEFAULTS.pitfalls,
      },
      { name: 'note', label: 'Closing note', type: 'textarea', default: PITFALLS_DEFAULTS.note },
    ],
    values: { ...PITFALLS_DEFAULTS },
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-pitfalls-title-iter9',
    order: 1,
    level: 2,
    content: 'Common reasons applications get declined',
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
    id: 'sec-pitfalls-div-iter9',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  const pitfallsSection = {
    type: 'section' as const,
    id: PITFALLS_SECTION_ID,
    order: 0, // renumbered below
    maxWidth: '1200px',
    style: {
      backgroundColor: '#f6f9fc',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [headerBlock, dividerBlock, pitfallsRender],
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

  // Idempotency: drop any prior pitfalls section.
  parsed.blocks = parsed.blocks.filter(
    (b: { id?: string }) => b?.id !== PITFALLS_SECTION_ID,
  );

  // Anchor on sec-faq. Insert directly after it (so it sits between FAQ
  // and the final CTA band).
  const anchorIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === ANCHOR_PREV_ID,
  );
  if (anchorIdx === -1) {
    console.error(
      `Post ${POST_ID}: anchor block id=${ANCHOR_PREV_ID} not found; aborting`,
    );
    process.exit(1);
  }

  parsed.blocks.splice(anchorIdx + 1, 0, pitfallsSection);

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
    `Updated post ${POST_ID}: inserted styled "Common reasons applications get declined" pitfalls grid (id=${PITFALLS_SECTION_ID}, ${PITFALLS_DEFAULTS.pitfalls.length} cards) between ${ANCHOR_PREV_ID} and ${FINAL_CTA_ID}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
