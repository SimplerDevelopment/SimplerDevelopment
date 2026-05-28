/**
 * Iteration 3: Learn (Small Business Lending Resources) — post id 821.
 *
 * Biggest remaining gap after iter1+iter2:
 *   Iter1 rebuilt the body as three stacked text "strips" (FAQ / Getting Ready /
 *   Using Your Loan) and a 2-up article grid. On cardiff.co those three items
 *   are actually the page's PRIMARY NAVIGATION into deeper resource hubs —
 *   /learn/faq, /learn/getting-ready, /learn/using-your-loan. The port renders
 *   them as static prose with no link affordance, no icon, no hierarchy, so
 *   visitors have no idea they're the entry points the page exists to surface.
 *
 * Fix: replace the `learn-body` html-render block with one that renders the
 * three categories as a 3-up icon-card grid (full-bleed cards, brand-accented
 * icon chip per card, deep-blue title + sub-copy + "Explore" arrow link) and
 * keeps the related-articles strip below it on a soft blue band. The article
 * tiles also get an icon chip + 2-line layout so they read as cards rather
 * than tinted text blocks.
 *
 * Layout:
 *   - 3 category cards (icon-school / icon-task_alt / icon-rocket_launch)
 *     each linking to its /learn/<slug>/ destination
 *   - Below: eyebrow + heading + 2-up article cards with article icon chip
 *
 * Brand palette only: #1c3370 / #25418b deep blues, #5ac96f green, #ef6632
 * orange, #ffb798 peach. Raleway headings + Open Sans body. No emojis,
 * Material Icons only.
 *
 * Idempotent: looks up the existing `learn-body` block (added by iter1) and
 * overwrites html/fields/values in place. If it's missing, aborts loudly —
 * iter1 must have run first.
 */
import { config } from 'dotenv';
config({ path: '.env.local', override: true });
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 821;
const TARGET_BLOCK_ID = 'learn-body';

