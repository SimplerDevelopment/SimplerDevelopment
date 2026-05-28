/**
 * Iteration 1: Newsroom page (post id 826).
 *
 * Biggest visual gap vs cardiff.co/newsroom: the original site's "Latest News"
 * section is a 3-column card grid — each card is a tall white tile with a
 * large 16:10 photo on top and the headline + date + "Read More" link below.
 * The port currently renders these three latest-news items as plain text
 * H4 headings stacked in a center-aligned 880px column with no images, no
 * dates, no card chrome — visually it looks like a "Recent posts" list, not
 * the prominent press-room hero grid the original projects.
 *
 * Fix: replace blocks[2] (sec-2 "Latest News" section) with a single
 * `html-render` "latest-news-grid" block whose `cards` array holds the three
 * Latest News entries, each with image / headline / date / link — laid out
 * in a 3-up CSS grid that collapses to 1-col on mobile. Hero, Cardiff in
 * the Media, and final CTA remain untouched.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 826;

const LATEST_NEWS_HTML = `
<style>
  .cd-news { background: #ffffff; padding: 72px 24px 80px 24px; }
  .cd-news__inner { max-width: 1180px; margin: 0 auto; }
  .cd-news__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; font-weight: 800; letter-spacing: 0.04em; color: #25418b; text-transform: none; margin: 0 0 8px 0; }
  .cd-news__intro { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.98rem; line-height: 1.6; color: #4a5772; margin: 0 0 36px 0; }
  .cd-news__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-news__card { background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(28,51,112,0.08); transition: transform 0.18s ease, box-shadow 0.18s ease; display: flex; flex-direction: column; }
  .cd-news__card:hover { transform: translateY(-3px); box-shadow: 0 8px 22px rgba(28,51,112,0.14); }
  .cd-news__img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; display: block; background: #eef3f9; }
  .cd-news__body { padding: 22px 22px 24px 22px; display: flex; flex-direction: column; flex: 1; }
  .cd-news__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.08rem; font-weight: 700; color: #1c3370; letter-spacing: -0.005em; line-height: 1.35; margin: 0 0 14px 0; }
  .cd-news__date { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.82rem; color: #6c7a99; margin: 0 0 14px 0; }
  .cd-news__more { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #ef6632; text-decoration: none; margin-top: auto; display: inline-flex; align-items: center; gap: 6px; }
  .cd-news__more:hover { color: #25418b; }
  .cd-news__more::after { content: '\\203A'; font-size: 1rem; }
  @media (max-width: 960px) {
    .cd-news__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 640px) {
    .cd-news__grid { grid-template-columns: 1fr; gap: 18px; }
  }
</style>
<section class="cd-news">
  <div class="cd-news__inner">
    <p class="cd-news__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <p class="cd-news__intro" data-field="intro">{{intro}}</p>
    <div class="cd-news__grid">
      <article class="cd-news__card" data-repeat="cards">
        <img class="cd-news__img" src="{{cards.image}}" alt="{{cards.title}}" loading="lazy" />
        <div class="cd-news__body">
          <h3 class="cd-news__title" data-field="title">{{cards.title}}</h3>
          <p class="cd-news__date" data-field="date">{{cards.date}}</p>
          <a class="cd-news__more" href="{{cards.url}}" data-field="ctaText">{{cards.ctaText}}</a>
        </div>
      </article>
    </div>
  </div>
</section>
`.trim();

const latestNewsBlock = {
  id: 'sec-2',
  type: 'html-render' as const,
  width: 'full' as const,
  html: LATEST_NEWS_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: 'Latest News' },
    { name: 'intro', label: 'Intro', type: 'text' as const, default: '' },
    {
      name: 'cards',
      label: 'News cards',
      type: 'array' as const,
      itemFields: [
        { name: 'image', label: 'Image URL', type: 'url' as const },
        { name: 'title', label: 'Headline', type: 'text' as const },
        { name: 'date', label: 'Date', type: 'text' as const },
        { name: 'ctaText', label: 'CTA text', type: 'text' as const, default: 'Read More' },
        { name: 'url', label: 'Link', type: 'url' as const, default: '#' },
      ],
    },
  ],
  values: {
    eyebrow: 'Latest News',
    intro: 'Explore our latest features, interviews and press mentions.',
    cards: [
      {
        image:
          'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2026/05/dean-and-william.jpg',
        title: 'How Oil is Disrupting the U.S. Economy',
        date: 'May 19, 2026',
        ctaText: 'Read More',
        url: 'https://cardiff.co/newsroom/',
      },
      {
        image:
          'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2026/05/download.jpeg',
        title:
          'Michigan’s high gas prices, economic uncertainty raise summer tourism concerns',
        date: 'May 19, 2026',
        ctaText: 'Read More',
        url: 'https://cardiff.co/newsroom/',
      },
      {
        image:
          'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2026/05/bcec-ca-a-c-a-bc-c-f.jpeg',
        title: "California business owners ‘trapped’ in ‘vicious cycle’ as costs soar",
        date: 'May 19, 2026',
        ctaText: 'Read More',
        url: 'https://cardiff.co/newsroom/',
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

  // Idempotent: locate the block whose id is `sec-2` and swap it for the
  // html-render version. Either re-run (already html-render) or first run
  // (still the original `section`) both end up at the same final state.
  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sec-2');
  if (idx < 0) {
    console.error(`Post ${POST_ID}: no block with id 'sec-2' found; aborting`);
    process.exit(1);
  }
  // preserve original `order` if present
  const order = parsed.blocks[idx]?.order;
  parsed.blocks[idx] = order != null ? { ...latestNewsBlock, order } : latestNewsBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced sec-2 with latest-news html-render grid. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
