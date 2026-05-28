/**
 * Iter 11 (newsroom, post 826): Replace the static 3-card "Latest News" grid
 * (sec-2) with a live `data-loop="posts"` over the `news` post type at
 * `limit: 12`, and add real numbered pagination via `data-pagination`.
 *
 * Why this change:
 *   Iters 1-10 layered design polish (hero, browse-by-topic, stats, hub
 *   3-up, in-the-media tabs, press contact, press kit, subscribe band, final
 *   CTA). The "Latest News" sec-2 was always hand-authored — three picked
 *   cards with hard-coded titles, dates, and image URLs that pointed at the
 *   wpengine origin. Cardiff has 143 published `news` posts on this site;
 *   the newsroom should be a real catalog, not a snapshot of three.
 *
 *   This iter uses the new posts-loop pagination support from
 *   lib/blocks/html-render-loops.ts to:
 *     - drive 12 cards per page from the `news` post type
 *       (`orderBy: 'recent'`, `limit: 12`)
 *     - render the same Latest News design language (Raleway titles, navy/
 *       orange accents, blue card-shadow hover) with `{{post.title}}`,
 *       `{{post.coverImage}}`, `{{post.url}}`, and a formatted publish date
 *     - replace the static end-of-list state with a `data-pagination` `<nav>`
 *       (prev / numbered pages / next) that respects the request's
 *       `?page=N` query param. `data-pagination-pages` is a `<ul>` whose
 *       single `<li>` is repeated 1..totalPages by the server.
 *
 * Renderer quirks respected:
 *   - `data-loop="posts"` lives on the CARD `<article>`, not on the
 *     `.cd-news__grid` wrapper.
 *   - No `data-field` on `<a>` elements — the renderer would clobber inner
 *     content. Card markup uses placeholders only.
 *   - The 3-up grid becomes a 4-up grid because 12 cards / 3 = 4 rows ×
 *     3 cols is fine but breaks responsively (more rows means more scroll);
 *     keep grid `repeat(3, 1fr)` and let it flow to 4 rows on page 1.
 *
 * Brand palette only: #1c3370 navy, #25418b mid-blue, #5ac96f green,
 * #ef6632 orange, #ffb798 peach. Raleway/Open Sans. Material Icons.
 *
 * Idempotent:
 *   - rewrites block id `sec-2` in place (preserves order = 2).
 *   - safe to re-run; identical final state.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 826;
const BLOCK_ID = 'sec-2';

const NEWS_HTML = `
<style>
  .cd-news { background: #ffffff; padding: 56px 24px 64px 24px; }
  .cd-news__inner { max-width: 1180px; margin: 0 auto; }
  .cd-news__eyebrow { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; font-weight: 800; letter-spacing: 0.04em; color: #25418b; text-transform: none; margin: 0 0 8px 0; }
  .cd-news__intro { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.98rem; line-height: 1.6; color: #4a5772; margin: 0 0 36px 0; }
  .cd-news__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-news__card { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(28,51,112,0.05); transition: transform 0.18s ease, box-shadow 0.18s ease; display: flex; flex-direction: column; text-decoration: none; color: inherit; }
  .cd-news__card:hover { transform: translateY(-3px); box-shadow: 0 8px 22px rgba(28,51,112,0.14); }
  .cd-news__imgwrap { width: 100%; aspect-ratio: 16 / 10; background: linear-gradient(135deg, #1c3370 0%, #25418b 100%); position: relative; overflow: hidden; }
  .cd-news__imgwrap .material-icons { position: absolute; inset: 0; margin: auto; width: 56px; height: 56px; font-size: 56px; color: rgba(255,255,255,0.45); display: flex; align-items: center; justify-content: center; }
  .cd-news__img { width: 100%; height: 100%; object-fit: cover; display: block; position: relative; z-index: 1; }
  .cd-news__img[src=""], .cd-news__img:not([src]) { display: none; }
  .cd-news__body { padding: 22px 22px 24px 22px; display: flex; flex-direction: column; flex: 1; }
  .cd-news__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.08rem; font-weight: 700; color: #1c3370; letter-spacing: -0.005em; line-height: 1.35; margin: 0 0 14px 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .cd-news__date { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.82rem; color: #6c7a99; margin: 0 0 14px 0; }
  .cd-news__more { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #ef6632; margin-top: auto; display: inline-flex; align-items: center; gap: 6px; }
  .cd-news__more .material-icons { font-size: 14px; transition: transform 0.18s; }
  .cd-news__card:hover .cd-news__more { color: #25418b; }
  .cd-news__card:hover .cd-news__more .material-icons { transform: translateX(3px); }

  /* pagination */
  .cd-news__pg { margin: 36px 0 0 0; display: flex; justify-content: center; align-items: center; gap: 4px; flex-wrap: wrap; font-family: 'Raleway', sans-serif; }
  .cd-news__pg-meta { font-family: 'Open Sans', sans-serif; font-size: 0.82rem; color: #6c7a99; flex-basis: 100%; text-align: center; margin: 0 0 10px 0; }
  .cd-news__pg-step { display: inline-flex; align-items: center; gap: 4px; padding: 8px 14px; border: 1px solid #d8e0ec; border-radius: 4px; font-size: 0.84rem; font-weight: 700; color: #25418b; text-decoration: none; background: #ffffff; transition: background 0.15s, border-color 0.15s; }
  .cd-news__pg-step:hover { background: #25418b; color: #ffffff; border-color: #25418b; }
  .cd-news__pg-step[href="#"] { color: #b5bccd; border-color: #ebeef3; pointer-events: none; background: #f5f7fa; }
  .cd-news__pg-step .material-icons { font-size: 16px; }
  .cd-news__pg-pages { list-style: none; margin: 0; padding: 0; display: inline-flex; gap: 4px; flex-wrap: wrap; }
  .cd-news__pg-pages li { display: inline-block; }
  .cd-news__pg-num { display: inline-flex; min-width: 36px; height: 36px; padding: 0 10px; align-items: center; justify-content: center; border: 1px solid #d8e0ec; border-radius: 4px; font-size: 0.84rem; font-weight: 700; color: #25418b; text-decoration: none; background: #ffffff; transition: background 0.15s, border-color 0.15s; }
  .cd-news__pg-num:hover { background: #25418b; color: #ffffff; border-color: #25418b; }
  .cd-news__pg-pages li.is-current .cd-news__pg-num { background: #1c3370; color: #ffffff; border-color: #1c3370; pointer-events: none; }

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
      <a class="cd-news__card" href="{{post.url}}" data-loop="posts">
        <div class="cd-news__imgwrap">
          <span class="material-icons">article</span>
          <img class="cd-news__img" src="{{post.coverImage}}" alt="{{post.title}}" loading="lazy" onerror="this.style.display='none'" />
        </div>
        <div class="cd-news__body">
          <h3 class="cd-news__title">{{post.title}}</h3>
          <p class="cd-news__date">{{post.publishedDate}}</p>
          <span class="cd-news__more">Read More <span class="material-icons">arrow_forward</span></span>
        </div>
      </a>
    </div>
    <nav class="cd-news__pg" data-pagination aria-label="Newsroom pagination">
      <p class="cd-news__pg-meta">Page {{pagination.currentPage}} of {{pagination.totalPages}}</p>
      <a class="cd-news__pg-step" href="{{pagination.prevUrl}}" aria-label="Previous page"><span class="material-icons">chevron_left</span> Prev</a>
      <ul class="cd-news__pg-pages" data-pagination-pages>
        <li><a class="cd-news__pg-num" href="{{page.url}}">{{page.number}}</a></li>
      </ul>
      <a class="cd-news__pg-step" href="{{pagination.nextUrl}}" aria-label="Next page">Next <span class="material-icons">chevron_right</span></a>
    </nav>
  </div>
</section>
`.trim();

const newsBlock = {
  id: BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 2,
  html: NEWS_HTML,
  loop: {
    source: 'posts' as const,
    postType: 'news',
    limit: 12,
    orderBy: 'recent' as const,
  },
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: 'Latest News' },
    { name: 'intro', label: 'Intro paragraph', type: 'textarea' as const, default: 'Explore our latest features, interviews and press mentions.' },
  ],
  values: {
    eyebrow: 'Latest News',
    intro: 'Explore our latest features, interviews and press mentions.',
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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const prev = parsed.blocks[idx];
  parsed.blocks[idx] = {
    ...newsBlock,
    order: prev.order ?? newsBlock.order,
    // Carry forward any user-edited eyebrow/intro overrides.
    values: { ...newsBlock.values, ...(prev.values || {}) },
  };
  // Strip any stale `cards` value left over from the static version.
  if ('cards' in parsed.blocks[idx].values) {
    delete parsed.blocks[idx].values.cards;
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: rewrote ${BLOCK_ID} as posts-loop news (limit 12, paginated). Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
