/**
 * Iter 4 — business-loans (post 800).
 *
 * sec-7 currently mashes two ideas into one section:
 *   (a) "When to Consider Small Business Loans" — heading + intro + card-grid
 *       (already styled in earlier iters).
 *   (b) An embedded "How to Get Started" sub-flow rendered as 3 H3 + paragraph
 *       pairs with zero visual structure (Apply Online → Get Approved →
 *       Receive Funds).
 *
 * This iteration leaves (a) intact and replaces (b) with a single html-render
 * numbered-step grid (CSS counters for the 01/02/03 badges) matching the
 * pattern from scripts/migrations/cardiff/restyle-home-process.ts.
 *
 * Idempotent: trims sec-7.blocks to the "When to Consider" portion every run,
 * then re-appends the styled "How to Get Started" header + step grid + closer.
 * Safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 800;
const TARGET_BLOCK_ID = 'sec-7';

// IDs we own and will rewrite on every run.
const STEPS_HEADER_ID = 'sec-7-steps-title';
const STEPS_DIVIDER_ID = 'sec-7-steps-div';
const STEPS_INTRO_ID = 'sec-7-steps-intro';
const STEPS_GRID_ID = 'sec-7-steps-grid';
const STEPS_CLOSER_ID = 'sec-7-steps-closer';

// Anything that follows the card-grid in sec-7 is the legacy unstyled
// "How to Get Started" block stack we are replacing.
const KEEP_THROUGH_ID = 'sec-7-grid-4';

const STEPS_HTML = `<div class="cd-bl-steps">
  <div class="cd-bl-steps__row">
    <div class="cd-bl-steps__col" data-repeat="steps">
      <div class="cd-bl-steps__num"></div>
      <div class="cd-bl-steps__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
      <div class="cd-bl-steps__title" data-field="title">{{steps.title}}</div>
      <div class="cd-bl-steps__desc" data-field="description">{{steps.description}}</div>
    </div>
  </div>
  <style>
    .cd-bl-steps { max-width: 1100px; margin: 8px auto 0 auto; counter-reset: cd-bl-step; }
    .cd-bl-steps__row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 28px; position: relative; }
    .cd-bl-steps__row::before { content: ''; position: absolute; top: 96px; left: 12%; right: 12%; height: 2px; background: linear-gradient(to right, transparent, #e8edf6 12%, #e8edf6 88%, transparent); z-index: 0; }
    .cd-bl-steps__col { background: #fff; border-radius: 14px; padding: 30px 26px; text-align: center; position: relative; z-index: 1; border: 1px solid #eef1f8; box-shadow: 0 6px 18px rgba(37,65,139,0.06); counter-increment: cd-bl-step; transition: transform .25s ease, box-shadow .25s ease; }
    .cd-bl-steps__col:hover { transform: translateY(-4px); box-shadow: 0 14px 32px rgba(28,51,112,0.10); }
    .cd-bl-steps__num { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.78rem; color: #ef6632; letter-spacing: 0.24em; margin: 0 0 14px 0; }
    .cd-bl-steps__num::before { content: counter(cd-bl-step, decimal-leading-zero); }
    .cd-bl-steps__icon { display: inline-flex; align-items: center; justify-content: center; width: 62px; height: 62px; border-radius: 16px; background: linear-gradient(135deg, rgba(239,102,50,0.12) 0%, rgba(239,102,50,0.06) 100%); margin: 0 auto 16px auto; }
    .cd-bl-steps__icon .material-icons { color: #ef6632; font-size: 30px; }
    .cd-bl-steps__title { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 1.15rem; color: #1c3370; letter-spacing: -0.005em; line-height: 1.25; margin: 0 0 10px 0; }
    .cd-bl-steps__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.65; color: #525f7f; margin: 0; }
    @media (max-width: 900px) {
      .cd-bl-steps__row { grid-template-columns: 1fr; gap: 18px; }
      .cd-bl-steps__row::before { display: none; }
      .cd-bl-steps__col { padding: 26px 22px; }
    }
  </style>
</div>`;

const STEPS_DEFAULTS = {
  steps: [
    {
      title: 'Apply Online',
      description: "Cardiff's loan application is quick and easy to fill out online. Share basic information about yourself and your business, and connect financial accounts securely through Plaid.",
      icon: 'edit_note',
    },
    {
      title: 'Get Approved',
      description: "No waiting weeks or even days. We'll let you know in minutes whether you qualify, and if approved, we'll send a financing offer tailored to your business.",
      icon: 'task_alt',
    },
    {
      title: 'Receive Funds',
      description: 'We don’t make you wait for capital, either. In many cases, you will receive funds the same day they are approved.',
      icon: 'account_balance',
    },
  ],
};

const stepsGridBlock = {
  id: STEPS_GRID_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 8,
  html: STEPS_HTML,
  fields: [
    {
      name: 'steps',
      label: 'Get-started steps',
      type: 'array' as const,
      itemFields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'icon', type: 'text', label: 'Material icon name' },
      ],
    },
  ],
  values: { ...STEPS_DEFAULTS },
};

const stepsHeaderBlock = {
  type: 'heading' as const,
  id: STEPS_HEADER_ID,
  order: 6,
  level: 2,
  content: 'How to Get Started',
  alignment: 'center' as const,
  style: {
    color: '#1c3370',
    fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: '2rem',
    fontWeight: '800',
    letterSpacing: '-0.015em',
    lineHeight: '1.2',
    margin: '56px 0 14px 0',
    textAlign: 'center' as const,
  },
};

const stepsDividerBlock = {
  type: 'text' as const,
  id: STEPS_DIVIDER_ID,
  order: 7,
  content:
    '<div style="width:48px;height:3px;background:#ef6632;margin:0 auto;border-radius:2px"></div>',
  style: { textAlign: 'center' as const, margin: '0 auto 28px auto' },
};

const stepsIntroBlock = {
  type: 'text' as const,
  id: STEPS_INTRO_ID,
  order: 7.5,
  content:
    'Applying for a small business loan with Cardiff is a streamlined, fully digital process. Here’s what to expect:',
  style: {
    color: '#525f7f',
    fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: '1.0625rem',
    lineHeight: '1.75',
    margin: '0 auto 12px auto',
    maxWidth: '760px',
    textAlign: 'center' as const,
  },
};

const stepsCloserBlock = {
  type: 'text' as const,
  id: STEPS_CLOSER_ID,
  order: 9,
  content:
    'Whether you’re seeking traditional small business loans or flexible invoice financing for small businesses, Cardiff makes the process fast and intuitive, not intimidating.',
  style: {
    color: '#25418b',
    fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: '1.0625rem',
    lineHeight: '1.7',
    margin: '40px auto 0 auto',
    maxWidth: '820px',
    textAlign: 'center' as const,
    fontWeight: '500',
  },
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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }
  if (!Array.isArray(sec.blocks)) {
    console.error(`Post ${POST_ID}: ${TARGET_BLOCK_ID}.blocks is not an array; aborting`);
    process.exit(1);
  }

  // Widen so the 3-col steps grid breathes; keep the wash background.
  sec.maxWidth = '1180px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  // Idempotent trim: keep everything up to and including the "When to
  // Consider" card-grid, drop legacy unstyled H3/P sub-blocks, and re-append
  // our owned steps blocks.
  const keepIdx = sec.blocks.findIndex((b: { id?: string }) => b?.id === KEEP_THROUGH_ID);
  if (keepIdx === -1) {
    console.error(`Post ${POST_ID}: expected sec-7 child id=${KEEP_THROUGH_ID}; aborting`);
    process.exit(1);
  }
  sec.blocks = sec.blocks.slice(0, keepIdx + 1);

  sec.blocks.push(stepsHeaderBlock);
  sec.blocks.push(stepsDividerBlock);
  sec.blocks.push(stepsIntroBlock);
  sec.blocks.push(stepsGridBlock);
  sec.blocks.push(stepsCloserBlock);

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-7 -> styled "How to Get Started" 3-step numbered grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
