/**
 * About page (post id 795) — iteration 1.
 *
 * Gap picked: the original cardiff.co/about-cardiff/ hero is a two-column
 * LIGHT layout — small "About Cardiff" eyebrow + dark headline + body copy
 * on the LEFT, a large Cardiff-at-youtube.jpg thumbnail with play button on
 * the RIGHT. The current port is the opposite: a centered, full-width DEEP
 * BLUE hero with white text and no image. That is the biggest single
 * visual delta on the page.
 *
 * Fix: replace the `about-hero` section block (block[0]) with an
 * html-render two-column layout that matches the original. Intro copy
 * paragraphs (currently in the `about-intro` block) are pulled into the
 * left column so the whole upper-fold matches cardiff.co at a glance.
 *
 * We then leave `about-intro` in place but trimmed of its now-redundant
 * paragraphs (we keep the section as an empty separator so order indices
 * downstream don't get clobbered if other iters reference them).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';
import type { HtmlRenderBlock } from '../../../types/blocks/content';

const ABOUT_POST_ID = 795;

const HERO_HTML = `
<style>
  .cd-abouthero { background: #ffffff; padding: 80px 24px 64px 24px; }
  .cd-abouthero__inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 64px; align-items: center; }
  .cd-abouthero__copy { max-width: 560px; }
  .cd-abouthero__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.875rem; letter-spacing: 0.04em; color: #1c3370; font-weight: 700; margin: 0 0 14px 0; }
  .cd-abouthero__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.75rem; font-weight: 800; letter-spacing: -0.01em; line-height: 1.1; color: #0a1633; margin: 0 0 24px 0; }
  .cd-abouthero__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.75; color: #4a5168; margin: 0 0 18px 0; }
  .cd-abouthero__desc:last-child { margin-bottom: 0; }
  .cd-abouthero__media { position: relative; width: 100%; aspect-ratio: 16/12; border-radius: 6px; overflow: hidden; box-shadow: 0 18px 48px rgba(10, 22, 51, 0.18); background: #000; }
  .cd-abouthero__media img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cd-abouthero__play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.18); transition: background 0.2s ease; text-decoration: none; }
  .cd-abouthero__play:hover { background: rgba(0,0,0,0.32); }
  .cd-abouthero__playbtn { width: 84px; height: 84px; border-radius: 50%; background: rgba(255,255,255,0.94); display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 24px rgba(0,0,0,0.32); }
  .cd-abouthero__playbtn::before { content: ''; display: block; width: 0; height: 0; border-style: solid; border-width: 18px 0 18px 28px; border-color: transparent transparent transparent #1c3370; margin-left: 6px; }
  @media (max-width: 900px) {
    .cd-abouthero { padding: 48px 20px 32px 20px; }
    .cd-abouthero__inner { grid-template-columns: 1fr; gap: 32px; }
    .cd-abouthero__title { font-size: 2rem; }
  }
</style>
<section class="cd-abouthero">
  <div class="cd-abouthero__inner">
    <div class="cd-abouthero__copy">
      <p class="cd-abouthero__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
      <h1 class="cd-abouthero__title" data-field="title">{{title}}</h1>
      <p class="cd-abouthero__desc" data-field="paragraph1">{{paragraph1}}</p>
      <p class="cd-abouthero__desc" data-field="paragraph2">{{paragraph2}}</p>
    </div>
    <div>
      <a class="cd-abouthero__media" href="{{videoUrl}}" target="_blank" rel="noopener">
        <img src="{{photoUrl}}" alt="Cardiff featured on YouTube" data-field="photoUrl" />
        <span class="cd-abouthero__play" aria-label="Play video">
          <span class="cd-abouthero__playbtn"></span>
        </span>
      </a>
    </div>
  </div>
</section>
`.trim();

const newHeroBlock: HtmlRenderBlock = {
  id: 'about-hero',
  type: 'html-render',
  order: 1,
  width: 'full',
  html: HERO_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: 'About Cardiff' },
    { name: 'title', label: 'Headline', type: 'text', default: 'A trusted leader in small business lending' },
    {
      name: 'paragraph1',
      label: 'Paragraph 1',
      type: 'textarea',
      default:
        'Cardiff, a small business lender based in San Diego, offers fast, flexible financing solutions tailored to the needs of small businesses throughout the US. Since 2004, the company has funded over $12 billion, providing approval in minutes and same-day funding in most cases.',
    },
    {
      name: 'paragraph2',
      label: 'Paragraph 2',
      type: 'textarea',
      default:
        'Backed by the latest technology and integrations with partners like Plaid®, Cardiff blends real-time financial analysis with personalized service, to deliver a reliable, transparent experience for business owners across industries like construction, restaurants, trucking, and more.',
    },
    {
      name: 'photoUrl',
      label: 'Hero photo',
      type: 'image',
      default: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/08/Cardiff-at-youtube.jpg',
    },
    { name: 'videoUrl', label: 'Video URL', type: 'url', default: 'https://www.youtube.com/@cardiffcompany' },
  ],
  values: {
    eyebrow: 'About Cardiff',
    title: 'A trusted leader in small business lending',
    paragraph1:
      'Cardiff, a small business lender based in San Diego, offers fast, flexible financing solutions tailored to the needs of small businesses throughout the US. Since 2004, the company has funded over $12 billion, providing approval in minutes and same-day funding in most cases.',
    paragraph2:
      'Backed by the latest technology and integrations with partners like Plaid®, Cardiff blends real-time financial analysis with personalized service, to deliver a reliable, transparent experience for business owners across industries like construction, restaurants, trucking, and more.',
    photoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/08/Cardiff-at-youtube.jpg',
    videoUrl: 'https://www.youtube.com/@cardiffcompany',
  },
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, ABOUT_POST_ID)).limit(1);
  if (!row) {
    console.error(`Post ${ABOUT_POST_ID} not found`);
    process.exit(1);
  }
  const parsed = JSON.parse(row.content);
  if (!Array.isArray(parsed.blocks)) {
    console.error(`Post ${ABOUT_POST_ID}: content.blocks is not an array`);
    process.exit(1);
  }
  const oldHero = parsed.blocks[0];
  if (oldHero?.id !== 'about-hero') {
    console.error(`Post ${ABOUT_POST_ID}: block[0].id is not 'about-hero' (was '${oldHero?.id}'); aborting`);
    process.exit(1);
  }
  parsed.blocks[0] = newHeroBlock;

  // The intro paragraphs are now duplicated by the hero. Remove the intro
  // section entirely so there's no awkward repetition right beneath the hero.
  const introIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'about-intro');
  if (introIdx >= 0) {
    parsed.blocks.splice(introIdx, 1);
    console.log(`Removed about-intro section (paragraphs now live in the hero).`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, ABOUT_POST_ID));
  console.log(`Updated post ${ABOUT_POST_ID}: replaced about-hero with html-render. New block count: ${parsed.blocks.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
