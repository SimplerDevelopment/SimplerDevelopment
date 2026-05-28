/**
 * Iter 17 — Restyle the "Cardiff is cash for your business" intro section
 * (post 793, block id=intro). Currently a plain centered overline + H2 +
 * orange rule + body line, sitting on white between the rich trust-badges
 * card row (above) and the styled process band (below). That makes it the
 * weakest band on the page.
 *
 * Replace sec.blocks with a single full-width html-render block that:
 *   - Keeps the overline + headline + orange rule
 *   - Adds a confident lede paragraph
 *   - Adds a 3-up "what makes Cardiff different" mini-card strip below
 *     (icon chip + short title + one-line proof point) using the brand
 *     palette and Material Icons. Uses data-repeat="point" iteration
 *     against an array `points` so the strip is editable in the portal.
 *
 * Idempotent — overwrites intro.blocks every run, no duplication.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const TARGET_BLOCK_ID = 'intro';

const INTRO_HTML = `
<style>
  .cd-intro { max-width: 1120px; margin: 0 auto; text-align: center; }
  .cd-intro__overline { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; color: #ef6632; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.32em; text-transform: uppercase; margin: 0 0 20px 0; }
  .cd-intro__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; color: #25418b; font-size: 2.75rem; font-weight: 800; letter-spacing: -0.018em; line-height: 1.14; margin: 0 auto 24px auto; max-width: 820px; }
  .cd-intro__title em { color: #ef6632; font-style: normal; }
  .cd-intro__rule { width: 60px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 28px auto; }
  .cd-intro__lede { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #25418b; font-size: 1.1875rem; font-weight: 600; line-height: 1.6; margin: 0 auto 16px auto; max-width: 760px; letter-spacing: -0.003em; }
  .cd-intro__body { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #525f7f; font-size: 1.0625rem; line-height: 1.75; margin: 0 auto; max-width: 720px; }
  .cd-intro__points { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 52px auto 0 auto; max-width: 1080px; text-align: left; }
  .cd-intro__point { display: flex; align-items: flex-start; gap: 16px; padding: 22px 22px; background: #ffffff; border: 1px solid #e8edf6; border-radius: 14px; box-shadow: 0 10px 28px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; }
  .cd-intro__point:hover { transform: translateY(-3px); box-shadow: 0 16px 36px rgba(28,51,112,0.10); }
  .cd-intro__icon { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; box-shadow: 0 6px 14px rgba(28,51,112,0.22); }
  .cd-intro__point:nth-child(2) .cd-intro__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 6px 14px rgba(239,102,50,0.28); }
  .cd-intro__point:nth-child(3) .cd-intro__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 6px 14px rgba(58,168,86,0.28); }
  .cd-intro__icon .material-icons { font-size: 22px; }
  .cd-intro__point-body { min-width: 0; }
  .cd-intro__point-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; color: #1c3370; font-size: 1.0625rem; font-weight: 800; letter-spacing: -0.005em; margin: 0 0 6px 0; line-height: 1.25; }
  .cd-intro__point-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #525f7f; font-size: 0.9375rem; line-height: 1.55; margin: 0; }
  @media (max-width: 920px) {
    .cd-intro__title { font-size: 2.25rem; }
    .cd-intro__points { grid-template-columns: 1fr; gap: 14px; max-width: 560px; }
  }
  @media (max-width: 560px) {
    .cd-intro__title { font-size: 1.875rem; }
    .cd-intro__lede { font-size: 1.0625rem; }
    .cd-intro__body { font-size: 1rem; }
  }
</style>
<div class="cd-intro">
  <p class="cd-intro__overline" data-field="overline">{{overline}}</p>
  <h2 class="cd-intro__title" data-field="title">{{title}}</h2>
  <div class="cd-intro__rule"></div>
  <p class="cd-intro__lede" data-field="lede">{{lede}}</p>
  <p class="cd-intro__body" data-field="body">{{body}}</p>
  <div class="cd-intro__points">
    <div class="cd-intro__point" data-repeat="point">
      <div class="cd-intro__icon"><span class="material-icons">{{point.icon}}</span></div>
      <div class="cd-intro__point-body">
        <h3 class="cd-intro__point-title">{{point.title}}</h3>
        <p class="cd-intro__point-desc">{{point.desc}}</p>
      </div>
    </div>
  </div>
</div>
`.trim();

const INTRO_DEFAULTS = {
  overline: 'A SMARTER WAY TO BORROW',
  title: 'Cardiff is cash for your business, on your terms.',
  lede: "Owning a business is hard enough. We make it easy to get the capital you need to keep moving.",
  body: "No mountain of paperwork. No weeks of waiting. Just transparent funding built around how your business actually earns — so you can hire, restock, upgrade, or seize the next opportunity without missing a beat.",
  points: [
    { icon: 'description', title: 'One short form', desc: 'A two-minute application, not a stack of bank documents.' },
    { icon: 'verified', title: 'Honest terms', desc: 'Clear rates and repayment up front — never hidden in the fine print.' },
    { icon: 'support_agent', title: 'A real person', desc: 'A dedicated funding specialist on your side, from first call to wire.' },
  ],
} as const;

const introBlock = {
  id: 'intro-render',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: INTRO_HTML,
  fields: [
    { name: 'overline', label: 'Overline', type: 'text', default: INTRO_DEFAULTS.overline },
    { name: 'title', label: 'Headline', type: 'text', default: INTRO_DEFAULTS.title },
    { name: 'lede', label: 'Lede paragraph', type: 'textarea', default: INTRO_DEFAULTS.lede },
    { name: 'body', label: 'Body paragraph', type: 'textarea', default: INTRO_DEFAULTS.body },
    {
      name: 'points',
      label: 'Differentiator points',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
      default: INTRO_DEFAULTS.points,
    },
  ],
  values: {
    overline: INTRO_DEFAULTS.overline,
    title: INTRO_DEFAULTS.title,
    lede: INTRO_DEFAULTS.lede,
    body: INTRO_DEFAULTS.body,
    points: INTRO_DEFAULTS.points.map((p) => ({ ...p })),
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

  // Widen so the 3-point strip fits comfortably.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#ffffff',
    paddingTop: '88px',
    paddingBottom: '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  sec.blocks = [introBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: intro -> headline + lede + 3-point differentiator strip.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
