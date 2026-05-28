/**
 * Iteration 1: Replace the flat blue hero on post 835 (Using Your Loan) with a
 * full-width photo-background html-render hero that matches
 * cardiff.co/learn/using-your-loan/.
 *
 * Original hero is a `section` (id=hero-using-your-loan) holding heading +
 * subtitle + two-button columns block, but no imagery, so it reads as a flat
 * blue band. Cardiff's original overlays centered copy on the
 * "Using-Cardiff-loan.jpg" laptop+person photo with a deep blue overlay, then
 * surfaces a single ghost-style "Check Eligibility" button. We swap the
 * section's contents for a single html-render block that ships that layout
 * while keeping the copy editable via fields.
 *
 * Idempotent: detects the iter1 marker id and refreshes in place.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 835;
const TARGET_BLOCK_ID = 'hero-using-your-loan';
const NEW_HERO_ID = 'hero-using-your-loan-iter1';

const HERO_HTML = `
<style>
  .cd-uyl-hero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 96px 24px 104px 24px; min-height: 460px; display: flex; align-items: center; justify-content: center; }
  .cd-uyl-hero::before { content: ''; position: absolute; inset: 0; background-image: var(--cd-hero-bg); background-size: cover; background-position: center; z-index: 1; }
  .cd-uyl-hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(28,51,112,0.78) 0%, rgba(28,51,112,0.62) 50%, rgba(28,51,112,0.78) 100%); z-index: 2; pointer-events: none; }
  .cd-uyl-hero__inner { position: relative; z-index: 3; max-width: 900px; margin: 0 auto; text-align: center; }
  .cd-uyl-hero__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #ffb798; font-weight: 700; margin: 0 0 20px 0; }
  .cd-uyl-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3.25rem; font-weight: 800; letter-spacing: -0.01em; line-height: 1.08; color: #fff; margin: 0 0 18px 0; text-shadow: 0 2px 24px rgba(0,0,0,0.5); }
  .cd-uyl-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; font-weight: 400; line-height: 1.55; color: rgba(255,255,255,0.94); margin: 0 auto 36px auto; max-width: 640px; text-shadow: 0 1px 10px rgba(0,0,0,0.35); }
  .cd-uyl-hero__ctas { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: center; }
  .cd-uyl-hero__cta { display: inline-flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.08); color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.8125rem; letter-spacing: 0.16em; text-transform: uppercase; padding: 16px 34px; border-radius: 6px; text-decoration: none; border: 1.5px solid rgba(255,255,255,0.85); backdrop-filter: blur(4px); transition: background 0.2s ease, transform 0.2s ease; }
  .cd-uyl-hero__cta:hover { background: rgba(255,255,255,0.16); transform: translateY(-1px); }
  .cd-uyl-hero__cta--solid { background: #ef6632; border-color: #ef6632; box-shadow: 0 14px 36px rgba(239,102,50,0.42); }
  .cd-uyl-hero__cta--solid:hover { background: #d9582a; border-color: #d9582a; box-shadow: 0 18px 42px rgba(239,102,50,0.52); }
  @media (max-width: 900px) {
    .cd-uyl-hero { padding: 64px 20px 72px 20px; min-height: auto; }
    .cd-uyl-hero__title { font-size: 2.125rem; }
    .cd-uyl-hero__desc { font-size: 1rem; }
  }
</style>
<section class="cd-uyl-hero" style="--cd-hero-bg: url('{{photoUrl}}');">
  <div class="cd-uyl-hero__inner">
    <p class="cd-uyl-hero__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h1 class="cd-uyl-hero__title" data-field="title">{{title}}</h1>
    <p class="cd-uyl-hero__desc" data-field="description">{{description}}</p>
    <div class="cd-uyl-hero__ctas">
      <a class="cd-uyl-hero__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
    </div>
  </div>
</section>
`.trim();

const newHeroBlock = {
  id: NEW_HERO_ID,
  type: 'html-render' as const,
  order: 1,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'LEARN — USING YOUR LOAN' },
    { name: 'title', label: 'Headline', type: 'text', default: 'Using Your Business Loan For Growth & Expansion' },
    { name: 'description', label: 'Description', type: 'textarea', default: 'Pulling the stops on cash flow.' },
    { name: 'ctaText', label: 'CTA text', type: 'text', default: 'Check Eligibility' },
    { name: 'ctaUrl', label: 'CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: 'https://cardiff.co/wp-content/uploads/2025/06/Using-Cardiff-loan.jpg' },
  ],
  values: {
    eyebrow: 'LEARN — USING YOUR LOAN',
    title: 'Using Your Business Loan For Growth & Expansion',
    description: 'Pulling the stops on cash flow.',
    ctaText: 'Check Eligibility',
    ctaUrl: 'https://cardiff.co/business/apply',
    photoUrl: 'https://cardiff.co/wp-content/uploads/2025/06/Using-Cardiff-loan.jpg',
  },
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
  const idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID || b?.id === NEW_HERO_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no hero block (id=${TARGET_BLOCK_ID} or ${NEW_HERO_ID}); aborting`);
    process.exit(1);
  }
  const existing = parsed.blocks[idx];
  if (existing.id === NEW_HERO_ID) {
    console.log(`Post ${POST_ID}: iter1 hero already applied; refreshing in place.`);
  } else if (existing.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${existing.type}); aborting`);
    process.exit(1);
  }
  parsed.blocks[idx] = newHeroBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: replaced hero with full-width photo html-render. block count=${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
