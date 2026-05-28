/**
 * Using Your Loan (post 835) — iteration 3.
 *
 * Single biggest remaining gap after iter2: the page is now only THREE blocks
 * (hero → uses-band → final-cta). The jump from the "Make Your Business
 * Better" use-case grid straight into the dark navy CTA is abrupt — there is
 * no proof / how-it-works moment to bridge "here are use cases" with "now
 * apply". Sibling cardiff pages (equipment-leasing, sba-loans) all carry a
 * 3-step "How to Use Your Loan" process band before their final CTA.
 *
 * Fix: insert ONE consolidated html-render slab `apply-steps` between
 * uses-band and final-cta — a 3-column numbered process band
 *   1. Pick Your Purpose       (target)
 *   2. Apply in Minutes         (rocket_launch)
 *   3. Put Capital to Work      (savings)
 * styled to match the iter1/iter2 brand vocabulary (Raleway + Open Sans,
 * orange eyebrow + divider, navy headings, soft gradient card chrome, green
 * accent on step 3). Uses data-repeat="steps" so the portal editor can
 * add/remove steps without code changes.
 *
 * Idempotent: looks for the already-migrated `apply-steps` id and rewrites
 * in place; otherwise splices it between `uses-band` and `final-cta` and
 * renumbers `final-cta.order`. Safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 835;
  const NEW_ID = 'apply-steps';

  const STEPS_HTML = `
<style>
  .cd-steps { background: #ffffff; padding: 96px 24px 96px 24px; position: relative; overflow: hidden; }
  .cd-steps::before { content: ""; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 1200px; height: 1px; background: linear-gradient(90deg, transparent 0%, #e8edf6 18%, #e8edf6 82%, transparent 100%); }
  .cd-steps__inner { max-width: 1180px; margin: 0 auto; position: relative; }
  .cd-steps__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.6875rem; font-weight: 700; color: #ef6632; letter-spacing: 0.32em; text-transform: uppercase; text-align: center; margin: 0 0 14px 0; }
  .cd-steps__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.25rem; font-weight: 800; color: #1c3370; letter-spacing: -0.018em; text-align: center; margin: 0 0 16px 0; line-height: 1.15; }
  .cd-steps__divider { width: 56px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 28px auto; }
  .cd-steps__intro { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #525f7f; text-align: center; margin: 0 auto 64px auto; max-width: 720px; }
  .cd-steps__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; position: relative; }
  .cd-steps__grid::before { content: ""; position: absolute; top: 36px; left: 16%; right: 16%; height: 2px; background: repeating-linear-gradient(90deg, #d9e1f2 0 6px, transparent 6px 14px); z-index: 0; }
  .cd-steps__card { position: relative; background: linear-gradient(180deg, #ffffff 0%, #f6f9fc 100%); border-radius: 18px; padding: 0 30px 34px 30px; border: 1px solid #e8edf6; box-shadow: 0 10px 28px rgba(28,51,112,0.06); display: flex; flex-direction: column; align-items: center; text-align: center; z-index: 1; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-steps__card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(28,51,112,0.12); }
  .cd-steps__num { position: relative; margin-top: -24px; width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 1.5rem; letter-spacing: -0.01em; box-shadow: 0 10px 22px rgba(28,51,112,0.28); border: 4px solid #ffffff; margin-bottom: 22px; }
  .cd-steps__card:nth-child(2) .cd-steps__num { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.32); }
  .cd-steps__card:nth-child(3) .cd-steps__num { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.32); }
  .cd-steps__icon { color: #25418b; margin-bottom: 14px; opacity: 0.85; }
  .cd-steps__card:nth-child(2) .cd-steps__icon { color: #ef6632; }
  .cd-steps__card:nth-child(3) .cd-steps__icon { color: #3aa856; }
  .cd-steps__icon .material-icons { font-size: 32px; }
  .cd-steps__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-steps__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-steps__grid { grid-template-columns: 1fr; gap: 36px; }
    .cd-steps__grid::before { display: none; }
  }
  @media (max-width: 620px) {
    .cd-steps { padding: 72px 18px 72px 18px; }
    .cd-steps__title { font-size: 1.875rem; }
    .cd-steps__card { padding: 0 22px 28px 22px; }
  }
</style>
<section class="cd-steps">
  <div class="cd-steps__inner">
    <p class="cd-steps__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-steps__title" data-field="title">{{title}}</h2>
    <div class="cd-steps__divider" aria-hidden="true"></div>
    <p class="cd-steps__intro" data-field="intro">{{intro}}</p>
    <div class="cd-steps__grid">
      <article class="cd-steps__card" data-repeat="steps">
        <div class="cd-steps__num" data-field="num">{{steps.num}}</div>
        <div class="cd-steps__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
        <h3 class="cd-steps__card-title" data-field="cardTitle">{{steps.cardTitle}}</h3>
        <p class="cd-steps__card-desc" data-field="cardDesc">{{steps.cardDesc}}</p>
      </article>
    </div>
  </div>
</section>
`.trim();

  const stepsBlock = {
    id: NEW_ID,
    type: 'html-render' as const,
    order: 3,
    width: 'full' as const,
    html: STEPS_HTML,
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: 'HOW IT WORKS' },
      { name: 'title', label: 'Headline', type: 'text' as const, default: 'Three Steps to Put Your Loan to Work' },
      {
        name: 'intro',
        label: 'Intro paragraph',
        type: 'textarea' as const,
        default:
          'From pinpointing where capital will drive the biggest return to deploying it across your business, our process is built so you spend less time waiting on funding and more time growing.',
      },
      {
        name: 'steps',
        label: 'Steps',
        type: 'array' as const,
        itemFields: [
          { name: 'num', label: 'Step number', type: 'text' as const, default: '01' },
          { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'target' },
          { name: 'cardTitle', label: 'Title', type: 'text' as const },
          { name: 'cardDesc', label: 'Description', type: 'textarea' as const },
        ],
      },
    ],
    values: {
      eyebrow: 'HOW IT WORKS',
      title: 'Three Steps to Put Your Loan to Work',
      intro:
        'From pinpointing where capital will drive the biggest return to deploying it across your business, our process is built so you spend less time waiting on funding and more time growing.',
      steps: [
        {
          num: '01',
          icon: 'my_location',
          cardTitle: 'Pick Your Purpose',
          cardDesc:
            'Decide whether the funds will smooth cash flow, restock inventory, or cover payroll — clarity up front makes the rest fast.',
        },
        {
          num: '02',
          icon: 'rocket_launch',
          cardTitle: 'Apply in Minutes',
          cardDesc:
            'Submit a short application online. Most decisions come back the same day with no collateral required up to $250,000.',
        },
        {
          num: '03',
          icon: 'savings',
          cardTitle: 'Put Capital to Work',
          cardDesc:
            'Funds land in your account fast so you can buy inventory, level out cash flow, or make payroll without missing a beat.',
        },
      ],
    },
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

  // Idempotency: if apply-steps already exists, just rewrite it in place.
  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === NEW_ID);
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = { ...stepsBlock, order: parsed.blocks[existingIdx].order ?? 3 };
    await db
      .update(posts)
      .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
      .where(eq(posts.id, POST_ID));
    console.log(
      `Updated post ${POST_ID}: refreshed existing '${NEW_ID}' (idx ${existingIdx}). Block count: ${parsed.blocks.length}`,
    );
    process.exit(0);
  }

  // First-time migration: insert between uses-band and final-cta.
  const usesIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'uses-band');
  const ctaIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'final-cta');
  if (usesIdx < 0 || ctaIdx < 0) {
    console.error(
      `Post ${POST_ID}: expected both 'uses-band' (got idx ${usesIdx}) and 'final-cta' (got idx ${ctaIdx})`,
    );
    process.exit(1);
  }
  const usesOrder = (parsed.blocks[usesIdx].order as number) ?? 2;
  const insertAt = usesIdx + 1;
  parsed.blocks.splice(insertAt, 0, { ...stepsBlock, order: usesOrder + 1 });
  // Bump every subsequent block's order so final-cta still trails.
  for (let i = insertAt + 1; i < parsed.blocks.length; i++) {
    parsed.blocks[i].order = (parsed.blocks[insertAt].order as number) + (i - insertAt);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: inserted '${NEW_ID}' at idx ${insertAt}. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
