/**
 * Industries — Trucking (post id 817), iter1.
 *
 * Replaces the flat-blue stock "section" hero at index 0 with a full-bleed
 * html-render hero whose background is the real cardiff.co trucking photo
 * (driver in front of truck). The original cardiff.co hero is centered with
 * one CTA on a darkened photo; we keep both buttons from the existing port
 * so we don't lose secondary CTA functionality.
 *
 * Idempotent: re-running detects the html-render replacement and skips.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const HERO_ID = 'hero-industries-trucking';

const HERO_HTML = `
<style>
  .cd-thero { position: relative; overflow: hidden; background: #1c3370; color: #fff; min-height: 460px; padding: 96px 24px 104px 24px; }
  .cd-thero::before { content: ''; position: absolute; inset: 0; background-image: var(--cd-thero-bg); background-size: cover; background-position: center center; z-index: 1; }
  .cd-thero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(28,51,112,0.55) 0%, rgba(28,51,112,0.62) 60%, rgba(28,51,112,0.78) 100%); z-index: 2; }
  .cd-thero__inner { position: relative; z-index: 3; max-width: 980px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .cd-thero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3.75rem; font-weight: 800; letter-spacing: -0.01em; line-height: 1.05; color: #fff; margin: 0 0 20px 0; text-shadow: 0 2px 22px rgba(0,0,0,0.55); }
  .cd-thero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; font-weight: 400; line-height: 1.55; color: rgba(255,255,255,0.92); margin: 0 0 30px 0; max-width: 640px; text-shadow: 0 1px 12px rgba(0,0,0,0.45); }
  .cd-thero__ctas { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; align-items: center; }
  .cd-thero__cta { display: inline-block; background: #ef6632; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.875rem; letter-spacing: 0.12em; text-transform: uppercase; padding: 17px 36px; border-radius: 4px; text-decoration: none; box-shadow: 0 14px 36px rgba(239,102,50,0.42); transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .cd-thero__cta:hover { transform: translateY(-1px); box-shadow: 0 18px 42px rgba(239,102,50,0.52); }
  .cd-thero__cta--ghost { background: transparent; color: #ffffff; border: 1.5px solid rgba(255,255,255,0.55); padding: 15.5px 32px; box-shadow: none; backdrop-filter: blur(6px); }
  .cd-thero__cta--ghost:hover { background: rgba(255,255,255,0.10); box-shadow: none; }
  @media (max-width: 900px) {
    .cd-thero { padding: 64px 20px 72px 20px; min-height: auto; }
    .cd-thero__title { font-size: 2.25rem; }
    .cd-thero__desc { font-size: 1rem; }
  }
</style>
<section class="cd-thero" style="--cd-thero-bg: url('{{photoUrl}}');">
  <div class="cd-thero__inner">
    <h1 class="cd-thero__title" data-field="title">{{title}}</h1>
    <p class="cd-thero__desc" data-field="description">{{description}}</p>
    <div class="cd-thero__ctas">
      <a class="cd-thero__cta" href="{{ctaUrl}}" data-field="ctaText">{{ctaText}}</a>
      <a class="cd-thero__cta cd-thero__cta--ghost" href="{{secondaryCtaUrl}}" data-field="secondaryCtaText">{{secondaryCtaText}}</a>
    </div>
  </div>
</section>
`.trim();

const newHeroBlock = {
  id: HERO_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'title', label: 'Headline', type: 'text', default: 'Small Business Loans for Trucking' },
    { name: 'description', label: 'Description', type: 'textarea', default: "Get business lending and fast unsecured business loans for your trucking company’s financing needs. Learn how to get a business loan for trucking." },
    { name: 'ctaText', label: 'Primary CTA text', type: 'text', default: 'Check Eligibility' },
    { name: 'ctaUrl', label: 'Primary CTA url', type: 'url', default: 'https://cardiff.co/business/apply' },
    { name: 'secondaryCtaText', label: 'Secondary CTA text', type: 'text', default: 'Talk to a Specialist' },
    { name: 'secondaryCtaUrl', label: 'Secondary CTA url', type: 'url', default: '/contact-us' },
    { name: 'photoUrl', label: 'Hero photo', type: 'image', default: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/06/Loans-for-Trucking.jpg' },
  ],
  values: {
    title: 'Small Business Loans for Trucking',
    description: "Get business lending and fast unsecured business loans for your trucking company’s financing needs. Learn how to get a business loan for trucking.",
    ctaText: 'Check Eligibility',
    ctaUrl: 'https://cardiff.co/business/apply',
    secondaryCtaText: 'Talk to a Specialist',
    secondaryCtaUrl: '/contact-us',
    photoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/06/Loans-for-Trucking.jpg',
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
  const current = parsed.blocks[0];
  if (current?.type === 'html-render' && current?.id === HERO_ID) {
    console.log(`Post ${POST_ID}: hero is already html-render; updating html+values in place`);
  } else if (current?.type !== 'section' || current?.id !== HERO_ID) {
    console.error(`Post ${POST_ID}: block[0] is not the expected section hero (got type=${current?.type} id=${current?.id}); aborting`);
    process.exit(1);
  }
  parsed.blocks[0] = newHeroBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: replaced hero with html-render. Total blocks: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