const LEARN_BODY_HTML = `
<style>
  .cd-learn3 { background: #ffffff; padding: 0; }

  /* === Category cards === */
  .cd-learn3__cats {
    background: #ffffff;
    padding: 72px 24px 56px 24px;
  }
  .cd-learn3__cats-inner { max-width: 1180px; margin: 0 auto; }
  .cd-learn3__eyebrow {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: #ef6632;
    margin: 0 0 10px 0; text-align: center;
  }
  .cd-learn3__heading {
    font-family: 'Raleway', sans-serif;
    font-size: 2rem; font-weight: 800; color: #1c3370;
    margin: 0 auto 8px auto; text-align: center;
    letter-spacing: -0.012em; max-width: 760px; line-height: 1.18;
  }
  .cd-learn3__sub {
    font-family: 'Open Sans', sans-serif;
    font-size: 1.02rem; line-height: 1.65; color: #525f7f;
    margin: 0 auto 44px auto; text-align: center; max-width: 680px;
  }
  .cd-learn3__grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
  }
  .cd-learn3__card {
    display: flex; flex-direction: column;
    background: #ffffff;
    border: 1px solid #e6ecf3;
    border-radius: 14px;
    padding: 34px 30px 28px 30px;
    box-shadow: 0 12px 32px rgba(28,51,112,0.06);
    text-decoration: none;
    transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
    position: relative; overflow: hidden;
  }
  .cd-learn3__card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, #25418b 0%, #1c3370 100%);
    transform: scaleX(0); transform-origin: left; transition: transform 0.3s ease;
  }
  .cd-learn3__card:hover {
    transform: translateY(-4px);
    box-shadow: 0 22px 48px rgba(28,51,112,0.14);
    border-color: #cfd9ea;
  }
  .cd-learn3__card:hover::before { transform: scaleX(1); }
  .cd-learn3__card:nth-child(2)::before { background: linear-gradient(90deg, #ef6632 0%, #d8501e 100%); }
  .cd-learn3__card:nth-child(3)::before { background: linear-gradient(90deg, #5ac96f 0%, #3aa856 100%); }

  .cd-learn3__icon {
    width: 56px; height: 56px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    margin: 0 0 20px 0;
    background: linear-gradient(135deg, #25418b 0%, #1c3370 100%);
    color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22);
  }
  .cd-learn3__card:nth-child(2) .cd-learn3__icon {
    background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%);
    box-shadow: 0 8px 18px rgba(239,102,50,0.28);
  }
  .cd-learn3__card:nth-child(3) .cd-learn3__icon {
    background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%);
    box-shadow: 0 8px 18px rgba(58,168,86,0.28);
  }
  .cd-learn3__icon .material-icons { font-size: 30px; }

  .cd-learn3__card-title {
    font-family: 'Raleway', sans-serif;
    font-size: 1.4rem; font-weight: 800; color: #1c3370;
    margin: 0 0 12px 0; letter-spacing: -0.008em; line-height: 1.22;
  }
  .cd-learn3__card-desc {
    font-family: 'Open Sans', sans-serif;
    font-size: 0.975rem; line-height: 1.65; color: #525f7f;
    margin: 0 0 22px 0; flex: 1;
  }
  .cd-learn3__card-cta {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: 'Raleway', sans-serif;
    font-size: 0.88rem; font-weight: 700; letter-spacing: 0.02em;
    color: #ef6632; text-transform: uppercase;
    margin-top: auto;
  }
  .cd-learn3__card-cta .material-icons { font-size: 18px; transition: transform 0.22s ease; }
  .cd-learn3__card:hover .cd-learn3__card-cta .material-icons { transform: translateX(4px); }

  /* === Articles band === */
  .cd-learn3__articles {
    background: linear-gradient(180deg, #f6f9fc 0%, #eef3f9 100%);
    padding: 72px 24px 88px 24px;
  }
  .cd-learn3__articles-inner { max-width: 1180px; margin: 0 auto; }
  .cd-learn3__articles-eyebrow {
    font-family: 'Raleway', sans-serif;
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: #ef6632;
    margin: 0 0 10px 0; text-align: center;
  }
  .cd-learn3__articles-head {
    font-family: 'Raleway', sans-serif;
    font-size: 1.8rem; font-weight: 800; color: #1c3370;
    margin: 0 0 40px 0; text-align: center; letter-spacing: -0.01em;
  }
  .cd-learn3__articles-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 22px;
  }
  .cd-learn3__article {
    display: flex; align-items: flex-start; gap: 18px;
    padding: 24px 26px; background: #ffffff; border-radius: 12px;
    box-shadow: 0 8px 22px rgba(28,51,112,0.07);
    border: 1px solid #e6ecf3;
    text-decoration: none;
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .cd-learn3__article:hover {
    transform: translateY(-3px);
    box-shadow: 0 16px 36px rgba(28,51,112,0.13);
    border-color: #cfd9ea;
  }
  .cd-learn3__article-icon {
    flex-shrink: 0;
    width: 44px; height: 44px; border-radius: 11px;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%);
    color: #fff; box-shadow: 0 6px 14px rgba(239,102,50,0.24);
  }
  .cd-learn3__article-icon .material-icons { font-size: 22px; }
  .cd-learn3__article-body { flex: 1; min-width: 0; }
  .cd-learn3__article-title {
    font-family: 'Raleway', sans-serif;
    font-size: 1.04rem; font-weight: 700; color: #1c3370;
    line-height: 1.35; margin: 0 0 6px 0;
  }
  .cd-learn3__article-read {
    display: inline-flex; align-items: center; gap: 4px;
    font-family: 'Open Sans', sans-serif;
    font-size: 0.82rem; font-weight: 600; color: #ef6632;
  }
  .cd-learn3__article-read .material-icons { font-size: 14px; }

  @media (max-width: 980px) {
    .cd-learn3__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-learn3__articles-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 620px) {
    .cd-learn3__cats { padding: 56px 18px 40px 18px; }
    .cd-learn3__articles { padding: 56px 18px 64px 18px; }
    .cd-learn3__card { padding: 28px 22px 24px 22px; }
    .cd-learn3__heading { font-size: 1.6rem; }
    .cd-learn3__articles-head { font-size: 1.45rem; }
  }
</style>
<section class="cd-learn3">
  <div class="cd-learn3__cats">
    <div class="cd-learn3__cats-inner">
      <p class="cd-learn3__eyebrow" data-field="catsEyebrow">{{catsEyebrow}}</p>
      <h2 class="cd-learn3__heading" data-field="catsHeading">{{catsHeading}}</h2>
      <p class="cd-learn3__sub" data-field="catsSub">{{catsSub}}</p>
      <div class="cd-learn3__grid">
        <a class="cd-learn3__card" href="{{categories.url}}" data-repeat="categories">
          <div class="cd-learn3__icon"><span class="material-icons" data-field="icon">{{categories.icon}}</span></div>
          <h3 class="cd-learn3__card-title" data-field="title">{{categories.title}}</h3>
          <p class="cd-learn3__card-desc" data-field="description">{{categories.description}}</p>
          <span class="cd-learn3__card-cta">
            <span data-field="ctaLabel">{{categories.ctaLabel}}</span>
            <span class="material-icons">arrow_forward</span>
          </span>
        </a>
      </div>
    </div>
  </div>

  <div class="cd-learn3__articles">
    <div class="cd-learn3__articles-inner">
      <p class="cd-learn3__articles-eyebrow" data-field="articlesEyebrow">{{articlesEyebrow}}</p>
      <h3 class="cd-learn3__articles-head" data-field="articlesHeading">{{articlesHeading}}</h3>
      <div class="cd-learn3__articles-grid">
        <a class="cd-learn3__article" href="{{articles.url}}" data-repeat="articles">
          <div class="cd-learn3__article-icon"><span class="material-icons">article</span></div>
          <div class="cd-learn3__article-body">
            <p class="cd-learn3__article-title" data-field="title">{{articles.title}}</p>
            <span class="cd-learn3__article-read">
              Read article
              <span class="material-icons">arrow_forward</span>
            </span>
          </div>
        </a>
      </div>
    </div>
  </div>
</section>
`.trim();

