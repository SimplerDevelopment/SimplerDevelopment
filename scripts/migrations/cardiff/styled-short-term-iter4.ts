/**
 * Iter 4 (post 830 — short-term-working-capital-loans):
 * Restyle sec-9, the Google-reviews / testimonials wall.
 *
 * Source state: section is mis-labelled "Cardiff" + a flat stack of 34
 * children — 10 reviewer triples (H3 name, H4 "X reviews", text body) plus
 * a single H2 banner, an intro H4, and a trailing "See More Reviews"
 * link. Visually inert and the biggest remaining unstyled block on the
 * page.
 *
 * Restyle: replace sec-9 children with a clean H2 + orange divider +
 * single html-render block holding a 3-up masonry-feel card grid driven
 * by a `reviews` data-repeat array (so editors can add/remove reviewers
 * without touching the script). Each card carries a circular initial
 * avatar, a 5-star row, the reviewer name + review-count, and the body.
 * Brand palette only (#1c3370 / #25418b / #5ac96f / #ef6632), Raleway
 * titles, Open Sans body, Material Icons stars (no emojis).
 *
 * Idempotent: detects an existing `sec-9-reviews` html-render block and
 * preserves its values when re-running; otherwise rewrites sec-9
 * children with header + divider + reviews block.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 830;
const TARGET_BLOCK_ID = 'sec-9';
const REVIEWS_BLOCK_ID = 'sec-9-reviews';

const REVIEWS_HTML = `
<style>
  .cd-st-rev { max-width: 1180px; margin: 0 auto; }
  .cd-st-rev__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 720px; margin: 0 auto 48px auto; }
  .cd-st-rev__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; align-items: stretch; }
  .cd-st-rev__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 28px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; position: relative; }
  .cd-st-rev__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-st-rev__quote { position: absolute; top: 14px; right: 18px; color: #ffb798; opacity: 0.55; }
  .cd-st-rev__quote .material-icons { font-size: 44px; }
  .cd-st-rev__head { display: flex; align-items: center; gap: 14px; margin: 0 0 14px 0; }
  .cd-st-rev__avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 1.05rem; color: #ffffff; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); box-shadow: 0 6px 14px rgba(28,51,112,0.22); flex-shrink: 0; letter-spacing: 0.02em; }
  .cd-st-rev__card:nth-child(3n+2) .cd-st-rev__avatar { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 6px 14px rgba(239,102,50,0.28); }
  .cd-st-rev__card:nth-child(3n+3) .cd-st-rev__avatar { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 6px 14px rgba(58,168,86,0.28); }
  .cd-st-rev__who { display: flex; flex-direction: column; min-width: 0; }
  .cd-st-rev__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; line-height: 1.2; margin: 0; }
  .cd-st-rev__meta { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; color: #8a96b1; margin: 2px 0 0 0; }
  .cd-st-rev__stars { display: flex; gap: 2px; margin: 0 0 12px 0; color: #ef6632; }
  .cd-st-rev__stars .material-icons { font-size: 18px; }
  .cd-st-rev__body { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; flex: 1; }
  .cd-st-rev__cta-wrap { margin: 48px auto 0 auto; text-align: center; }
  .cd-st-rev__cta { display: inline-flex; align-items: center; gap: 8px; padding: 14px 28px; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.9375rem; text-decoration: none; border-radius: 8px; box-shadow: 0 10px 24px rgba(28,51,112,0.22); transition: transform .25s ease, box-shadow .25s ease; }
  .cd-st-rev__cta:hover { transform: translateY(-2px); box-shadow: 0 14px 30px rgba(28,51,112,0.3); }
  .cd-st-rev__cta .material-icons { font-size: 18px; }
  @media (max-width: 980px) {
    .cd-st-rev__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-st-rev__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-st-rev__card { padding: 24px 22px; }
  }
</style>
<div class="cd-st-rev">
  <p class="cd-st-rev__intro" data-field="intro">{{intro}}</p>
  <div class="cd-st-rev__grid">
    <div class="cd-st-rev__card" data-repeat="reviews">
      <span class="cd-st-rev__quote"><span class="material-icons">format_quote</span></span>
      <div class="cd-st-rev__head">
        <div class="cd-st-rev__avatar">{{reviews.initials}}</div>
        <div class="cd-st-rev__who">
          <p class="cd-st-rev__name">{{reviews.name}}</p>
          <p class="cd-st-rev__meta">{{reviews.meta}}</p>
        </div>
      </div>
      <div class="cd-st-rev__stars">
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
      </div>
      <p class="cd-st-rev__body">{{reviews.body}}</p>
    </div>
  </div>
  <div class="cd-st-rev__cta-wrap">
    <a class="cd-st-rev__cta" href="{{ctaHref}}" target="_blank" rel="noopener">
      <span class="material-icons">open_in_new</span>
      <span data-field="ctaLabel">{{ctaLabel}}</span>
    </a>
  </div>
</div>
`.trim();

const INTRO_DEFAULT =
  'Here are some reasons why our customers love us as much as we love them.';

const CTA_LABEL_DEFAULT = 'See More Reviews on Google';
const CTA_HREF_DEFAULT = 'https://www.google.com/search?q=Bank+of+Cardiff+reviews';

const REVIEWS_DEFAULT = [
  {
    initials: 'AC',
    name: 'Alfredo Castaneda',
    meta: '4 reviews',
    body: "It's been a pleasure working with Bank of Cardiff. Very professional and knowledgeable customer service. We are blessed to have found them, when other banks denied us loans. Thank you and we hope to keep working together for a better future.",
  },
  {
    initials: 'KS',
    name: 'Katherine Sheldon',
    meta: '4 reviews',
    body: 'Cardiff was able to provide me funding where other banks were not. My credit score, which I find to be a challenge when finding a loan for my business. Their representatives were great. They offered me some financial advice in order to get future funding at even better terms which I found very helpful as well. The loan process was very easy and you get funded in less than 48 hours. I will certainly use them again in the future.',
  },
  {
    initials: 'TT',
    name: 'Tolani Turnage',
    meta: '3 reviews',
    body: 'Recently got our semi trucks financed through Bank of Cardiff. Never thought we would get the loans approved at one point, but to my surprise we got approved. Not only did we get approved, we got very good interest rates considering this was our very first time financing equipment. It was an awesome experience working with Ally Diaz — very polite and helpful. Great customer service, communication was excellent all through the process. I will definitely recommend Bank of Cardiff to other business associates and family.',
  },
  {
    initials: 'AB',
    name: 'Angela Brason',
    meta: '8 reviews',
    body: "I had a great experience with Ms. Tania Stevenson this week. We were in need of a loan to get us through the month, while waiting on payments from net/30 customers. She was very knowledgeable about all of the products that Bank of Cardiff offers. She moved quickly and professionally to meet our needs! I'm so grateful for her and her service to help us. Great Job Tania!",
  },
  {
    initials: 'RR',
    name: 'Roxy Rodriguez',
    meta: '2 reviews',
    body: 'If you need cash just call Saul and Chris — they are both amazing people. I never thought I would even get near a loan but they made it happen. The process was easy and fast! I would recommend them 1000x.',
  },
  {
    initials: 'JF',
    name: 'Junior Frett',
    meta: '1 review',
    body: 'Had a great experience with Bank of Cardiff. If you need quick and easy finance call them, and specifically ask for Jesse Moore or Sal — they know all the different programs Cardiff offers and find the best fit for your needs. Quick, easy, straight to the point. Definitely will keep using Bank of Cardiff.',
  },
  {
    initials: 'RG',
    name: 'Rafael Gonzalez',
    meta: '1 review',
    body: 'Had a great experience. Great customer service. Sal and Jesse were very helpful. Need a loan? Give them a call.',
  },
  {
    initials: 'BG',
    name: 'Blades of Green',
    meta: '1 review',
    body: "It's always a pleasure to work with John at Bank of Cardiff. We have received nothing less than prompt, attentive, friendly service. Bank of Cardiff gave us comfort and hope during a difficult situation, and we would recommend John Mena to anyone and everyone we know.",
  },
  {
    initials: 'MR',
    name: 'Marsha Reaves',
    meta: '1 review',
    body: 'This is my second time working with Cardiff Bank and I enjoy it. This time around Christian worked with me on getting a bigger loan. I would recommend Cardiff Bank to anyone trying to get a loan. They work with your credit score to get you the best interest rate.',
  },
  {
    initials: 'CA',
    name: 'Christel Aime',
    meta: '2 reviews',
    body: 'John and Mitch were very great, responsive, and stayed in touch with me the whole process. This is my third transaction with Bank of Cardiff — I would recommend them any time.',
  },
];

const reviewsBlock = {
  id: REVIEWS_BLOCK_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: REVIEWS_HTML,
  fields: [
    { name: 'intro', label: 'Intro line', type: 'textarea', default: INTRO_DEFAULT },
    {
      name: 'reviews',
      label: 'Customer reviews',
      type: 'array',
      itemFields: [
        { name: 'initials', label: 'Avatar initials (2 chars)', type: 'text' },
        { name: 'name', label: 'Reviewer name', type: 'text' },
        { name: 'meta', label: 'Review-count meta', type: 'text' },
        { name: 'body', label: 'Review body', type: 'textarea' },
      ],
    },
    { name: 'ctaLabel', label: 'CTA label', type: 'text', default: CTA_LABEL_DEFAULT },
    { name: 'ctaHref', label: 'CTA href', type: 'text', default: CTA_HREF_DEFAULT },
  ],
  values: {
    intro: INTRO_DEFAULT,
    reviews: REVIEWS_DEFAULT,
    ctaLabel: CTA_LABEL_DEFAULT,
    ctaHref: CTA_HREF_DEFAULT,
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

  const idx = parsed.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }

  sec.maxWidth = '1240px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-9-title',
    order: 1,
    level: 2,
    content: 'What Cardiff Customers Are Saying',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.18',
      margin: '0 auto 14px auto',
      maxWidth: '900px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-9-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  // Preserve existing values if a reviews block already exists (idempotent edits).
  const existing = (sec.blocks || []).find((b: any) => b?.id === REVIEWS_BLOCK_ID);
  const nextReviewsBlock = existing
    ? { ...reviewsBlock, values: { ...reviewsBlock.values, ...(existing.values || {}) } }
    : reviewsBlock;

  sec.blocks = [headerBlock, dividerBlock, nextReviewsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-9 -> styled customer reviews grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
