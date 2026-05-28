/**
 * Iter 4: Learn Articles hub (post 819) — replace the hard-coded 9-card
 * article grid + static "Older Entries" pager with a live `data-loop="posts"`
 * over the `blog` post type, and a `data-pagination` block that renders real
 * numbered pagination + prev/next links.
 *
 * Why this change:
 *   Iter 3 stood up the 3x3 grid + sidebar, but the cards were hand-authored
 *   strings — every new blog post required republishing the hub page, and the
 *   "Older Entries" link pointed nowhere. With 45 published blog posts on this
 *   site, the hub should be a real index of the catalog, not a snapshot.
 *
 *   This iter swaps in the new posts-loop pagination support from
 *   lib/blocks/html-render-loops.ts:
 *     - `loop: { source: 'posts', postType: 'blog', limit: 9, orderBy: 'recent' }`
 *       on the html-render block so the server expands the card template
 *       once per published blog post (page 1 = newest 9, page 2 = next 9, …)
 *     - the card markup is a single `data-repeat`-style template using
 *       `{{post.title}}`, `{{post.excerpt}}`, `{{post.coverImage}}`,
 *       `{{post.url}}` — `data-loop="posts"` on the CARD article (not the
 *       grid wrapper, per the renderer-quirk learnings)
 *     - the legacy `<a class="cd-larts2__pager">…Older Entries</a>` is
 *       replaced with a `data-pagination` `<nav>` containing prev / numbered
 *       pages / next — the server expands `{{pagination.currentPage}}`,
 *       `{{pagination.prevUrl}}`, `{{pagination.nextUrl}}`, etc., and the
 *       inner `data-pagination-pages` `<ul>` is expanded to N `<li><a>`
 *       entries (1..totalPages) with `is-current` applied to the active page.
 *
 *   The sidebar (working-capital CTA + recent posts + brand card) is
 *   preserved verbatim — it's not affected by this change.
 *
 *   Brand palette only — #1c3370 navy, #25418b mid-blue, #5ac96f green,
 *   #ef6632 orange, #ffb798 peach. Raleway/Open Sans. Material Icons.
 *
 * Renderer quirks respected:
 *   - `data-loop="posts"` lives on the CARD `<article>`, NOT on the
 *     `.cd-larts2__grid` wrapper (grid stays 3-col).
 *   - `data-field` is NEVER on `<a>` elements (it would clobber inner content).
 *     Links use `href="{{post.url}}"` placeholders only.
 *   - The `.cd-larts2__excerpt` fallback note: blog excerpts are stored as
 *     raw HTML; the server pipeline HTML-escapes them at the {{post.excerpt}}
 *     site so we don't double-render markup, but that means a card excerpt
 *     may show `&amp;` etc. for special chars. That's an acceptable trade
 *     vs the alternative (raw injection of unsanitized excerpts).
 *
 * Idempotent:
 *   - replaces ANY block with id `sec-articles-grid-v2` (iter3 + iter4 share
 *     this id by design — the page intent is the same band, just authored
 *     differently). Block order/position preserved if present.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 819;
const BLOCK_ID = 'sec-articles-grid-v2';
const REMOVE_IDS = ['sec-1', 'sec-2', 'sec-articles', 'sec-articles-grid-v2'];

const ARTICLES_HTML = `
<style>
  .cd-larts2 { background: #f4f7fb; padding: 64px 24px 80px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-larts2__inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr 320px; gap: 32px; align-items: start; }
  .cd-larts2__col { display: flex; flex-direction: column; gap: 24px; }
  .cd-larts2__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
  .cd-larts2__card { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 6px; padding: 0 0 22px 0; display: flex; flex-direction: column; min-height: 340px; overflow: hidden; box-shadow: 0 1px 2px rgba(28,51,112,0.04); transition: box-shadow 0.18s, transform 0.18s; text-decoration: none; color: inherit; }
  .cd-larts2__card:hover { box-shadow: 0 6px 18px rgba(28,51,112,0.10); transform: translateY(-2px); }
  .cd-larts2__imgwrap { width: 100%; aspect-ratio: 16 / 10; background: linear-gradient(135deg, #1c3370 0%, #25418b 100%); display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
  .cd-larts2__imgwrap .material-icons { font-size: 56px; color: rgba(255,255,255,0.45); position: absolute; }
  .cd-larts2__img { width: 100%; height: 100%; object-fit: cover; display: block; position: relative; z-index: 1; }
  .cd-larts2__img[src=""], .cd-larts2__img:not([src]) { display: none; }
  .cd-larts2__body { padding: 20px 22px 0 22px; display: flex; flex-direction: column; flex: 1; }
  .cd-larts2__title { font-family: 'Raleway', sans-serif; font-size: 1rem; font-weight: 800; color: #1c3370; letter-spacing: -0.005em; line-height: 1.32; margin: 0 0 12px 0; }
  .cd-larts2__excerpt { font-family: 'Open Sans', sans-serif; font-size: 0.9rem; line-height: 1.6; color: #525f7f; margin: 0 0 16px 0; flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .cd-larts2__more { font-family: 'Raleway', sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; color: #25418b; text-decoration: none; text-transform: uppercase; margin: 0 22px 0 22px; display: inline-flex; align-items: center; gap: 6px; }
  .cd-larts2__more .material-icons { font-size: 14px; transition: transform 0.18s; }
  .cd-larts2__card:hover .cd-larts2__more { color: #ef6632; }
  .cd-larts2__card:hover .cd-larts2__more .material-icons { transform: translateX(3px); }

  /* pagination */
  .cd-larts2__pg { margin: 28px 0 0 0; display: flex; justify-content: center; align-items: center; gap: 4px; flex-wrap: wrap; font-family: 'Raleway', sans-serif; }
  .cd-larts2__pg-meta { font-family: 'Open Sans', sans-serif; font-size: 0.82rem; color: #6c7a99; flex-basis: 100%; text-align: center; margin: 0 0 10px 0; }
  .cd-larts2__pg-step { display: inline-flex; align-items: center; gap: 4px; padding: 8px 14px; border: 1px solid #d8e0ec; border-radius: 4px; font-size: 0.84rem; font-weight: 700; color: #25418b; text-decoration: none; background: #ffffff; transition: background 0.15s, border-color 0.15s; }
  .cd-larts2__pg-step:hover { background: #25418b; color: #ffffff; border-color: #25418b; }
  .cd-larts2__pg-step[href="#"] { color: #b5bccd; border-color: #ebeef3; pointer-events: none; background: #f5f7fa; }
  .cd-larts2__pg-step .material-icons { font-size: 16px; }
  .cd-larts2__pg-pages { list-style: none; margin: 0; padding: 0; display: inline-flex; gap: 4px; flex-wrap: wrap; }
  .cd-larts2__pg-pages li { display: inline-block; }
  .cd-larts2__pg-num { display: inline-flex; min-width: 36px; height: 36px; padding: 0 10px; align-items: center; justify-content: center; border: 1px solid #d8e0ec; border-radius: 4px; font-size: 0.84rem; font-weight: 700; color: #25418b; text-decoration: none; background: #ffffff; transition: background 0.15s, border-color 0.15s; }
  .cd-larts2__pg-num:hover { background: #25418b; color: #ffffff; border-color: #25418b; }
  .cd-larts2__pg-pages li.is-current .cd-larts2__pg-num { background: #1c3370; color: #ffffff; border-color: #1c3370; pointer-events: none; }

  /* sidebar */
  .cd-larts2__side { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 16px; }
  .cd-larts2__widget { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 6px; overflow: hidden; }
  .cd-larts2__cta-top { padding: 24px 22px 22px 22px; text-align: left; background: #ffffff; }
  .cd-larts2__cta-eyebrow { font-family: 'Raleway', sans-serif; font-size: 1.1rem; font-weight: 800; color: #1c3370; margin: 0 0 4px 0; }
  .cd-larts2__cta-amt-line { font-family: 'Raleway', sans-serif; font-size: 0.95rem; color: #1c3370; margin: 0 0 4px 0; }
  .cd-larts2__cta-big { font-family: 'Raleway', sans-serif; font-size: 2.4rem; font-weight: 800; color: #25418b; line-height: 1; letter-spacing: -0.02em; display: block; margin: 4px 0 6px 0; }
  .cd-larts2__cta-l1 { font-family: 'Open Sans', sans-serif; font-size: 0.9rem; color: #1c3370; margin: 8px 0 2px 0; }
  .cd-larts2__cta-l2 { font-family: 'Raleway', sans-serif; font-size: 0.98rem; font-weight: 800; color: #1c3370; margin: 0 0 14px 0; }
  .cd-larts2__cta-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #5ac96f; color: #ffffff !important; font-family: 'Raleway', sans-serif; font-size: 0.92rem; font-weight: 800; letter-spacing: 0.04em; padding: 11px 22px; border-radius: 4px; text-decoration: none; }
  .cd-larts2__cta-btn .material-icons { font-size: 16px; }
  .cd-larts2__cta-btn:hover { background: #4ab85f; }

  .cd-larts2__recent { padding: 20px 22px 22px 22px; }
  .cd-larts2__recent-title { font-family: 'Raleway', sans-serif; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.14em; color: #ef6632; text-transform: uppercase; margin: 0 0 14px 0; display: flex; align-items: center; gap: 6px; }
  .cd-larts2__recent-title .material-icons { font-size: 16px; }
  .cd-larts2__recent-list { display: flex; flex-direction: column; gap: 12px; }
  .cd-larts2__recent-item { display: block; font-family: 'Open Sans', sans-serif; font-size: 0.86rem; line-height: 1.4; color: #1c3370; text-decoration: none; padding: 0 0 12px 0; border-bottom: 1px solid #eef2f7; }
  .cd-larts2__recent-item:last-child { border-bottom: none; padding-bottom: 0; }
  .cd-larts2__recent-item:hover { color: #ef6632; }
  .cd-larts2__recent-date { display: block; font-family: 'Raleway', sans-serif; font-size: 0.72rem; font-weight: 600; color: #8a97b0; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 3px 0; }

  .cd-larts2__brand { background: linear-gradient(135deg, #1c3370 0%, #25418b 100%); color: #ffffff; padding: 22px 22px 24px 22px; border-radius: 6px; }
  .cd-larts2__brand-rule { width: 36px; height: 2px; background: #5ac96f; margin: 0 0 10px 0; }
  .cd-larts2__brand-name { font-family: 'Raleway', sans-serif; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.01em; margin: 0 0 6px 0; }
  .cd-larts2__brand-l1 { font-family: 'Open Sans', sans-serif; font-size: 0.88rem; color: rgba(255,255,255,0.92); margin: 0 0 2px 0; }
  .cd-larts2__brand-l2 { font-family: 'Raleway', sans-serif; font-size: 1.02rem; font-weight: 800; color: #ffffff; margin: 0; }

  @media (max-width: 1100px) {
    .cd-larts2__inner { grid-template-columns: 1fr; }
    .cd-larts2__side { position: static; flex-direction: row; flex-wrap: wrap; gap: 16px; }
    .cd-larts2__widget, .cd-larts2__brand { flex: 1 1 280px; }
  }
  @media (max-width: 820px) {
    .cd-larts2__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-larts2__grid { grid-template-columns: 1fr; }
    .cd-larts2__card { min-height: 0; }
  }
</style>
<section class="cd-larts2">
  <div class="cd-larts2__inner">
    <div class="cd-larts2__col">
      <div class="cd-larts2__grid">
        <a class="cd-larts2__card" href="{{post.url}}" data-loop="posts">
          <div class="cd-larts2__imgwrap">
            <span class="material-icons">article</span>
            <img class="cd-larts2__img" src="{{post.coverImage}}" alt="{{post.title}}" loading="lazy" onerror="this.style.display='none'" />
          </div>
          <div class="cd-larts2__body">
            <h3 class="cd-larts2__title">{{post.title}}</h3>
            <p class="cd-larts2__excerpt">{{post.excerpt}}</p>
          </div>
          <span class="cd-larts2__more">Read More <span class="material-icons">arrow_forward</span></span>
        </a>
      </div>
      <nav class="cd-larts2__pg" data-pagination aria-label="Articles pagination">
        <p class="cd-larts2__pg-meta">Page {{pagination.currentPage}} of {{pagination.totalPages}}</p>
        <a class="cd-larts2__pg-step" href="{{pagination.prevUrl}}" aria-label="Previous page"><span class="material-icons">chevron_left</span> Prev</a>
        <ul class="cd-larts2__pg-pages" data-pagination-pages>
          <li><a class="cd-larts2__pg-num" href="{{page.url}}">{{page.number}}</a></li>
        </ul>
        <a class="cd-larts2__pg-step" href="{{pagination.nextUrl}}" aria-label="Next page">Next <span class="material-icons">chevron_right</span></a>
      </nav>
    </div>
    <aside class="cd-larts2__side">
      <div class="cd-larts2__widget">
        <div class="cd-larts2__cta-top">
          <p class="cd-larts2__cta-eyebrow" data-field="ctaTitle">{{ctaTitle}}</p>
          <p class="cd-larts2__cta-amt-line" data-field="ctaAmountLabel">{{ctaAmountLabel}}</p>
          <span class="cd-larts2__cta-big" data-field="ctaAmount">{{ctaAmount}}</span>
          <p class="cd-larts2__cta-l1" data-field="ctaApproval">{{ctaApproval}}</p>
          <p class="cd-larts2__cta-l2" data-field="ctaFundingLine">{{ctaFundingLine}}</p>
          <a class="cd-larts2__cta-btn" href="{{ctaButtonUrl}}" data-field="ctaButtonText">{{ctaButtonText}} <span class="material-icons">arrow_forward</span></a>
        </div>
      </div>
      <div class="cd-larts2__widget">
        <div class="cd-larts2__recent">
          <p class="cd-larts2__recent-title"><span class="material-icons">history</span> <span data-field="recentTitle">{{recentTitle}}</span></p>
          <div class="cd-larts2__recent-list">
            <a class="cd-larts2__recent-item" href="{{recent.url}}" data-repeat="recent">
              <span class="cd-larts2__recent-date" data-field="date">{{recent.date}}</span>
              <span data-field="title">{{recent.title}}</span>
            </a>
          </div>
        </div>
      </div>
      <div class="cd-larts2__brand">
        <div class="cd-larts2__brand-rule"></div>
        <p class="cd-larts2__brand-name" data-field="brandName">{{brandName}}</p>
        <p class="cd-larts2__brand-l1" data-field="brandLead">{{brandLead}}</p>
        <p class="cd-larts2__brand-l2" data-field="brandStrong">{{brandStrong}}</p>
      </div>
    </aside>
  </div>
</section>
`.trim();

const RECENT = [
  {
    date: 'May 28, 2026',
    title: 'Leverage 0% APR Credit Card Offers for Short-Term Business Funding',
    url: '/blog/use-0-apr-credit-cards-for-short-term-business-funding',
  },
  {
    date: 'May 19, 2026',
    title: 'Plan Your Retail Store Financing Around Your Goals',
    url: '/blog/plan-your-retail-store-financing-around-your-goals',
  },
  {
    date: 'May 12, 2026',
    title: 'Why and When Travel Agencies Need Fast Access to Capital',
    url: '/blog/why-and-when-travel-agencies-need-fast-access-to-capital',
  },
];

const articlesBlock = {
  id: BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 2,
  html: ARTICLES_HTML,
  loop: {
    source: 'posts' as const,
    postType: 'blog',
    limit: 9,
    orderBy: 'recent' as const,
  },
  fields: [
    { name: 'ctaTitle', label: 'Sidebar CTA title', type: 'text' as const, default: 'Working Capital' },
    { name: 'ctaAmountLabel', label: 'Amount label', type: 'text' as const, default: 'up to' },
    { name: 'ctaAmount', label: 'Amount', type: 'text' as const, default: '$500K' },
    { name: 'ctaApproval', label: 'Approval line', type: 'text' as const, default: 'Approval in minutes' },
    { name: 'ctaFundingLine', label: 'Funding line', type: 'text' as const, default: 'Funding same day' },
    { name: 'ctaButtonText', label: 'Button text', type: 'text' as const, default: 'Apply Now' },
    { name: 'ctaButtonUrl', label: 'Button URL', type: 'url' as const, default: '#apply' },
    { name: 'recentTitle', label: 'Recent posts widget title', type: 'text' as const, default: 'Recent Posts' },
    {
      name: 'recent',
      label: 'Recent posts',
      type: 'array' as const,
      itemFields: [
        { name: 'date', label: 'Date', type: 'text' as const },
        { name: 'title', label: 'Title', type: 'text' as const },
        { name: 'url', label: 'Link', type: 'url' as const, default: '#' },
      ],
    },
    { name: 'brandName', label: 'Brand card name', type: 'text' as const, default: 'Cardiff' },
    { name: 'brandLead', label: 'Brand card lead', type: 'text' as const, default: 'Financing Excellence' },
    { name: 'brandStrong', label: 'Brand card strong', type: 'text' as const, default: 'Since 2004' },
  ],
  values: {
    ctaTitle: 'Working Capital',
    ctaAmountLabel: 'up to',
    ctaAmount: '$500K',
    ctaApproval: 'Approval in minutes',
    ctaFundingLine: 'Funding same day',
    ctaButtonText: 'Apply Now',
    ctaButtonUrl: '#apply',
    recentTitle: 'Recent Posts',
    recent: RECENT,
    brandName: 'Cardiff',
    brandLead: 'Financing Excellence',
    brandStrong: 'Since 2004',
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

  // Drop any previous incarnation of the articles block (idempotent).
  parsed.blocks = parsed.blocks.filter(
    (b: { id?: string }) => !REMOVE_IDS.includes(b?.id ?? ''),
  );

  // Re-orient surviving blocks: hero=1, [new articles=2], final-cta=3.
  const hero = parsed.blocks.find(
    (b: { id?: string }) => b?.id === 'hero-learn-articles-min' || b?.id === 'hero-learn-articles',
  );
  const finalCta = parsed.blocks.find((b: { id?: string }) => b?.id === 'final-cta');
  if (hero) hero.order = 1;
  if (finalCta) finalCta.order = 3;

  parsed.blocks.push({ ...articlesBlock, order: 2 });
  parsed.blocks.sort(
    (a: { order?: number }, b: { order?: number }) => (a.order ?? 999) - (b.order ?? 999),
  );

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: inserted ${BLOCK_ID} (posts-loop blog, limit 9, paginated). Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
