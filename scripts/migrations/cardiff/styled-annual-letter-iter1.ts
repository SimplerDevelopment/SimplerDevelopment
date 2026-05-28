/**
 * 2025 Annual Letter (post id 794) — iter1
 *
 * Page is a Borrow-Better-style funnel page. The biggest single visual gap
 * is the hero: the original is a 2-column blue-gradient hero with the
 * customer photo on the right and the "How Much Cash Do You Need?" form +
 * CHECK ELIGIBILITY green CTA on the left. The current port renders the
 * stock `section` hero (centered heading + paragraph + two buttons), which
 * is the dominant above-the-fold element on a tall scroll page.
 *
 * Iter1 replaces the hero `section` block with an html-render two-column
 * hero matching the home page (793) treatment — same brand fonts, deep blue
 * gradient, customer photo, green CTA, plus a "quick-quote" amount input
 * styled to mirror the original. Idempotent: detects an existing
 * html-render hero with the iter1 marker id and re-writes it.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema/cms');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 794;
  const NEW_HERO_ID = 'hero-2025-annual-letter';

  const HERO_HTML = `
<style>
  .cdal-hero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 88px 24px 96px 24px; }
  .cdal-hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(95deg, rgba(28,51,112,0.96) 0%, rgba(28,51,112,0.88) 35%, rgba(37,65,139,0.55) 62%, rgba(37,65,139,0.20) 80%, rgba(37,65,139,0.05) 100%); z-index: 2; pointer-events: none; }
  .cdal-hero::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 60%; background-image: var(--cdal-hero-bg); background-size: cover; background-position: center right; z-index: 1; }
  .cdal-hero__inner { position: relative; z-index: 3; max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 48px; align-items: center; min-height: 460px; }
  .cdal-hero__copy { max-width: 560px; }
  .cdal-hero__eyebrow { display: inline-block; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; letter-spacing: 0.32em; text-transform: uppercase; color: #ffb798; font-weight: 700; margin: 0 0 22px 0; }
  .cdal-hero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 4.5rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.0; color: #fff; text-transform: uppercase; margin: 0 0 22px 0; text-shadow: 0 2px 24px rgba(0,0,0,0.42); }
  .cdal-hero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 400; line-height: 1.55; color: rgba(255,255,255,0.92); margin: 0 0 26px 0; max-width: 480px; }
  .cdal-hero__form-label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; font-weight: 700; color: #fff; margin: 0 0 10px 0; }
  .cdal-hero__form { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; max-width: 460px; }
  .cdal-hero__amount { flex: 1 1 200px; min-width: 180px; padding: 14px 16px; font-family: 'Open Sans', sans-serif; font-size: 1rem; background: #fff; border: 1px solid rgba(255,255,255,0.4); border-radius: 4px; color: #1c3370; }
  .cdal-hero__amount::placeholder { color: rgba(28,51,112,0.45); }
  .cdal-hero__cta { display: inline-block; background: #5ac96f; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 15px 26px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(90,201,111,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; border: none; cursor: pointer; }
  .cdal-hero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 42px rgba(90,201,111,0.52); }
  .cdal-hero__photo { position: relative; z-index: 3; align-self: stretch; }
  @media (max-width: 900px) {
    .cdal-hero { padding: 56px 20px 72px 20px; }
    .cdal-hero::after { width: 100%; opacity: 0.32; }
    .cdal-hero__inner { grid-template-columns: 1fr; gap: 24px; min-height: auto; text-align: center; }
    .cdal-hero__copy { max-width: none; margin: 0 auto; }
    .cdal-hero__title { font-size: 2.6rem; }
    .cdal-hero__form { justify-content: center; }
    .cdal-hero__photo { display: none; }
  }
</style>
<section class="cdal-hero" style="--cdal-hero-bg: url('{{photoUrl}}');">
  <div class="cdal-hero__inner">
    <div class="cdal-hero__copy">
      <p class="cdal-hero__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
      <h1 class="cdal-hero__title" data-field="title">{{title}}</h1>
      <p class="cdal-hero__desc" data-field="description">{{description}}</p>
      <p class="cdal-hero__form-label" data-field="formLabel">{{formLabel}}</p>
      <form class="cdal-hero__form" action="{{ctaUrl}}" method="get" onsubmit="event.preventDefault(); window.location='{{ctaUrl}}';">
        <input class="cdal-hero__amount" type="text" name="amount" placeholder="$" aria-label="How much cash do you need?" />
        <button type="submit" class="cdal-hero__cta" data-field="ctaText">{{ctaText}}</button>
      </form>
    </div>
    <div class="cdal-hero__photo" aria-hidden="true"></div>
  </div>
</section>
`.trim();

  const newHeroBlock = {
    id: NEW_HERO_ID,
    type: 'html-render' as const,
    width: 'full' as const,
    html: HERO_HTML,
    fields: [
      { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'SMALL BUSINESS FINANCING UP TO $250,000' },
      { name: 'title', label: 'Headline', type: 'text', default: 'Borrow Better' },
      { name: 'description', label: 'Description', type: 'textarea', default: "You wouldn't wait ten minutes for a latte, so why wait longer for business financing?" },
      { name: 'formLabel', label: 'Form label', type: 'text', default: 'How Much Cash Do You Need?' },
      { name: 'ctaText', label: 'Primary CTA text', type: 'text', default: 'Check Eligibility' },
      { name: 'ctaUrl', label: 'Primary CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
      { name: 'photoUrl', label: 'Hero photo', type: 'image', default: 'https://cardiff.b-cdn.net/img/home-header-full.png' },
      // iter1 marker
      { name: '_iter', label: 'Iter (do not edit)', type: 'text', default: 'annual-letter-iter1' },
    ],
    values: {
      eyebrow: 'SMALL BUSINESS FINANCING UP TO $250,000',
      title: 'Borrow Better',
      description: "You wouldn't wait ten minutes for a latte, so why wait longer for business financing?",
      formLabel: 'How Much Cash Do You Need?',
      ctaText: 'Check Eligibility',
      ctaUrl: 'https://cardiff.co/business/apply',
      photoUrl: 'https://cardiff.b-cdn.net/img/home-header-full.png',
      _iter: 'annual-letter-iter1',
    },
  };

  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content || '{}');
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }

  const heroIdx = parsed.blocks.findIndex((b: any) => b?.id === NEW_HERO_ID);
  if (heroIdx === -1) {
    console.error(`Post ${POST_ID}: no block with id '${NEW_HERO_ID}'; aborting`);
    process.exit(1);
  }

  const existing = parsed.blocks[heroIdx];
  const isHtmlRenderIter1 =
    existing?.type === 'html-render' &&
    existing?.values?._iter === 'annual-letter-iter1';

  parsed.blocks[heroIdx] = newHeroBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));

  if (isHtmlRenderIter1) {
    console.log(`Re-applied iter1 hero on post ${POST_ID} (idempotent replace).`);
  } else {
    console.log(`Replaced hero block (was type=${existing?.type}) on post ${POST_ID} with iter1 html-render hero. Block count: ${parsed.blocks.length}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
