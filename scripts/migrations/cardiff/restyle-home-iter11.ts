/**
 * Iter 11: Restyle the "Alternative Business Lending With Cardiff" band on
 * the home page (post 793, block id `alt-lending`).
 *
 * Before: a thin centered single-paragraph block (only the FIRST of two
 * paragraphs on cardiff.co/) with an orange divider — feels truncated and
 * lacks any visual anchor. The neighbouring `products` and `designed`
 * bands have either a card grid or a 2-col composition, so this band reads
 * as a placeholder by comparison.
 *
 * After: a 2-column html-render composition that matches cardiff.co —
 *   • Left col: overline + H2 + orange underline + BOTH original paragraphs
 *     from cardiff.co (the "If you're exploring..." graf AND the "Cardiff
 *     specializes in fast, flexible financing..." graf the port dropped).
 *   • Right col: the actual cardiff.co illustration asset
 *     (alternative-business-lending.svg) in a soft tinted card frame so it
 *     reads as deliberate, not a stray clipart.
 * Stacks vertically below 820px, image first on mobile per cardiff.co
 * behaviour. Brand palette only — #1c3370 / #25418b / #ef6632 / #5ac96f,
 * Raleway display + Open Sans body. No emojis (Material Icons only if any
 * future iter wants a chip).
 *
 * Idempotent: rewrites sec.blocks of `alt-lending` and resets its style /
 * maxWidth on every run; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const TARGET_BLOCK_ID = 'alt-lending';

const ALT_HTML = `
<style>
  .cd-alt { display: grid; grid-template-columns: 1.15fr 1fr; gap: 64px; align-items: center; max-width: 1140px; margin: 0 auto; }
  .cd-alt__copy { min-width: 0; }
  .cd-alt__overline { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; color: #ef6632; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.32em; text-transform: uppercase; margin: 0 0 16px 0; }
  .cd-alt__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; color: #1c3370; font-size: 2.5rem; font-weight: 800; letter-spacing: -0.018em; line-height: 1.16; margin: 0 0 22px 0; }
  .cd-alt__rule { width: 60px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 0 26px 0; }
  .cd-alt__lede { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #25418b; font-size: 1.125rem; font-weight: 600; line-height: 1.6; margin: 0 0 18px 0; letter-spacing: -0.003em; }
  .cd-alt__body { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; color: #525f7f; font-size: 1rem; line-height: 1.75; margin: 0 0 18px 0; }
  .cd-alt__body:last-child { margin-bottom: 0; }
  .cd-alt__pills { display: flex; flex-wrap: wrap; gap: 10px; margin: 26px 0 0 0; }
  .cd-alt__pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: #f6f9fc; border: 1px solid #e6ecf5; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; font-weight: 600; color: #25418b; letter-spacing: 0.01em; }
  .cd-alt__pill .material-icons { font-size: 16px; color: #5ac96f; }
  .cd-alt__media { position: relative; display: flex; align-items: center; justify-content: center; padding: 36px; border-radius: 20px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 60%, rgba(90,201,111,0.06) 100%); border: 1px solid #e6ecf5; box-shadow: 0 16px 44px rgba(28,51,112,0.08); }
  .cd-alt__media::before { content: ''; position: absolute; top: -14px; right: -14px; width: 70px; height: 70px; border-radius: 18px; background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); opacity: 0.15; z-index: 0; }
  .cd-alt__media::after { content: ''; position: absolute; bottom: -14px; left: -14px; width: 50px; height: 50px; border-radius: 14px; background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); opacity: 0.15; z-index: 0; }
  .cd-alt__media img { position: relative; z-index: 1; width: 100%; max-width: 360px; height: auto; display: block; }
  @media (max-width: 980px) {
    .cd-alt { gap: 44px; }
    .cd-alt__title { font-size: 2.125rem; }
  }
  @media (max-width: 820px) {
    .cd-alt { grid-template-columns: 1fr; gap: 36px; }
    .cd-alt__media { order: -1; padding: 28px; }
    .cd-alt__media img { max-width: 280px; }
    .cd-alt__title { font-size: 1.875rem; }
  }
</style>
<div class="cd-alt">
  <div class="cd-alt__copy">
    <p class="cd-alt__overline" data-field="overline">{{overline}}</p>
    <h2 class="cd-alt__title" data-field="title">{{title}}</h2>
    <div class="cd-alt__rule"></div>
    <p class="cd-alt__lede" data-field="lede">{{lede}}</p>
    <p class="cd-alt__body" data-field="body1">{{body1}}</p>
    <p class="cd-alt__body" data-field="body2">{{body2}}</p>
    <div class="cd-alt__pills">
      <span class="cd-alt__pill"><span class="material-icons">check_circle</span><span data-field="pill1">{{pill1}}</span></span>
      <span class="cd-alt__pill"><span class="material-icons">check_circle</span><span data-field="pill2">{{pill2}}</span></span>
      <span class="cd-alt__pill"><span class="material-icons">check_circle</span><span data-field="pill3">{{pill3}}</span></span>
    </div>
  </div>
  <div class="cd-alt__media">
    <img src="{{image}}" alt="Alternative business lending illustration" loading="lazy" />
  </div>
</div>
`.trim();

const ALT_DEFAULTS = {
  overline: 'ALTERNATIVE BUSINESS LENDING',
  title: 'Alternative Business Lending With Cardiff',
  lede: "If you're exploring alternative business lending options because traditional lenders turned down your business or you can't wait for rigid loan approval processes, you're in the right place.",
  body1: "Cardiff specializes in fast, flexible financing designed for real-world business needs. Whether you're scaling, upgrading equipment, handling seasonal fluctuations, or simply navigating the unpredictability of entrepreneurship, our tailored financial products help you keep moving forward.",
  body2: "We look at the full picture of your business — not just a credit score on a screen — so funding decisions reflect how you actually operate.",
  pill1: 'No collateral required',
  pill2: 'Flexible qualification',
  pill3: 'Same-day decisions',
  image: 'https://cardiff.co/assets/img/alternative-business-lending.svg',
} as const;

const altHtmlBlock = {
  id: 'alt-render',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: ALT_HTML,
  fields: [
    { name: 'overline', label: 'Overline', type: 'text', default: ALT_DEFAULTS.overline },
    { name: 'title', label: 'Section title', type: 'text', default: ALT_DEFAULTS.title },
    { name: 'lede', label: 'Lede paragraph', type: 'textarea', default: ALT_DEFAULTS.lede },
    { name: 'body1', label: 'Body paragraph 1', type: 'textarea', default: ALT_DEFAULTS.body1 },
    { name: 'body2', label: 'Body paragraph 2', type: 'textarea', default: ALT_DEFAULTS.body2 },
    { name: 'pill1', label: 'Pill 1', type: 'text', default: ALT_DEFAULTS.pill1 },
    { name: 'pill2', label: 'Pill 2', type: 'text', default: ALT_DEFAULTS.pill2 },
    { name: 'pill3', label: 'Pill 3', type: 'text', default: ALT_DEFAULTS.pill3 },
    { name: 'image', label: 'Illustration URL', type: 'image', default: ALT_DEFAULTS.image },
  ],
  values: { ...ALT_DEFAULTS },
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content as string);
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

  // Widen so the 2-col layout has room to breathe, and rebalance vertical
  // rhythm (was 64/40 — felt clipped at the bottom against `products`).
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#ffffff',
    paddingTop: '88px',
    paddingBottom: '72px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  sec.blocks = [altHtmlBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: alt-lending -> 2-col copy + illustration composition.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
