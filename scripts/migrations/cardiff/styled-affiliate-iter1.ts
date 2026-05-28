/**
 * Iteration 1: Affiliate page (post id 796).
 *
 * Biggest visual gap vs cardiff.co/affiliate/: the original hero centers the
 * headline, adds a yellow highlight pill ("Even If They Don't Take the Loan"),
 * and the bulk of the hero is a large video thumbnail with a play button
 * (man at desk). The port currently shows the same headline but no pill, no
 * video, and a tiny 2-button row instead — making the hero feel half-finished
 * and short.
 *
 * Fix: replace block[0] (the existing `section#hero-affiliate`) with a
 * single `html-render` "affiliate-hero" block whose layout matches cardiff:
 *   - centered headline
 *   - yellow pill ("Even If They Don't Take the Loan")
 *   - 16:9 video thumbnail with play button overlay (lightbox on click)
 *   - blue gradient background that runs full-bleed
 *
 * Idempotent: re-running rebuilds the same block in place. It looks at
 * block[0]; if it's already our affiliate-hero (html-render), it replaces it;
 * if it's the original section, it replaces it; otherwise it aborts.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 796;

const HERO_HTML = `
<style>
  .cd-affhero { position: relative; overflow: hidden; background: #1c3370; color: #fff; padding: 64px 24px 88px 24px; background-image: radial-gradient(ellipse at 60% 0%, rgba(56,92,192,0.55) 0%, transparent 60%), linear-gradient(135deg, #1c3370 0%, #25418b 55%, #385cc0 100%); }
  .cd-affhero__inner { position: relative; max-width: 1080px; margin: 0 auto; text-align: center; }
  .cd-affhero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.08; color: #fff; text-transform: none; margin: 0 0 22px 0; text-shadow: 0 2px 18px rgba(0,0,0,0.42); }
  .cd-affhero__pill { display: inline-block; background: #ffd84d; color: #1c3370; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; font-weight: 800; letter-spacing: 0.01em; text-transform: none; padding: 10px 22px; border-radius: 4px; margin: 0 auto 36px auto; box-shadow: 0 6px 18px rgba(0,0,0,0.22); transform: rotate(-1.2deg); }
  .cd-affhero__video { position: relative; max-width: 880px; margin: 0 auto; border-radius: 8px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.42); aspect-ratio: 16 / 9; background: #0d1a3a; cursor: pointer; display: block; }
  .cd-affhero__video img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.5s ease, filter 0.3s ease; }
  .cd-affhero__video:hover img { transform: scale(1.03); filter: brightness(1.05); }
  .cd-affhero__play { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 88px; height: 88px; border-radius: 50%; background: #1c5cff; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(0,0,0,0.42); transition: transform 0.2s ease, background 0.2s ease; }
  .cd-affhero__video:hover .cd-affhero__play { transform: translate(-50%, -50%) scale(1.08); background: #2a6cff; }
  .cd-affhero__play::after { content: ''; display: block; width: 0; height: 0; border-style: solid; border-width: 16px 0 16px 26px; border-color: transparent transparent transparent #ffffff; margin-left: 6px; }
  @media (max-width: 760px) {
    .cd-affhero { padding: 48px 18px 64px 18px; }
    .cd-affhero__title { font-size: 1.9rem; }
    .cd-affhero__pill { font-size: 0.85rem; padding: 8px 16px; }
    .cd-affhero__play { width: 64px; height: 64px; }
    .cd-affhero__play::after { border-width: 12px 0 12px 20px; }
  }
</style>
<section class="cd-affhero">
  <div class="cd-affhero__inner">
    <h1 class="cd-affhero__title" data-field="title">{{title}}</h1>
    <span class="cd-affhero__pill" data-field="pill">{{pill}}</span>
    <a class="cd-affhero__video" href="{{videoUrl}}" target="_blank" rel="noopener" aria-label="Play affiliate program video">
      <img src="{{posterUrl}}" alt="" loading="lazy" />
      <span class="cd-affhero__play" aria-hidden="true"></span>
    </a>
  </div>
</section>
`.trim();

const newHeroBlock = {
  id: 'hero-affiliate',
  type: 'html-render' as const,
  width: 'full' as const,
  html: HERO_HTML,
  fields: [
    { name: 'title', label: 'Headline', type: 'text', default: 'Get Paid To Help Small Businesses Access The Capital They Need To Scale!' },
    { name: 'pill', label: 'Highlight pill', type: 'text', default: "Even If They Don't Take The Loan" },
    { name: 'posterUrl', label: 'Video poster image', type: 'image', default: 'https://cardiff.co/wp-content/uploads/2025/10/help-small-business-access-capital.jpg' },
    { name: 'videoUrl', label: 'Video URL', type: 'url', default: 'https://cardiff.co/wp-content/uploads/2025/10/Cardiff-Affiliate-Program-Video.mp4' },
  ],
  values: {
    title: 'Get Paid To Help Small Businesses Access The Capital They Need To Scale!',
    pill: "Even If They Don't Take The Loan",
    posterUrl: 'https://cardiff.co/wp-content/uploads/2025/10/help-small-business-access-capital.jpg',
    videoUrl: 'https://cardiff.co/wp-content/uploads/2025/10/Cardiff-Affiliate-Program-Video.mp4',
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
  const old = parsed.blocks[0];
  const isOriginalSection = old?.type === 'section' && old?.id === 'hero-affiliate';
  const isOurHtmlHero = old?.type === 'html-render' && old?.id === 'hero-affiliate';
  if (!isOriginalSection && !isOurHtmlHero) {
    console.error(`Post ${POST_ID}: block[0] is not the expected hero (type=${old?.type} id=${old?.id}); aborting`);
    process.exit(1);
  }
  parsed.blocks[0] = newHeroBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: replaced ${isOurHtmlHero ? 'existing html-render' : 'original section'} hero with affiliate-hero html-render. Block count: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
