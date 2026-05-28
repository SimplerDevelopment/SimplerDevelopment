/**
 * Iteration 1: Replace the flat blue hero on post 803 (Getting Ready) with a
 * two-column html-render hero that matches cardiff.co/learn/getting-ready/.
 *
 * Original hero is a `section` (id=hero-getting-ready) holding a heading +
 * subtitle + two-button columns block — but no imagery, so it reads as a flat
 * blue band. Cardiff's original overlays the same copy on top of the
 * "Getting-ready-with-Cardiff.jpg" laptop/keyboard photo with a left-to-right
 * blue gradient fade. We swap the section's contents for a single html-render
 * block that ships that layout while keeping the copy editable via fields.
 *
 * Idempotent: detects the iter1 marker id and refuses to double-apply.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 803;
const TARGET_BLOCK_ID = 'hero-getting-ready';
const NEW_HERO_ID = 'hero-getting-ready-iter1';

const HERO_HTML = `
<style>
  .cd-hero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 88px 24px 96px 24px; }
  .cd-hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(95deg, rgba(28,51,112,0.96) 0%, rgba(28,51,112,0.88) 35%, rgba(37,65,139,0.55) 62%, rgba(37,65,139,0.20) 80%, rgba(37,65,139,0.05) 100%); z-index: 2; pointer-events: none; }
  .cd-hero::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 60%; background-image: var(--cd-hero-bg); background-size: cover; background-position: center right; z-index: 1; }
  .cd-hero__inner { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: center; min-height: 420px; }
  .cd-hero__copy { max-width: 560px; }
  .cd-hero__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #ffb798; font-weight: 700; margin: 0 0 22px 0; }
  .cd-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3.25rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; color: #fff; text-transform: uppercase; margin: 0 0 22px 0; text-shadow: 0 2px 24px rgba(0,0,0,0.42); }
  .cd-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 400; line-height: 1.55; color: rgba(255,255,255,0.92); margin: 0 0 32px 0; max-width: 500px; }
  .cd-hero__ctas { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; }
  .cd-hero__cta { display: inline-flex; align-items: center; gap: 10px; background: #ef6632; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 17px 32px; border-radius: 6px; text-decoration: none; box-shadow: 0 14px 36px rgba(239,102,50,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-hero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 42px rgba(239,102,50,0.52); }
  .cd-hero__cta--ghost { background: transparent; color: #ffffff; border: 1.5px solid rgba(255,255,255,0.5); padding: 15.5px 28px; box-shadow: none; backdrop-filter: blur(6px); }
  .cd-hero__cta--ghost:hover { background: rgba(255,255,255,0.10); box-shadow: none; }
  .cd-hero__photo { position: relative; z-index: 3; align-self: stretch; }
  @media (max-width: 900px) {
    .cd-hero { padding: 56px 20px 72px 20px; }
    .cd-hero::after { width: 100%; opacity: 0.32; }
    .cd-hero__inner { grid-template-columns: 1fr; gap: 24px; min-height: auto; text-align: center; }
    .cd-hero__copy { max-width: none; margin: 0 auto; }
    .cd-hero__title { font-size: 2.25rem; }
    .cd-hero__ctas { justify-content: center; }
    .cd-hero__photo { display: none; }
  }
</style>
<section class="cd-hero" style="--cd-hero-bg: url('{{photoUrl}}');">
  <div class="cd-hero__inner">
    <div class="cd-hero__copy">
      <p class="cd-hero__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
      <h1 class="cd-hero__title" data-field="title">{{title}}</h1>
      <p class="cd-hero__desc" data-field="description">{{description}}</p>
      <div class="cd-hero__ctas">
        <a class="cd-hero__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
        <a class="cd-hero__cta cd-hero__cta--ghost" href="{{secondaryCtaUrl}}" data-field="secondaryCtaText">{{secondaryCtaText}}</a>
      </div>
    </div>
    <div class="cd-hero__photo" aria-hidden="true"></div>
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
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'LEARN — LOAN READINESS' },
    { name: 'title', label: 'Headline', type: 'text', default: 'Prepare for Business Loans: Get Funding Ready' },
    { name: 'description', label: 'Description', type: 'textarea', default: 'Prepare your business for financing with essential tips on business credit options and loan readiness. Learn how to get a business loan that fits your needs.' },
    { name: 'ctaText', label: 'Primary CTA text', type: 'text', default: 'Check Eligibility' },
    { name: 'ctaUrl', label: 'Primary CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'secondaryCtaText', label: 'Secondary CTA text', type: 'text', default: 'Talk to a Specialist' },
    { name: 'secondaryCtaUrl', label: 'Secondary CTA url', type: 'url', default: '/contact-us' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: 'https://cardiff.co/wp-content/uploads/2025/06/Getting-ready-with-Cardiff.jpg' },
  ],
  values: {
    eyebrow: 'LEARN — LOAN READINESS',
    title: 'Prepare for Business Loans: Get Funding Ready',
    description: 'Prepare your business for financing with essential tips on business credit options and loan readiness. Learn how to get a business loan that fits your needs.',
    ctaText: 'Check Eligibility',
    ctaUrl: 'https://cardiff.co/business/apply',
    secondaryCtaText: 'Talk to a Specialist',
    secondaryCtaUrl: '/contact-us',
    photoUrl: 'https://cardiff.co/wp-content/uploads/2025/06/Getting-ready-with-Cardiff.jpg',
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
  console.log(`Updated post ${POST_ID}: replaced hero with two-column html-render. block count=${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
