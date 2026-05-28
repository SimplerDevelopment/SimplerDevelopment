/**
 * Iter 23: Add a "From The Blog" / recent-articles section to the cardiff-main
 * home (post 793). Articles are missing from the homepage — there are 45
 * published blog posts and the home doesn't surface any of them.
 *
 * Insertion point: BEFORE the existing `testimonials` section. The current top
 * level is (15 blocks):
 *   0 html-render home-hero    | 1 trust-badges     | 2 slider-section
 *   3 intro                    | 4 process          | 5 stats-band
 *   6 alt-lending              | 7 products         | 8 designed
 *   9 better-credit            | 10 mid-cta          | 11 why
 *   12 faq                     | 13 testimonials     | 14 final-cta-band
 *
 * After this iter it becomes 16 blocks:
 *   13 [NEW] home-articles  | 14 testimonials  | 15 final-cta-band
 *
 * Section structure (matches the iter22 home pattern):
 *   - Outer `section` id `home-articles`, light-blue band (#f6f9fc), 80px
 *     top/bottom padding, max-width 1200px.
 *   - heading "FROM THE BLOG" eyebrow (Raleway uppercase, brand orange).
 *   - heading H2 "Helpful Reads From Our Library" (Raleway 2.5rem, deep blue).
 *   - text subhead — short two-line explainer.
 *   - html-render `home-articles-grid` carrying:
 *       • a fixed 3-column grid wrapper (NOT data-repeat — the data-loop on the
 *         inner card handles the iteration; per the renderer-quirk learnings,
 *         `data-repeat` / `data-loop` on the grid collapses it to 1 column)
 *       • each card has cover image + title + published date + "Read More →"
 *       • placeholders: {{post.title}}, {{post.url}}, {{post.excerpt}},
 *         {{post.coverImage}}, {{post.publishedDate}} (publishedDate was just
 *         added to lib/blocks/html-render-loops.ts this session)
 *       • a footer "View all articles →" link to /learn-articles
 *   - loop config: source='posts', postType='blog', limit=3, orderBy='recent'
 *     (= publishedAt desc, per loops.ts)
 *
 * Renderer quirks respected:
 *   - NO `data-field` on any `<a>` element — it would replace the link's inner
 *     content with the URL string (see iter22 products-grid fix).
 *   - `data-loop="posts"` lives on the inner card `<a>`, NOT the grid wrapper.
 *   - All inline icons use Material Icons (per project rule, no emojis).
 *
 * Idempotent: re-running finds any block with id `home-articles` and REPLACES
 * it in-place at the same index. First-run inserts at index 13 (before
 * testimonials). Safe to re-run; never duplicates the block.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const SECTION_ID = 'home-articles';
const GRID_BLOCK_ID = 'home-articles-grid';

const ARTICLES_HTML = `
<style>
  .cd-harts { max-width: 1180px; margin: 0 auto; }
  .cd-harts__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; }
  .cd-harts__card { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; text-decoration: none; color: inherit; box-shadow: 0 8px 22px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
  .cd-harts__card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(28,51,112,0.14); border-color: #d6e0f2; }
  .cd-harts__imgwrap { width: 100%; aspect-ratio: 16 / 10; background: linear-gradient(135deg, #1c3370 0%, #25418b 100%); position: relative; overflow: hidden; }
  .cd-harts__imgwrap .material-icons { position: absolute; inset: 0; margin: auto; font-size: 56px; color: rgba(255,255,255,0.45); display: flex; align-items: center; justify-content: center; height: 56px; width: 56px; }
  .cd-harts__img { width: 100%; height: 100%; object-fit: cover; display: block; position: relative; z-index: 1; }
  .cd-harts__img[src=""], .cd-harts__img:not([src]) { display: none; }
  .cd-harts__body { padding: 22px 24px 18px 24px; display: flex; flex-direction: column; flex: 1; }
  .cd-harts__date { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em; color: #ef6632; text-transform: uppercase; margin: 0 0 10px 0; display: inline-flex; align-items: center; gap: 6px; }
  .cd-harts__date .material-icons { font-size: 14px; }
  .cd-harts__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; letter-spacing: -0.005em; line-height: 1.32; margin: 0 0 12px 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .cd-harts__excerpt { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9rem; line-height: 1.6; color: #525f7f; margin: 0 0 16px 0; flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .cd-harts__more { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; color: #25418b; text-transform: uppercase; display: inline-flex; align-items: center; gap: 6px; margin-top: auto; }
  .cd-harts__more .material-icons { font-size: 14px; transition: transform .2s ease; }
  .cd-harts__card:hover .cd-harts__more { color: #ef6632; }
  .cd-harts__card:hover .cd-harts__more .material-icons { transform: translateX(4px); }
  .cd-harts__footer { margin: 40px auto 0 auto; text-align: center; }
  .cd-harts__all { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; font-weight: 800; color: #ffffff; background: linear-gradient(135deg, #1c3370 0%, #25418b 100%); padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; letter-spacing: 0.03em; transition: transform .2s ease, box-shadow .2s ease; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-harts__all:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(28,51,112,0.32); }
  .cd-harts__all .material-icons { font-size: 18px; }
  @media (max-width: 900px) {
    .cd-harts__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-harts__grid { grid-template-columns: 1fr; gap: 18px; }
  }
</style>
<div class="cd-harts">
  <div class="cd-harts__grid">
    <a class="cd-harts__card" href="{{post.url}}" data-loop="posts">
      <div class="cd-harts__imgwrap">
        <span class="material-icons">article</span>
        <img class="cd-harts__img" src="{{post.coverImage}}" alt="{{post.title}}" loading="lazy" onerror="this.style.display='none'" />
      </div>
      <div class="cd-harts__body">
        <p class="cd-harts__date"><span class="material-icons">calendar_today</span> {{post.publishedDate}}</p>
        <h3 class="cd-harts__title">{{post.title}}</h3>
        <p class="cd-harts__excerpt">{{post.excerpt}}</p>
        <span class="cd-harts__more">Read More <span class="material-icons">arrow_forward</span></span>
      </div>
    </a>
  </div>
  <div class="cd-harts__footer">
    <a class="cd-harts__all" href="/learn-articles">View All Articles <span class="material-icons">arrow_forward</span></a>
  </div>
</div>
`.trim();

const eyebrowBlock = {
  type: 'text' as const,
  id: 'home-articles-eyebrow',
  order: 1,
  content: '<span style="font-family:Raleway,-apple-system,BlinkMacSystemFont,sans-serif;font-size:0.78rem;font-weight:800;letter-spacing:0.18em;color:#ef6632;text-transform:uppercase">From The Blog</span>',
  style: { textAlign: 'center' as const, margin: '0 auto 12px auto' },
};

const headingBlock = {
  type: 'heading' as const,
  id: 'home-articles-heading',
  order: 2,
  level: 2,
  content: 'Helpful Reads From Our Library',
  alignment: 'center' as const,
  style: {
    color: '#1c3370',
    fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
    fontSize: '2.5rem',
    fontWeight: '800',
    letterSpacing: '-0.015em',
    lineHeight: '1.18',
    margin: '0 auto 14px auto',
    maxWidth: '820px',
    textAlign: 'center',
  },
};

const dividerBlock = {
  type: 'text' as const,
  id: 'home-articles-divider',
  order: 3,
  content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 18px auto;border-radius:2px"></div>',
  style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
};

const subheadBlock = {
  type: 'text' as const,
  id: 'home-articles-subhead',
  order: 4,
  content: '<p style="font-family:Open Sans,-apple-system,BlinkMacSystemFont,sans-serif;font-size:1.0625rem;line-height:1.7;color:#525f7f;max-width:680px;margin:0 auto 44px auto;text-align:center">Practical guides on financing, cash flow, and growth — written for the small-business owners we serve every day.</p>',
  style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
};

const articlesBlock = {
  id: GRID_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 5,
  html: ARTICLES_HTML,
  loop: {
    source: 'posts' as const,
    postType: 'blog',
    limit: 3,
    orderBy: 'recent' as const,
  },
  fields: [],
  values: {},
};

const newSection = {
  id: SECTION_ID,
  type: 'section' as const,
  maxWidth: '1200px',
  style: {
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  blocks: [eyebrowBlock, headingBlock, dividerBlock, subheadBlock, articlesBlock],
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

  // Idempotency: if a block with id `home-articles` already exists, REPLACE
  // it at the same index. Otherwise, insert before `testimonials`.
  const existingIdx = parsed.blocks.findIndex(
    (b: { id?: string }) => b?.id === SECTION_ID,
  );
  if (existingIdx !== -1) {
    parsed.blocks[existingIdx] = newSection;
    console.log(`Replaced existing ${SECTION_ID} at index ${existingIdx} (idempotent re-run).`);
  } else {
    const testimonialsIdx = parsed.blocks.findIndex(
      (b: { id?: string }) => b?.id === 'testimonials',
    );
    if (testimonialsIdx === -1) {
      console.error(`Post ${POST_ID}: no testimonials block found; aborting`);
      process.exit(1);
    }
    parsed.blocks.splice(testimonialsIdx, 0, newSection);
    console.log(`Inserted ${SECTION_ID} at index ${testimonialsIdx} (before testimonials). New block count: ${parsed.blocks.length}`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
