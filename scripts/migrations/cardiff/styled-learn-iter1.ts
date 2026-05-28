/**
 * Iteration 1: Learn (Small Business Lending Resources) — post id 821.
 *
 * Biggest visual gap vs cardiff.co/learn/: the original page's body is built
 * around three large "resource category" strips — FAQ / Getting Ready / Using
 * Your Loan — each a horizontal row with a giant deep-blue title on the left
 * (~30% width) and a short description on the right. Below those strips is a
 * compact 2-column grid of related-article links (the COVID-era posts that
 * are currently the only thing showing in the port).
 *
 * The port currently has just the four COVID paragraphs rendered as plain
 * `text` blocks inside sec-1 — no category strips at all, so the page reads
 * like a wall of paragraphs sandwiched between hero and CTA.
 *
 * Fix: replace `sec-1` (the four plain text blocks) with a single
 * `html-render` block that renders:
 *   1) three resource-category strips (FAQ, Getting Ready, Using Your Loan)
 *   2) a 2-column grid of related-article links (the COVID content, preserved)
 */
import { config } from 'dotenv';
config({ path: '.env.local', override: true });
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 821;

const LEARN_BODY_HTML = `
<style>
  .cd-learn { background: #ffffff; padding: 0; }
  .cd-learn__strips { background: #ffffff; padding: 0 0 8px 0; }
  .cd-learn__strip { display: grid; grid-template-columns: minmax(260px, 360px) 1fr; gap: 48px; align-items: center; padding: 56px 32px; max-width: 1180px; margin: 0 auto; border-bottom: 1px solid #e6ecf3; transition: background-color 0.2s ease; }
  .cd-learn__strip:nth-child(even) { background: #f6f9fc; }
  .cd-learn__strip:hover { background: #eef3f9; }
  .cd-learn__strip-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 2.6rem; font-weight: 800; color: #1c3370; letter-spacing: -0.01em; line-height: 1.05; margin: 0; }
  .cd-learn__strip-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.05rem; line-height: 1.7; color: #4a5772; margin: 0; }
  .cd-learn__strip-desc a { color: #ef6632; font-weight: 700; text-decoration: none; border-bottom: 1px solid transparent; transition: border-color 0.18s ease; }
  .cd-learn__strip-desc a:hover { border-bottom-color: #ef6632; }
  @media (max-width: 760px) {
    .cd-learn__strip { grid-template-columns: 1fr; gap: 14px; padding: 40px 22px; }
    .cd-learn__strip-title { font-size: 2rem; }
  }

  .cd-learn__articles { background: #f6f9fc; padding: 64px 24px 80px 24px; }
  .cd-learn__articles-inner { max-width: 1180px; margin: 0 auto; }
  .cd-learn__articles-eyebrow { font-family: 'Raleway', sans-serif; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #ef6632; margin: 0 0 8px 0; text-align: center; }
  .cd-learn__articles-head { font-family: 'Raleway', sans-serif; font-size: 1.8rem; font-weight: 800; color: #1c3370; margin: 0 0 36px 0; text-align: center; letter-spacing: -0.01em; }
  .cd-learn__articles-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 28px; }
  .cd-learn__article { display: block; padding: 22px 24px; background: #ffffff; border-radius: 8px; border-left: 4px solid #25418b; box-shadow: 0 1px 3px rgba(28,51,112,0.06); font-family: 'Open Sans', sans-serif; color: #1c3370; font-size: 1.02rem; font-weight: 600; line-height: 1.45; text-decoration: none; transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
  .cd-learn__article:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(28,51,112,0.12); border-left-color: #ef6632; }
  .cd-learn__article::after { content: '\\2192'; margin-left: 8px; color: #ef6632; font-weight: 700; }
  @media (max-width: 760px) {
    .cd-learn__articles-grid { grid-template-columns: 1fr; }
  }
</style>
<section class="cd-learn">
  <div class="cd-learn__strips">
    <div class="cd-learn__strip" data-repeat="categories">
      <h2 class="cd-learn__strip-title" data-field="title">{{categories.title}}</h2>
      <p class="cd-learn__strip-desc" data-field="description">{{categories.description}}</p>
    </div>
  </div>

  <div class="cd-learn__articles">
    <div class="cd-learn__articles-inner">
      <p class="cd-learn__articles-eyebrow" data-field="articlesEyebrow">{{articlesEyebrow}}</p>
      <h3 class="cd-learn__articles-head" data-field="articlesHeading">{{articlesHeading}}</h3>
      <div class="cd-learn__articles-grid">
        <a class="cd-learn__article" href="{{articles.url}}" data-repeat="articles" data-field="title">{{articles.title}}</a>
      </div>
    </div>
  </div>
</section>
`.trim();

const learnBodyBlock = {
  id: 'learn-body',
  type: 'html-render' as const,
  width: 'full' as const,
  html: LEARN_BODY_HTML,
  fields: [
    {
      name: 'categories',
      label: 'Resource categories',
      type: 'array' as const,
      itemFields: [
        { name: 'title', label: 'Category title', type: 'text' as const },
        { name: 'description', label: 'Description', type: 'textarea' as const },
      ],
    },
    { name: 'articlesEyebrow', label: 'Articles eyebrow', type: 'text' as const, default: 'Featured Articles' },
    { name: 'articlesHeading', label: 'Articles heading', type: 'text' as const },
    {
      name: 'articles',
      label: 'Featured articles',
      type: 'array' as const,
      itemFields: [
        { name: 'title', label: 'Article title', type: 'text' as const },
        { name: 'url', label: 'Article URL', type: 'url' as const, default: '#' },
      ],
    },
  ],
  values: {
    categories: [
      {
        title: 'FAQ',
        description:
          'Want to learn a bit more about us? Check out our frequently asked questions to know the whos and whats around Cardiff.',
      },
      {
        title: 'Getting Ready',
        description:
          'It can be quite the daunting process when you’re prepping for a loan. At Cardiff, we want to make sure you’re ready to get started.',
      },
      {
        title: 'Using Your Loan',
        description:
          'When you get a loan from Cardiff, there’s a whole host of ways you can use it to grow your business. Find out how!',
      },
    ],
    articlesEyebrow: 'Featured Articles',
    articlesHeading: 'Changing Times & Small Business Resources',
    articles: [
      {
        title: 'Changing Times and the Coronavirus Pandemic',
        url: '#',
      },
      {
        title: 'How to Weather Coronavirus as a Small Business Owner',
        url: '#',
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

  // Idempotent: if a previous run already inserted `learn-body`, replace it.
  // Otherwise, expect the original sec-1 at index 1 and swap it in place.
  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'learn-body');
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = learnBodyBlock;
    console.log(`Replaced existing learn-body at index ${existingIdx} (re-run).`);
  } else {
    if (parsed.blocks[1]?.id !== 'sec-1') {
      console.error(
        `Post ${POST_ID}: expected blocks[1].id == 'sec-1' but got ${parsed.blocks[1]?.id}; aborting`,
      );
      process.exit(1);
    }
    parsed.blocks.splice(1, 1, learnBodyBlock);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced sec-1 with learn-body html-render. New block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