const VALUES = {
  catsEyebrow: 'Resource Library',
  catsHeading: 'Start where you are',
  catsSub:
    "Three focused hubs answer the questions small-business owners ask most — before, during, and after you fund.",
  categories: [
    {
      icon: 'school',
      title: 'FAQ',
      description:
        'Quick answers about Cardiff — who we lend to, how decisions get made, what documents you need, and how funding actually works.',
      ctaLabel: 'Browse FAQs',
      url: 'https://cardiff.co/learn/faq/',
    },
    {
      icon: 'task_alt',
      title: 'Getting Ready',
      description:
        "Prep work pays off. Tighten your application, organize the right documents, and walk in knowing what underwriters look for.",
      ctaLabel: 'Get prepared',
      url: 'https://cardiff.co/learn/getting-ready/',
    },
    {
      icon: 'rocket_launch',
      title: 'Using Your Loan',
      description:
        'Once funded, put capital to work — equipment, hiring, inventory, marketing. Real-world playbooks from Cardiff customers.',
      ctaLabel: 'See playbooks',
      url: 'https://cardiff.co/learn/using-your-loan/',
    },
  ],
  articlesEyebrow: 'Featured Articles',
  articlesHeading: 'Changing Times & Small Business Resources',
  articles: [
    {
      title: 'Changing Times and the Coronavirus Pandemic',
      url: 'https://cardiff.co/changing-times-and-the-pandemic/',
    },
    {
      title: 'How to Weather Coronavirus as a Small Business Owner',
      url: 'https://cardiff.co/how-to-weather-covid19/',
    },
  ],
};

const learnBodyBlock = {
  id: 'learn-body',
  type: 'html-render' as const,
  width: 'full' as const,
  html: LEARN_BODY_HTML,
  fields: [
    { name: 'catsEyebrow', label: 'Categories eyebrow', type: 'text' as const, default: VALUES.catsEyebrow },
    { name: 'catsHeading', label: 'Categories heading', type: 'text' as const, default: VALUES.catsHeading },
    { name: 'catsSub', label: 'Categories subheading', type: 'textarea' as const, default: VALUES.catsSub },
    {
      name: 'categories',
      label: 'Resource categories',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' as const },
        { name: 'title', label: 'Title', type: 'text' as const },
        { name: 'description', label: 'Description', type: 'textarea' as const },
        { name: 'ctaLabel', label: 'CTA label', type: 'text' as const },
        { name: 'url', label: 'Destination URL', type: 'url' as const },
      ],
    },
    { name: 'articlesEyebrow', label: 'Articles eyebrow', type: 'text' as const, default: VALUES.articlesEyebrow },
    { name: 'articlesHeading', label: 'Articles heading', type: 'text' as const, default: VALUES.articlesHeading },
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
  values: VALUES,
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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(
      `Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; run styled-learn-iter1.ts first.`,
    );
    process.exit(1);
  }
  parsed.blocks[idx] = learnBodyBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: rebuilt learn-body as 3-up icon-card grid + article cards (iter 3).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
