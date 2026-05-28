/**
 * Iter 3: Learn Articles hub (post 819) — expand the 3-tile grid into the
 * full 3x3 (9 article) catalog the original ships, and rebuild the sidebar
 * as three stacked widgets (Working Capital CTA + Recent Posts + Since 2004
 * card), matching cardiff.co/learn/articles/.
 *
 * Why this single change:
 *   Iter 1 stood up a 3-card row + 1 sidebar. Iter 2 trimmed the hero. The
 *   biggest remaining gap vs the original is *information density*: cardiff.co
 *   renders 9 articles in a 3x3 grid and a 3-widget sidebar. The port still
 *   shows 3 articles + 1 widget. Visitors landing on /learn-articles see a
 *   sparse-looking blog index instead of a real content library.
 *
 *   This iter does not change the hero or final-cta. It only replaces
 *   `sec-articles` with a denser `sec-articles-grid-v2` html-render that:
 *     - lays out the page as a 2-column shell: left = 3x3 article grid,
 *       right = 320px sticky sidebar
 *     - article cards have lazy images (real cardiff.co webp URLs) with a
 *       JS-free placeholder fallback for image-less posts (cards 7-9 in
 *       the source are intentionally image-less)
 *     - sidebar widgets stack: (1) Working Capital $500K Apply Now,
 *       (2) Recent Posts list (3 small items), (3) "cardiff Financing
 *       Excellence Since 2004" blue card
 *
 * Renderer quirk respected:
 *   `data-repeat` lives on the CARD (sibling), not on the .grid wrapper, so
 *   the grid stays multi-column. The sidebar is fully hard-coded siblings;
 *   no data-repeat on the column wrapper.
 *
 * Idempotent:
 *   - removes any prior `sec-articles` or `sec-articles-grid-v2` block,
 *   - re-inserts at order 2 between `hero-learn-articles-min` (order 1) and
 *     `final-cta` (order 3),
 *   - safe to re-run; identical final state.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 819;
const NEW_BLOCK_ID = 'sec-articles-grid-v2';
const REMOVE_IDS = ['sec-1', 'sec-2', 'sec-articles', 'sec-articles-grid-v2'];

const ARTICLES_HTML = `
<style>
  .cd-larts2 { background: #f4f7fb; padding: 64px 24px 80px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-larts2__inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr 320px; gap: 32px; align-items: start; }
  .cd-larts2__col { display: flex; flex-direction: column; gap: 24px; }
  .cd-larts2__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
  .cd-larts2__card { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 6px; padding: 0 0 22px 0; display: flex; flex-direction: column; min-height: 340px; overflow: hidden; box-shadow: 0 1px 2px rgba(28,51,112,0.04); transition: box-shadow 0.18s, transform 0.18s; }
  .cd-larts2__card:hover { box-shadow: 0 6px 18px rgba(28,51,112,0.10); transform: translateY(-2px); }
  .cd-larts2__imgwrap { width: 100%; aspect-ratio: 16 / 10; background: linear-gradient(135deg, #1c3370 0%, #25418b 100%); display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .cd-larts2__imgwrap .material-icons { font-size: 56px; color: rgba(255,255,255,0.45); }
  .cd-larts2__img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cd-larts2__img[src=""], .cd-larts2__img:not([src]) { display: none; }
  .cd-larts2__body { padding: 20px 22px 0 22px; display: flex; flex-direction: column; flex: 1; }
  .cd-larts2__title { font-family: 'Raleway', sans-serif; font-size: 1rem; font-weight: 800; color: #1c3370; letter-spacing: -0.005em; line-height: 1.32; margin: 0 0 12px 0; }
  .cd-larts2__excerpt { font-family: 'Open Sans', sans-serif; font-size: 0.9rem; line-height: 1.6; color: #525f7f; margin: 0 0 16px 0; flex: 1; }
  .cd-larts2__more { font-family: 'Raleway', sans-serif; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.08em; color: #25418b; text-decoration: none; text-transform: uppercase; margin: 0 22px 0 22px; display: inline-flex; align-items: center; gap: 6px; }
  .cd-larts2__more .material-icons { font-size: 14px; transition: transform 0.18s; }
  .cd-larts2__more:hover { color: #ef6632; }
  .cd-larts2__more:hover .material-icons { transform: translateX(3px); }
  .cd-larts2__pager { margin: 28px 0 0 0; display: flex; justify-content: flex-start; align-items: center; gap: 6px; font-family: 'Raleway', sans-serif; font-size: 0.82rem; font-weight: 700; color: #25418b; text-decoration: none; }
  .cd-larts2__pager .material-icons { font-size: 16px; }

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
        <article class="cd-larts2__card" data-repeat="articles">
          <div class="cd-larts2__imgwrap">
            <img class="cd-larts2__img" src="{{articles.image}}" alt="{{articles.title}}" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='<span class=&quot;material-icons&quot;>article</span>';" />
          </div>
          <div class="cd-larts2__body">
            <h3 class="cd-larts2__title" data-field="title">{{articles.title}}</h3>
            <p class="cd-larts2__excerpt" data-field="excerpt">{{articles.excerpt}}</p>
          </div>
          <a class="cd-larts2__more" href="{{articles.url}}" data-field="ctaText">{{articles.ctaText}} <span class="material-icons">arrow_forward</span></a>
        </article>
      </div>
      <a class="cd-larts2__pager" href="{{moreLink}}" data-field="moreLabel"><span class="material-icons">chevron_right</span> {{moreLabel}}</a>
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

// 9 articles harvested from cardiff.co/learn/articles/ (Divi blog grid).
// First 6 have real .webp images; last 3 are intentionally image-less on the
// source — the imgwrap renders a Material `article` icon fallback for those.
const ARTICLES = [
  {
    image: 'https://cardiffcompany.wpenginepowered.com/wp-content/smush-webp/2026/03/leverage-apr-credit-card-offers-for-short-term-business-funding.jpg.webp',
    title: 'Leverage 0% APR Credit Card Offers for Short-Term Business Funding',
    excerpt: "Many owners seeking financing overlook a credit card's potential for short-term business funding...",
    ctaText: 'Read More',
    url: '/learn/use-0-apr-credit-cards-for-short-term-business-funding/',
  },
  {
    image: 'https://cardiffcompany.wpenginepowered.com/wp-content/smush-webp/2026/03/plan-your-retail-store-financing-around-your-goals.jpg.webp',
    title: 'Plan Your Retail Store Financing Around Your Goals',
    excerpt: 'Growing your retail store rarely happens by accident. You usually have to set goals and actively...',
    ctaText: 'Read More',
    url: '/learn/plan-your-retail-store-financing-around-your-goals/',
  },
  {
    image: 'https://cardiffcompany.wpenginepowered.com/wp-content/smush-webp/2026/03/why-and-when-travel-agencies-need-fast-access-to-capital.jpg.webp',
    title: 'Why and When Travel Agencies Need Fast Access to Capital',
    excerpt: 'Travel is a time-sensitive business where delays can easily cost you money. You attract fewer...',
    ctaText: 'Read More',
    url: '/learn/why-and-when-travel-agencies-need-fast-access-to-capital/',
  },
  {
    image: 'https://cardiffcompany.wpenginepowered.com/wp-content/smush-webp/2026/03/how-to-avoid-mid-project-cash-crunches-on-big-construction-jobs.jpg.webp',
    title: 'How to Avoid Mid-Project Cash Crunches on Big Construction Jobs',
    excerpt: 'Large construction jobs can raise your revenue, but they also increase your chances of a cash...',
    ctaText: 'Read More',
    url: '/learn/avoid-cash-crunches-in-big-construction-projects-easily/',
  },
  {
    image: 'https://cardiffcompany.wpenginepowered.com/wp-content/smush-webp/2026/03/Medical-Practice-Financing-Requires-More-Than-One-Type-of-Loan.jpg.webp',
    title: 'Why Medical Practice Financing Requires More Than One Type of Loan',
    excerpt: "The Golden Gate Bridge in San Francisco isn't strong because it's rigid. It's strong because it's...",
    ctaText: 'Read More',
    url: '/learn/why-medical-practice-financing-needs-multiple-loan-types/',
  },
  {
    image: 'https://cardiffcompany.wpenginepowered.com/wp-content/smush-webp/2026/03/Line-of-Credit-for-Small-Businesses.jpg.webp',
    title: '9 Advantages of a Line of Credit for Small Businesses',
    excerpt: 'Running a successful small business means dealing with uncertainty. Suppliers increase prices...',
    ctaText: 'Read More',
    url: '/learn/9-advantages-of-a-line-of-credit-for-small-businesses/',
  },
  {
    image: '',
    title: 'The Causes, Impacts, and Solutions to Payroll Delays in Construction',
    excerpt: 'In construction, projects only stay on track when everything else stays on schedule. Late material...',
    ctaText: 'Read More',
    url: '/learn/solutions-to-payroll-delays-in-construction-projects/',
  },
  {
    image: '',
    title: '5 Unexpected Costs of Delaying Business Funding',
    excerpt: 'Many owners start out with a dream to run a profitable, independent business. So they scrimp and...',
    ctaText: 'Read More',
    url: '/learn/5-unexpected-costs-of-delaying-business-funding/',
  },
  {
    image: '',
    title: '5 Reasons Every Auto Repair Shop Needs an Emergency Fund',
    excerpt: 'Running an auto repair shop is like racing in the Baja 1000. You can build a solid vehicle, hire...',
    ctaText: 'Read More',
    url: '/learn/5-reasons-every-auto-repair-shop-needs-an-emergency-fund/',
  },
];

const RECENT = [
  {
    date: 'May 28, 2026',
    title: 'Leverage 0% APR Credit Card Offers for Short-Term Business Funding',
    url: '/learn/use-0-apr-credit-cards-for-short-term-business-funding/',
  },
  {
    date: 'May 19, 2026',
    title: 'Plan Your Retail Store Financing Around Your Goals',
    url: '/learn/plan-your-retail-store-financing-around-your-goals/',
  },
  {
    date: 'May 12, 2026',
    title: 'Why and When Travel Agencies Need Fast Access to Capital',
    url: '/learn/why-and-when-travel-agencies-need-fast-access-to-capital/',
  },
];

const articlesBlock = {
  id: NEW_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 2,
  html: ARTICLES_HTML,
  fields: [
    {
      name: 'articles',
      label: 'Article cards',
      type: 'array' as const,
      itemFields: [
        { name: 'image', label: 'Image URL (blank = icon fallback)', type: 'url' as const, default: '' },
        { name: 'title', label: 'Title', type: 'text' as const },
        { name: 'excerpt', label: 'Excerpt', type: 'text' as const },
        { name: 'ctaText', label: 'CTA text', type: 'text' as const, default: 'Read More' },
        { name: 'url', label: 'Link', type: 'url' as const, default: '#' },
      ],
    },
    { name: 'moreLabel', label: 'Load-more label', type: 'text' as const, default: 'Older Entries' },
    { name: 'moreLink', label: 'Load-more link', type: 'url' as const, default: '#' },
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
    { name: 'brandName', label: 'Brand card name', type: 'text' as const, default: 'cardiff' },
    { name: 'brandLead', label: 'Brand card lead', type: 'text' as const, default: 'Financing Excellence' },
    { name: 'brandStrong', label: 'Brand card strong', type: 'text' as const, default: 'Since 2004' },
  ],
  values: {
    articles: ARTICLES,
    moreLabel: 'Older Entries',
    moreLink: '#',
    ctaTitle: 'Working Capital',
    ctaAmountLabel: 'up to',
    ctaAmount: '$500K',
    ctaApproval: 'Approval in minutes',
    ctaFundingLine: 'Funding same day',
    ctaButtonText: 'Apply Now',
    ctaButtonUrl: '#apply',
    recentTitle: 'Recent Posts',
    recent: RECENT,
    brandName: 'cardiff',
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

  // Drop any previous incarnation of the articles block.
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
    `Updated post ${POST_ID}: inserted ${NEW_BLOCK_ID} (9 articles + 3-widget sidebar). Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
