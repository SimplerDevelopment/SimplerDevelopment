/**
 * Iteration 2: Newsroom page (post id 826) — Featured News hero (sec-1).
 *
 * Gap vs cardiff.co/newsroom: the original "Featured News" section is a
 * 2-column split — left column has the small eyebrow ("Featured News") + a
 * large H2-style headline announcing the featured article + a "Read More"
 * link; right column is a tall blue-gradient card with an oversized white
 * "cardiff" wordmark. Below the 2-up split sits a 4-icon strip — Articles,
 * FAQs, Company Info, Press & Media Inquiries — each with a circular blue
 * outline icon, title, short description, and Read-More link. The port
 * currently shows these as a plain stacked text list on a flat panel.
 *
 * Fix: replace sec-1 with a single `html-render` "featured-news-hero" block
 * holding (a) the 2-col split with gradient cardiff card on the right and
 * (b) the 4-icon strip below. Idempotent — re-running the script swaps the
 * block in place, preserving `order`.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 826;

const FEATURED_NEWS_HTML = `
<style>
  .cd-fn { background: #f6f9fc; padding: 64px 24px 56px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-fn__inner { max-width: 1180px; margin: 0 auto; }
  .cd-fn__page-eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.82rem; font-weight: 800; letter-spacing: 0.14em; color: #1c89ef; text-transform: uppercase; margin: 0 0 28px 0; }
  .cd-fn__split { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; }
  .cd-fn__left { display: flex; flex-direction: column; }
  .cd-fn__eyebrow { font-family: 'Open Sans', sans-serif; font-size: 0.95rem; color: #4a5772; margin: 0 0 14px 0; }
  .cd-fn__headline { font-family: 'Raleway', sans-serif; font-size: 2.25rem; font-weight: 800; color: #0e1a3a; line-height: 1.18; letter-spacing: -0.01em; margin: 0 0 22px 0; }
  .cd-fn__more { font-family: 'Open Sans', sans-serif; font-size: 0.92rem; font-weight: 600; color: #1c89ef; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
  .cd-fn__more::after { content: '\\203A'; font-size: 1.05rem; line-height: 1; }
  .cd-fn__more:hover { color: #25418b; }
  .cd-fn__card { position: relative; aspect-ratio: 16 / 10; border-radius: 18px; overflow: hidden; box-shadow: 0 18px 40px rgba(28,51,112,0.18); background:
      radial-gradient(120% 90% at 20% 0%, #6da6ff 0%, #3b6fd6 38%, #1c3370 78%, #15265a 100%); display: flex; align-items: center; justify-content: center; }
  .cd-fn__card::after { content: ''; position: absolute; right: -22%; bottom: -38%; width: 110%; height: 110%; border-radius: 50%; background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), rgba(28,51,112,0.0) 60%), #1c3370; opacity: 0.55; }
  .cd-fn__mark { position: relative; z-index: 2; font-family: 'Raleway', sans-serif; font-weight: 700; color: #ffffff; font-size: 5.5rem; letter-spacing: -0.02em; }
  .cd-fn__strip { margin-top: 64px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; align-items: start; }
  .cd-fn__tile { display: flex; flex-direction: column; align-items: flex-start; }
  .cd-fn__icon { width: 44px; height: 44px; border-radius: 50%; background: #e6efff; color: #1c89ef; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; font-family: 'Material Icons'; font-size: 22px; }
  .cd-fn__tile-title { font-family: 'Raleway', sans-serif; font-size: 1.1rem; font-weight: 800; color: #0e1a3a; margin: 0 0 10px 0; }
  .cd-fn__tile-body { font-family: 'Open Sans', sans-serif; font-size: 0.92rem; line-height: 1.55; color: #4a5772; margin: 0 0 12px 0; }
  .cd-fn__tile-link { font-family: 'Open Sans', sans-serif; font-size: 0.88rem; font-weight: 600; color: #1c89ef; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; }
  .cd-fn__tile-link::after { content: '\\203A'; font-size: 1rem; }
  .cd-fn__tile-link:hover { color: #25418b; }
  @media (max-width: 960px) {
    .cd-fn__split { grid-template-columns: 1fr; gap: 32px; }
    .cd-fn__headline { font-size: 1.7rem; }
    .cd-fn__mark { font-size: 4rem; }
    .cd-fn__strip { grid-template-columns: repeat(2, 1fr); gap: 28px; }
  }
  @media (max-width: 560px) {
    .cd-fn__strip { grid-template-columns: 1fr; }
  }
</style>
<section class="cd-fn">
  <div class="cd-fn__inner">
    <p class="cd-fn__page-eyebrow" data-field="pageEyebrow">{{pageEyebrow}}</p>
    <div class="cd-fn__split">
      <div class="cd-fn__left">
        <p class="cd-fn__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
        <h2 class="cd-fn__headline" data-field="headline">{{headline}}</h2>
        <a class="cd-fn__more" href="{{readMoreUrl}}" data-field="readMoreText">{{readMoreText}}</a>
      </div>
      <div class="cd-fn__card" aria-hidden="true">
        <span class="cd-fn__mark" data-field="mark">{{mark}}</span>
      </div>
    </div>
    <div class="cd-fn__strip">
      <div class="cd-fn__tile" data-repeat="tiles">
        <span class="cd-fn__icon" aria-hidden="true">{{tiles.icon}}</span>
        <h3 class="cd-fn__tile-title" data-field="title">{{tiles.title}}</h3>
        <p class="cd-fn__tile-body" data-field="body">{{tiles.body}}</p>
        <a class="cd-fn__tile-link" href="{{tiles.url}}" data-field="linkText">{{tiles.linkText}}</a>
      </div>
    </div>
  </div>
</section>
`.trim();

const featuredNewsBlock = {
  id: 'sec-1',
  type: 'html-render' as const,
  width: 'full' as const,
  html: FEATURED_NEWS_HTML,
  fields: [
    { name: 'pageEyebrow', label: 'Page eyebrow', type: 'text' as const, default: 'NEWSROOM' },
    { name: 'eyebrow', label: 'Featured eyebrow', type: 'text' as const, default: 'Featured News' },
    { name: 'headline', label: 'Featured headline', type: 'text' as const },
    { name: 'readMoreText', label: 'Read more text', type: 'text' as const, default: 'Read More' },
    { name: 'readMoreUrl', label: 'Read more URL', type: 'url' as const, default: '#' },
    { name: 'mark', label: 'Card wordmark', type: 'text' as const, default: 'cardiff' },
    {
      name: 'tiles',
      label: 'Icon tiles',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' as const },
        { name: 'title', label: 'Title', type: 'text' as const },
        { name: 'body', label: 'Body', type: 'text' as const },
        { name: 'linkText', label: 'Link text', type: 'text' as const, default: 'Read More' },
        { name: 'url', label: 'URL', type: 'url' as const, default: '#' },
      ],
    },
  ],
  values: {
    pageEyebrow: 'NEWSROOM',
    eyebrow: 'Featured News',
    headline:
      'Cardiff, Inc. Announces Closing of Senior Credit Facility to Expand Small Business Lending Nationwide',
    readMoreText: 'Read More',
    readMoreUrl: 'https://cardiff.co/newsroom/',
    mark: 'cardiff',
    tiles: [
      {
        icon: 'article',
        title: 'Articles',
        body: "Industry insights and articles from America's Favorite Small Business Lender",
        linkText: 'Read More',
        url: 'https://cardiff.co/newsroom/',
      },
      {
        icon: 'help_outline',
        title: 'FAQs',
        body: "Get answers to your question about small business financing and Cardiff's products.",
        linkText: 'Read More',
        url: 'https://cardiff.co/faqs/',
      },
      {
        icon: 'info_outline',
        title: 'Company Information',
        body: 'Learn more about Cardiff and the team powering our company.',
        linkText: 'Learn More About Cardiff',
        url: 'https://cardiff.co/about/',
      },
      {
        icon: 'mail_outline',
        title: 'Press & Media Inquiries',
        body: 'media@cardiff.co',
        linkText: 'Contact Us',
        url: 'mailto:media@cardiff.co',
      },
    ],
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

  // Idempotent: locate sec-1 and swap for the html-render version, preserving
  // its `order`. Re-running ends at the same final state regardless of prior
  // sec-1 shape (original `section` or html-render from a previous run).
  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sec-1');
  if (idx < 0) {
    console.error(`Post ${POST_ID}: no block with id 'sec-1' found; aborting`);
    process.exit(1);
  }
  const order = parsed.blocks[idx]?.order;
  parsed.blocks[idx] = order != null ? { ...featuredNewsBlock, order } : featuredNewsBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced sec-1 with featured-news html-render hero. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
