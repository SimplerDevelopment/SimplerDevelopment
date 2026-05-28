/**
 * Iteration 1: Learn / Articles page (post id 819).
 *
 * Biggest visual gap vs cardiff.co/learn/articles/:
 * the original site renders a 4-column layout below the hero — three white
 * "article cards" (Plan Your Retail Store / Why Travel Agencies / How to
 * Avoid Mid-Project Cash Crunches) plus a fourth column that's a stacked
 * sidebar CTA ("Working Capital up to $500K — Apply Now" white card on top
 * of a "Financing Excellence Since 2004" blue card). The port renders only
 * a single article (Plan Your Retail Store) in a centered 880px column with
 * no card chrome, no images, no other articles, no sidebar CTA.
 *
 * Fix: replace blocks `sec-1` (the orphan "Learn more from the Cardiff team!"
 * paragraph) and `sec-2` (the single article) with one `html-render`
 * `learn-articles-grid` block that draws the full 4-up row: three article
 * cards via data-repeat plus a static sidebar CTA panel. Hero and final-cta
 * are left untouched. Idempotent — replaces by id; either run lands at the
 * same final state.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 819;

const ARTICLES_GRID_HTML = `
<style>
  .cd-larts { background: #ffffff; padding: 72px 24px 80px 24px; }
  .cd-larts__inner { max-width: 1200px; margin: 0 auto; }
  .cd-larts__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; align-items: stretch; }
  .cd-larts__card { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 6px; padding: 26px 22px 22px 22px; display: flex; flex-direction: column; min-height: 360px; }
  .cd-larts__img { width: calc(100% + 44px); margin: -26px -22px 18px -22px; aspect-ratio: 16 / 10; object-fit: cover; display: block; background: #eef3f9; border-radius: 6px 6px 0 0; }
  .cd-larts__img[src=""], .cd-larts__img:not([src]) { display: none; }
  .cd-larts__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.02rem; font-weight: 800; color: #1c3370; letter-spacing: -0.005em; line-height: 1.32; margin: 0 0 14px 0; }
  .cd-larts__excerpt { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.92rem; line-height: 1.6; color: #525f7f; margin: 0 0 18px 0; flex: 1; }
  .cd-larts__more { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; color: #25418b; text-decoration: none; margin-top: auto; display: inline-block; }
  .cd-larts__more:hover { color: #ef6632; text-decoration: underline; }
  .cd-larts__sidebar { display: flex; flex-direction: column; gap: 0; }
  .cd-larts__cta-top { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 6px 6px 0 0; padding: 28px 24px 26px 24px; text-align: left; }
  .cd-larts__cta-eyebrow { font-family: 'Raleway', sans-serif; font-size: 1.15rem; font-weight: 800; color: #1c3370; margin: 0 0 6px 0; letter-spacing: -0.005em; }
  .cd-larts__cta-amount { font-family: 'Raleway', sans-serif; font-size: 1rem; color: #1c3370; margin: 0 0 6px 0; }
  .cd-larts__cta-big { font-family: 'Raleway', sans-serif; font-size: 2.4rem; font-weight: 800; color: #25418b; line-height: 1; letter-spacing: -0.02em; }
  .cd-larts__cta-line { font-family: 'Open Sans', sans-serif; font-size: 0.92rem; color: #1c3370; margin: 12px 0 2px 0; }
  .cd-larts__cta-strong { font-family: 'Raleway', sans-serif; font-size: 1rem; font-weight: 800; color: #1c3370; margin: 0 0 16px 0; }
  .cd-larts__cta-btn { display: inline-block; background: #5ac96f; color: #ffffff !important; font-family: 'Raleway', sans-serif; font-size: 0.95rem; font-weight: 800; letter-spacing: 0.05em; padding: 12px 26px; border-radius: 4px; text-decoration: none; text-transform: none; }
  .cd-larts__cta-btn:hover { background: #4ab85f; }
  .cd-larts__cta-bottom { background: #25418b; color: #ffffff; border-radius: 0 0 6px 6px; padding: 22px 24px 24px 24px; }
  .cd-larts__cta-rule { width: 36px; height: 2px; background: #ffffff; margin: 0 0 10px 0; opacity: 0.85; }
  .cd-larts__cta-foot-lead { font-family: 'Open Sans', sans-serif; font-size: 0.88rem; color: #ffffff; margin: 0 0 2px 0; opacity: 0.95; }
  .cd-larts__cta-foot-strong { font-family: 'Raleway', sans-serif; font-size: 1.05rem; font-weight: 800; color: #ffffff; margin: 0; letter-spacing: -0.005em; }
  @media (max-width: 1100px) {
    .cd-larts__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 640px) {
    .cd-larts__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-larts__card { min-height: 0; }
  }
</style>
<section class="cd-larts">
  <div class="cd-larts__inner">
    <div class="cd-larts__grid">
      <article class="cd-larts__card" data-repeat="articles">
        <img class="cd-larts__img" src="{{articles.image}}" alt="{{articles.title}}" loading="lazy" onerror="this.style.display='none'" />
        <h3 class="cd-larts__title" data-field="title">{{articles.title}}</h3>
        <p class="cd-larts__excerpt" data-field="excerpt">{{articles.excerpt}}</p>
        <a class="cd-larts__more" href="{{articles.url}}" data-field="ctaText">{{articles.ctaText}}</a>
      </article>
      <aside class="cd-larts__sidebar">
        <div class="cd-larts__cta-top">
          <p class="cd-larts__cta-eyebrow" data-field="ctaTitle">{{ctaTitle}}</p>
          <p class="cd-larts__cta-amount" data-field="ctaAmountLabel"><span>{{ctaAmountLabel}}</span> <span class="cd-larts__cta-big" data-field="ctaAmount">{{ctaAmount}}</span></p>
          <p class="cd-larts__cta-line" data-field="ctaApproval">{{ctaApproval}}</p>
          <p class="cd-larts__cta-strong" data-field="ctaFundingLine">{{ctaFundingLine}}</p>
          <a class="cd-larts__cta-btn" href="{{ctaButtonUrl}}" data-field="ctaButtonText">{{ctaButtonText}}</a>
        </div>
        <div class="cd-larts__cta-bottom">
          <div class="cd-larts__cta-rule"></div>
          <p class="cd-larts__cta-foot-lead" data-field="ctaFootLead">{{ctaFootLead}}</p>
          <p class="cd-larts__cta-foot-strong" data-field="ctaFootStrong">{{ctaFootStrong}}</p>
        </div>
      </aside>
    </div>
  </div>
</section>
`.trim();

const articlesBlock = {
  id: 'sec-articles',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 2,
  html: ARTICLES_GRID_HTML,
  fields: [
    {
      name: 'articles',
      label: 'Article cards',
      type: 'array' as const,
      itemFields: [
        { name: 'image', label: 'Image URL (blank = no image)', type: 'url' as const, default: '' },
        { name: 'title', label: 'Title', type: 'text' as const },
        { name: 'excerpt', label: 'Excerpt', type: 'text' as const },
        { name: 'ctaText', label: 'CTA text', type: 'text' as const, default: 'Read More' },
        { name: 'url', label: 'Link', type: 'url' as const, default: '#' },
      ],
    },
    { name: 'ctaTitle', label: 'Sidebar CTA title', type: 'text' as const, default: 'Working Capital' },
    { name: 'ctaAmountLabel', label: 'Amount label', type: 'text' as const, default: 'up to' },
    { name: 'ctaAmount', label: 'Amount', type: 'text' as const, default: '$500K' },
    { name: 'ctaApproval', label: 'Approval line', type: 'text' as const, default: 'Approval in minutes' },
    { name: 'ctaFundingLine', label: 'Funding line', type: 'text' as const, default: 'Funding same day' },
    { name: 'ctaButtonText', label: 'Button text', type: 'text' as const, default: 'Apply Now' },
    { name: 'ctaButtonUrl', label: 'Button URL', type: 'url' as const, default: '#' },
    { name: 'ctaFootLead', label: 'Footer lead', type: 'text' as const, default: 'Financing Excellence' },
    { name: 'ctaFootStrong', label: 'Footer strong', type: 'text' as const, default: 'Since 2004' },
  ],
  values: {
    articles: [
      {
        image: '',
        title: 'Plan Your Retail Store Financing Around Your Goals',
        excerpt:
          'Growing your retail store rarely happens by accident. You usually have to set goals and actively...',
        ctaText: 'Read More',
        url: 'https://cardiff.co/learn/plan-your-retail-store-financing-around-your-goals/',
      },
      {
        image: '',
        title: 'Why and When Travel Agencies Need Fast Access to Capital',
        excerpt:
          'Travel is a time-sensitive business where delays can easily cost you money. You attract fewer...',
        ctaText: 'Read More',
        url: 'https://cardiff.co/learn/why-and-when-travel-agencies-need-fast-access-to-capital/',
      },
      {
        image:
          'https://cardiff.co/wp-content/smush-webp/2026/03/how-to-avoid-mid-project-cash-crunches-on-big-construction-jobs.jpg.webp',
        title: 'How to Avoid Mid-Project Cash Crunches on Big Construction Jobs',
        excerpt:
          'Large construction jobs can raise your revenue, but they also increase your chances of a cash...',
        ctaText: 'Read More',
        url: 'https://cardiff.co/learn/avoid-cash-crunches-in-big-construction-projects-easily/',
      },
    ],
    ctaTitle: 'Working Capital',
    ctaAmountLabel: 'up to',
    ctaAmount: '$500K',
    ctaApproval: 'Approval in minutes',
    ctaFundingLine: 'Funding same day',
    ctaButtonText: 'Apply Now',
    ctaButtonUrl: '#apply',
    ctaFootLead: 'Financing Excellence',
    ctaFootStrong: 'Since 2004',
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

  // Remove existing sec-1, sec-2, sec-articles (any prior iteration).
  parsed.blocks = parsed.blocks.filter(
    (b: { id?: string }) => b?.id !== 'sec-1' && b?.id !== 'sec-2' && b?.id !== 'sec-articles',
  );

  // Insert articles block at order 2 (between hero and final-cta).
  // Reset orders so it's: hero=1, articles=2, final-cta=3.
  const hero = parsed.blocks.find((b: { id?: string }) => b?.id === 'hero-learn-articles');
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
    `Updated post ${POST_ID}: replaced sec-1/sec-2 with learn-articles-grid html-render. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
