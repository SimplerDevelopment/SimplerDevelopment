/**
 * Iter 3 (trucking, post 817): Restyle sec-3 — the customer reviews / "Cardiff"
 * testimonials wall. Currently 34 sub-blocks of bare H3 name + H4 review-count
 * + paragraph triples, ten reviews deep, all crammed in an 880px column with
 * no visual structure.
 *
 * Replacement matches the iter-2 / equipment-leasing pattern:
 *   1. Centered H2 + orange underline
 *   2. Subtitle band
 *   3. A single html-render block with a 3-up testimonial card grid (collapses
 *      to 2-up / 1-up on narrower screens) using `data-repeat="reviews"` so
 *      the author can add/remove cards without touching markup.
 *   4. Closing "See More Reviews on Google" pill CTA
 *
 * Brand palette only: deep blue (#1c3370 / #25418b), orange (#ef6632) accents,
 * green (#5ac96f) avatar accent. Raleway headings / Open Sans body.
 * Material Icons (format_quote, star) — no emojis.
 *
 * Idempotent: re-running overwrites sec-3's sub-blocks with the same three
 * children (heading + divider + html-render id "sec-3-reviews"). Safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const TARGET_BLOCK_ID = 'sec-3';

const REVIEWS_HTML = `
<style>
  .cd-tk-rev { max-width: 1200px; margin: 0 auto; }
  .cd-tk-rev__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; max-width: 720px; margin: 0 auto 48px auto; }
  .cd-tk-rev__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-tk-rev__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 32px 28px 28px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); display: flex; flex-direction: column; position: relative; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-tk-rev__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-tk-rev__quote { position: absolute; top: 18px; right: 22px; color: #ef6632; opacity: 0.18; }
  .cd-tk-rev__quote .material-icons { font-size: 56px; }
  .cd-tk-rev__head { display: flex; align-items: center; gap: 14px; margin: 0 0 18px 0; }
  .cd-tk-rev__avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; font-family: 'Raleway', sans-serif; font-weight: 800; font-size: 1.125rem; letter-spacing: -0.01em; flex-shrink: 0; box-shadow: 0 6px 14px rgba(28,51,112,0.22); }
  .cd-tk-rev__card:nth-child(3n+2) .cd-tk-rev__avatar { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 6px 14px rgba(239,102,50,0.28); }
  .cd-tk-rev__card:nth-child(3n+3) .cd-tk-rev__avatar { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 6px 14px rgba(58,168,86,0.28); }
  .cd-tk-rev__who { display: flex; flex-direction: column; min-width: 0; }
  .cd-tk-rev__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0; line-height: 1.2; letter-spacing: -0.005em; }
  .cd-tk-rev__meta { display: flex; align-items: center; gap: 6px; margin: 4px 0 0 0; font-family: 'Open Sans', sans-serif; font-size: 0.8125rem; color: #6b7896; }
  .cd-tk-rev__stars { color: #ef6632; display: inline-flex; align-items: center; gap: 1px; }
  .cd-tk-rev__stars .material-icons { font-size: 14px; }
  .cd-tk-rev__body { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; position: relative; z-index: 1; }
  .cd-tk-rev__cta-wrap { margin: 48px auto 0 auto; text-align: center; }
  .cd-tk-rev__cta { display: inline-flex; align-items: center; gap: 8px; padding: 14px 32px; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; font-family: 'Raleway', sans-serif; font-weight: 700; font-size: 1rem; text-decoration: none; border-radius: 999px; letter-spacing: 0.01em; box-shadow: 0 12px 28px rgba(28,51,112,0.28); transition: transform .2s ease, box-shadow .2s ease; }
  .cd-tk-rev__cta:hover { transform: translateY(-2px); box-shadow: 0 16px 36px rgba(28,51,112,0.36); }
  .cd-tk-rev__cta .material-icons { font-size: 18px; }
  @media (max-width: 980px) {
    .cd-tk-rev__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-tk-rev__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-tk-rev__card { padding: 26px 22px 22px 22px; }
  }
</style>
<div class="cd-tk-rev">
  <p class="cd-tk-rev__intro" data-field="intro">{{intro}}</p>
  <div class="cd-tk-rev__grid">
    <div class="cd-tk-rev__card" data-repeat="reviews">
      <span class="cd-tk-rev__quote"><span class="material-icons">format_quote</span></span>
      <div class="cd-tk-rev__head">
        <div class="cd-tk-rev__avatar">{{reviews.initial}}</div>
        <div class="cd-tk-rev__who">
          <p class="cd-tk-rev__name">{{reviews.name}}</p>
          <span class="cd-tk-rev__meta">
            <span class="cd-tk-rev__stars">
              <span class="material-icons">star</span>
              <span class="material-icons">star</span>
              <span class="material-icons">star</span>
              <span class="material-icons">star</span>
              <span class="material-icons">star</span>
            </span>
            <span>&middot; {{reviews.reviewCount}}</span>
          </span>
        </div>
      </div>
      <p class="cd-tk-rev__body">{{reviews.body}}</p>
    </div>
  </div>
  <div class="cd-tk-rev__cta-wrap">
    <a class="cd-tk-rev__cta" href="{{ctaUrl}}" target="_blank" rel="noopener" data-field="ctaUrl">
      <span>{{ctaLabel}}</span>
      <span class="material-icons">arrow_forward</span>
    </a>
  </div>
</div>
`.trim();

const REVIEWS = [
  { initial: 'A', name: 'Alfredo Castaneda', reviewCount: '4 reviews', body: "It's been a pleasure working with Bank of Cardiff. Very professional and knowledgeable customer service. We are blessed to have found them, when other banks denied us loans. Thank you and we hope to keep working together for a better future." },
  { initial: 'K', name: 'Katherine Sheldon', reviewCount: '4 reviews', body: "Cardiff was able to provide me funding where other banks were not. Their representatives were great and offered me some financial advice in order to get future funding at even better terms. The loan process was very easy and you get funded in less than 48 hours. I will certainly use them again." },
  { initial: 'T', name: 'Tolani Turnage', reviewCount: '3 reviews', body: "Recently got our semi trucks financed through Bank of Cardiff. Not only did we get approved, we got very good interest rates considering this was our very first time financing equipment. Great customer service, communication was excellent all through the process." },
  { initial: 'A', name: 'Angela Brason', reviewCount: '8 reviews', body: "I had a great experience with Ms. Tania Stevenson this week. We were in need of a loan to get us through the month, while waiting on payments from net/30 customers. She was very knowledgeable about all of the products that Bank of Cardiff offers. Great Job Tania!!" },
  { initial: 'R', name: 'Roxy Rodriguez', reviewCount: '2 reviews', body: "If you need cash just call Saul and Chris — they are both amazing people. I never thought I would even get near a loan but they made it happen. The process was easy and fast! I would recommend them 1000x." },
  { initial: 'J', name: 'Junior Frett', reviewCount: '1 review', body: "Had a great experience with Bank of Cardiff. If you need quick and easy finance, ask for Jesse Moore or Sal — they know all the different programs Cardiff offers and best fit your needs. Quick, easy, straight to the point. Definitely will keep using Bank of Cardiff." },
  { initial: 'R', name: 'Rafael Gonzalez', reviewCount: '1 review', body: "Had a great experience. Great customer service — Sal & Jesse were very helpful. Need a loan, give them a call." },
  { initial: 'B', name: 'Blades of Green', reviewCount: '1 review', body: "It's always a pleasure to work with John at Bank of Cardiff! We have received nothing less than prompt, attentive, friendly service. Bank of Cardiff gave us comfort and hope during a difficult situation, and we would recommend John Mena to anyone." },
  { initial: 'M', name: 'Marsha Reaves', reviewCount: '1 review', body: "This is my second time working with Cardiff Bank and I enjoy it. This time around Christian worked with me on getting a bigger loan. I would recommend Cardiff Bank to anyone trying to get a loan. They work with your credit score to get you the best interest rate." },
  { initial: 'C', name: 'Christel Aime', reviewCount: '2 reviews', body: "John and Mitch were very great, responsive and stayed in touch with me the whole process. This is my third transaction with Bank of Cardiff — I would recommend them any time." },
];

const REVIEWS_DEFAULTS = {
  intro: 'Here are some reasons why our customers love us as much as we love them.',
  reviews: REVIEWS,
  ctaLabel: 'See More Reviews on Google',
  ctaUrl: 'https://www.google.com/search?q=bank+of+cardiff+reviews',
} as const;

const reviewsBlock = {
  id: 'sec-3-reviews',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: REVIEWS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: REVIEWS_DEFAULTS.intro },
    {
      name: 'reviews',
      label: 'Reviews',
      type: 'repeater',
      itemFields: [
        { name: 'initial', label: 'Avatar initial', type: 'text', default: 'A' },
        { name: 'name', label: 'Reviewer name', type: 'text', default: '' },
        { name: 'reviewCount', label: 'Review count text', type: 'text', default: '1 review' },
        { name: 'body', label: 'Review body', type: 'textarea', default: '' },
      ],
      default: REVIEWS,
    },
    { name: 'ctaLabel', label: 'CTA label', type: 'text', default: REVIEWS_DEFAULTS.ctaLabel },
    { name: 'ctaUrl', label: 'CTA url', type: 'text', default: REVIEWS_DEFAULTS.ctaUrl },
  ],
  values: { ...REVIEWS_DEFAULTS },
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

  // Widen so the 3-col card grid breathes.
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
    id: 'sec-3-title',
    order: 1,
    level: 2,
    content: 'What Our Trucking Customers Say',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
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
    id: 'sec-3-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, reviewsBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-3 -> styled 10-card testimonials grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
