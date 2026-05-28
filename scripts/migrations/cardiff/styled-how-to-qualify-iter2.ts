/**
 * Iteration 2: Replace post 804 (how-to-qualify) hero (block 0,
 * id="hero-how-to-qualify") with an html-render hero that matches
 * cardiff.co's actual treatment:
 *
 *  - Photo background (man on the phone) under a translucent blue
 *    overlay (linear-gradient 25% → 65%).
 *  - Centered headline, smaller centered subtitle below.
 *  - Single primary CTA ("Check Eligibility"), blue background, white
 *    border — matches cardiff.co's actual hero button.
 *
 * Iter 1 fixed the WHAT WE LOOK FOR comparison (sec-2-compare). The
 * other remaining gaps (CTA section sizing, "Right lender" cards) are
 * deferred to iter 3+.
 *
 * Idempotent: re-running on the iter2 hero leaves it unchanged.
 *
 * Run: bunx tsx scripts/migrations/cardiff/styled-how-to-qualify-iter2.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 804;
const NEW_HERO_ID = 'hero-how-to-qualify-iter2';
const PREVIOUS_HERO_IDS = ['hero-how-to-qualify', NEW_HERO_ID];

const HERO_HTML = `
<style>
  .cd-htq-hero { position: relative; overflow: hidden; min-height: 360px; padding: 96px 24px 104px 24px; background-color: #25418b; background-image: linear-gradient(180deg, rgba(37,65,139,0.25) 0%, rgba(37,65,139,0.78) 100%), var(--cd-htq-bg); background-size: cover; background-position: center center; background-repeat: no-repeat; }
  .cd-htq-hero__inner { position: relative; z-index: 2; max-width: 960px; margin: 0 auto; text-align: center; color: #ffffff; }
  .cd-htq-hero__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #ffb798; font-weight: 700; margin: 0 0 18px 0; }
  .cd-htq-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3.25rem; font-weight: 800; letter-spacing: -0.015em; line-height: 1.08; color: #ffffff; margin: 0 0 20px 0; text-shadow: 0 2px 18px rgba(0,0,0,0.42); }
  .cd-htq-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 400; line-height: 1.6; color: rgba(255,255,255,0.94); margin: 0 auto 32px auto; max-width: 640px; text-shadow: 0 1px 6px rgba(0,0,0,0.32); }
  .cd-htq-hero__ctas { display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; }
  .cd-htq-hero__cta { display: inline-flex; align-items: center; gap: 10px; background: #1c3370; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.16em; text-transform: uppercase; padding: 18px 36px; border: 1.5px solid rgba(255,255,255,0.55); border-radius: 2px; text-decoration: none; box-shadow: 0 12px 32px rgba(0,0,0,0.28); transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease; }
  .cd-htq-hero__cta:hover { transform: translateY(-1px); background: #25418b; box-shadow: 0 16px 38px rgba(0,0,0,0.36); }
  @media (max-width: 720px) {
    .cd-htq-hero { padding: 64px 20px 72px 20px; min-height: 280px; }
    .cd-htq-hero__title { font-size: 2.125rem; }
    .cd-htq-hero__desc { font-size: 1rem; }
  }
</style>
<section class="cd-htq-hero" style="--cd-htq-bg: url('{{photoUrl}}');">
  <div class="cd-htq-hero__inner">
    <p class="cd-htq-hero__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h1 class="cd-htq-hero__title" data-field="title">{{title}}</h1>
    <p class="cd-htq-hero__desc" data-field="description">{{description}}</p>
    <div class="cd-htq-hero__ctas">
      <a class="cd-htq-hero__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
    </div>
  </div>
</section>
`.trim();

const newHeroBlock = {
  id: NEW_HERO_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: HERO_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'BUSINESS LOAN QUALIFICATION' },
    { name: 'title', label: 'Headline', type: 'text', default: 'How to Qualify for a Business Loan' },
    { name: 'description', label: 'Description', type: 'textarea', default: 'Qualifying for a small business loan with Cardiff is easy! Learn how here.' },
    { name: 'ctaText', label: 'CTA text', type: 'text', default: 'Check Eligibility' },
    { name: 'ctaUrl', label: 'CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/06/Qualify-with-Cardiff.jpg' },
  ],
  values: {
    eyebrow: 'BUSINESS LOAN QUALIFICATION',
    title: 'How to Qualify for a Business Loan',
    description: 'Qualifying for a small business loan with Cardiff is easy! Learn how here.',
    ctaText: 'Check Eligibility',
    ctaUrl: 'https://cardiff.co/business/apply',
    photoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/06/Qualify-with-Cardiff.jpg',
  },
};

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema/cms');
  const { eq } = await import('drizzle-orm');

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
  const existing = parsed.blocks[0];
  if (!existing) {
    console.error(`Post ${POST_ID}: no block[0] to replace`);
    process.exit(1);
  }
  if (!PREVIOUS_HERO_IDS.includes(existing.id)) {
    console.error(
      `Post ${POST_ID}: block[0] is id=${existing.id} (type=${existing.type}); expected one of ${PREVIOUS_HERO_IDS.join(', ')}. Aborting to avoid clobbering.`,
    );
    process.exit(1);
  }
  if (existing.id === NEW_HERO_ID && existing.type === 'html-render') {
    // Re-apply (idempotent): refresh html + values, leave block in place.
    parsed.blocks[0] = { ...existing, ...newHeroBlock };
    await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
    console.log(`Re-applied iter2 hero on post ${POST_ID} (id=${NEW_HERO_ID}).`);
    process.exit(0);
  }
  parsed.blocks[0] = newHeroBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: replaced block[0] hero with html-render iter2 (photo + blue overlay).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
