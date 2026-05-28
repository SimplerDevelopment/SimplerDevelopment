/**
 * How to Qualify page (post id 804) — iteration 10.
 *
 * Iters 1-9 styled hero, sec-1 (trust pillars), sec-2 (compare grid),
 * sec-3 (process steps), sec-docs (docs grid), sec-4-right-lender,
 * sec-faq (accordion), sec-pitfalls (decline reasons), and the final
 * CTA band. A side-by-side screenshot vs cardiff.co/how-to-qualify
 * exposes the single biggest remaining gap: the page never surfaces
 * Cardiff's quantitative social proof (Cardiff's own site uses two
 * separate stats bands — "$12 Billion+ funded / 5-minute approvals /
 * same-day funds / 21 years" near the top AND "5.99% / $82,000 avg /
 * 39-month average term / 84% renewal" mid-page). On a qualifier-funnel
 * page these "borrowers-like-you" numbers are the strongest conversion
 * lever — they convert the visitor's "do I qualify?" question into the
 * stronger "people like me get approved here" feeling that drives the
 * Check Eligibility click.
 *
 * Fix: insert a new `sec-stats` section between the hero (top block)
 * and `sec-1` (What to Expect). Deep-blue brand band — same recipe as
 * styled-trucking-iter12.ts — but instead of process steps, the cards
 * hold one BIG number + label + sub-line each. Four stats:
 *   - $12 Billion+ funded (history/credibility)
 *   - 21 Years (longevity)
 *   - Under 24 hours (funding speed)
 *   - 500 minimum FICO (the qualifier-specific signal: low bar)
 *
 * Sits high on the page (right after hero), where it answers the
 * qualifier-page visitor's silent first question — "is Cardiff actually
 * a real lender that would say yes to me?" — before they read a single
 * eligibility rule.
 *
 * Driven by `data-repeat="stats"` so the four stats are editable in the
 * visual editor without touching the html shell.
 *
 * Idempotent: detects the `sec-stats` section by id and rewrites it in
 * place; re-running just refreshes html/values and re-numbers top-level
 * orders 1..N so the final CTA stays last.
 *
 * Brand palette only: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798.
 * Raleway + Open Sans. Material Icons (no emojis).
 *
 * Run: bunx tsx scripts/migrations/cardiff/styled-how-to-qualify-iter10.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 804;
  const STATS_SECTION_ID = 'sec-stats';
  const STATS_RENDER_ID = 'sec-stats-grid-iter10';
  const ANCHOR_PREV_ID = 'hero-how-to-qualify-iter2';
  const FINAL_CTA_ID = 'final-cta-band';

  const STATS_HTML = `
<style>
  .cd-htq-stats { max-width: 1200px; margin: 0 auto; }
  .cd-htq-stats__intro { text-align: center; color: rgba(255,255,255,0.86); font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 44px auto; }
  .cd-htq-stats__intro strong { color: #ffb798; font-weight: 700; }
  .cd-htq-stats__row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px; }
  .cd-htq-stats__col { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,183,152,0.22); border-radius: 16px; padding: 32px 22px 30px 22px; text-align: center; backdrop-filter: blur(6px); transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; position: relative; overflow: hidden; }
  .cd-htq-stats__col::before { content: ''; position: absolute; inset: 0; background: linear-gradient(160deg, rgba(255,183,152,0.0) 0%, rgba(255,183,152,0.05) 100%); pointer-events: none; }
  .cd-htq-stats__col:hover { transform: translateY(-4px); box-shadow: 0 20px 44px rgba(0,0,0,0.30); border-color: rgba(255,183,152,0.45); }
  .cd-htq-stats__icon { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 14px; background: linear-gradient(135deg, rgba(239,102,50,0.18) 0%, rgba(255,183,152,0.28) 100%); margin: 0 0 16px 0; }
  .cd-htq-stats__icon .material-icons { color: #ffb798; font-size: 28px; }
  .cd-htq-stats__value { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 2.6rem; color: #ffffff; letter-spacing: -0.025em; line-height: 1.05; margin: 0 0 6px 0; position: relative; }
  .cd-htq-stats__label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.78rem; color: #ffb798; letter-spacing: 0.18em; text-transform: uppercase; margin: 0 0 10px 0; position: relative; }
  .cd-htq-stats__sub { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; line-height: 1.55; color: rgba(255,255,255,0.78); margin: 0; position: relative; }
  .cd-htq-stats__closer { margin: 44px auto 0 auto; max-width: 760px; text-align: center; }
  .cd-htq-stats__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.7; color: rgba(255,255,255,0.82); margin: 0; font-weight: 500; }
  .cd-htq-stats__closer-text .material-icons { color: #5ac96f; font-size: 18px; vertical-align: -3px; margin-right: 6px; }
  @media (max-width: 1000px) {
    .cd-htq-stats__row { grid-template-columns: repeat(2, 1fr); gap: 18px; }
    .cd-htq-stats__value { font-size: 2.3rem; }
  }
  @media (max-width: 560px) {
    .cd-htq-stats__row { grid-template-columns: 1fr; }
    .cd-htq-stats__col { padding: 26px 22px; }
    .cd-htq-stats__value { font-size: 2.2rem; }
  }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<div class="cd-htq-stats">
  <p class="cd-htq-stats__intro" data-field="intro">{{intro}}</p>
  <div class="cd-htq-stats__row">
    <div class="cd-htq-stats__col" data-repeat="stats">
      <div class="cd-htq-stats__icon"><span class="material-icons" data-field="icon">{{stats.icon}}</span></div>
      <div class="cd-htq-stats__value" data-field="value">{{stats.value}}</div>
      <div class="cd-htq-stats__label" data-field="label">{{stats.label}}</div>
      <p class="cd-htq-stats__sub" data-field="sub">{{stats.sub}}</p>
    </div>
  </div>
  <div class="cd-htq-stats__closer">
    <p class="cd-htq-stats__closer-text"><span class="material-icons">verified</span><span data-field="closer">{{closer}}</span></p>
  </div>
</div>
`.trim();

  const STATS_DEFAULTS = {
    intro:
      "You are not looking at a startup. Cardiff has been funding real small businesses since 2004 — and the numbers below are the same ones our underwriters use every day to greenlight files like yours.",
    stats: [
      {
        icon: 'savings',
        value: '$12B+',
        label: 'Funded since 2004',
        sub: 'Twelve billion dollars deployed to U.S. small businesses across 50 states and every major industry.',
      },
      {
        icon: 'workspace_premium',
        value: '21 Years',
        label: 'Lending track record',
        sub: 'Two decades of underwriting through every credit cycle — your application is read by a real human, not a startup script.',
      },
      {
        icon: 'bolt',
        value: '< 24 hrs',
        label: 'Funded after approval',
        sub: 'Most approved files are funded the same business day. No wire delays, no closing-table theatre.',
      },
      {
        icon: 'verified_user',
        value: '500',
        label: 'Minimum FICO',
        sub: 'We work with thin credit and revenue-based files. A score under 600 is not an automatic no — it is a conversation.',
      },
    ],
    closer:
      "If you can show three months of business deposits and a credit score of 500 or better, you almost certainly qualify for at least one Cardiff product. Keep scrolling to see the exact thresholds.",
  };

  const statsRender = {
    id: STATS_RENDER_ID,
    type: 'html-render' as const,
    width: 'full' as const,
    order: 3,
    html: STATS_HTML,
    fields: [
      { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: STATS_DEFAULTS.intro },
      {
        name: 'stats',
        label: 'Stats (repeating)',
        type: 'repeater',
        itemFields: [
          { name: 'icon', label: 'Material icon name', type: 'text' },
          { name: 'value', label: 'Big number / value', type: 'text' },
          { name: 'label', label: 'Label (small caps)', type: 'text' },
          { name: 'sub', label: 'Sub line', type: 'textarea' },
        ],
        default: STATS_DEFAULTS.stats,
      },
      { name: 'closer', label: 'Closing line', type: 'textarea', default: STATS_DEFAULTS.closer },
    ],
    values: { ...STATS_DEFAULTS },
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-stats-title-iter10',
    order: 1,
    level: 2,
    content: 'A real lender with the receipts',
    alignment: 'center' as const,
    style: {
      color: '#ffffff',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '2.5rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.15',
      margin: '0 auto 14px auto',
      maxWidth: '900px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-stats-div-iter10',
    order: 2,
    content:
      '<div style="width:64px;height:3px;background:#ffb798;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  const statsSection = {
    type: 'section' as const,
    id: STATS_SECTION_ID,
    order: 0, // renumbered below
    maxWidth: '1280px',
    style: {
      backgroundColor: '#1c3370',
      backgroundImage:
        'linear-gradient(135deg, #1c3370 0%, #25418b 55%, #1c3370 100%)',
      paddingTop: '88px',
      paddingBottom: '88px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [headerBlock, dividerBlock, statsRender],
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

  // Idempotency: drop any prior stats section.
  parsed.blocks = parsed.blocks.filter(
    (b: { id?: string }) => b?.id !== STATS_SECTION_ID,
  );

  // Anchor on the hero. Insert directly after it so it sits between
  // the hero and sec-1 (What to Expect When You Apply).
  const anchorIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === ANCHOR_PREV_ID,
  );
  if (anchorIdx === -1) {
    console.error(
      `Post ${POST_ID}: anchor block id=${ANCHOR_PREV_ID} not found; aborting`,
    );
    process.exit(1);
  }

  parsed.blocks.splice(anchorIdx + 1, 0, statsSection);

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
    `Updated post ${POST_ID}: inserted deep-blue stats band (id=${STATS_SECTION_ID}, ${STATS_DEFAULTS.stats.length} stats) between ${ANCHOR_PREV_ID} and sec-1.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
