/**
 * Iter 4: Restyle the customer reviews section (sec-10) on post 805
 * (industries-auto-repair).
 *
 * Source: 10 reviews are currently rendered as a tall stack of
 * H3 (name) + H4 (review count) + paragraph (quote) triples with no
 * visual structure — looks like a dump of raw Google reviews.
 *
 * Port: a responsive 3-up card grid of testimonial cards. Each card has
 * a five-star row, the quote, and the reviewer's name + review count.
 * Branded cards on a soft-blue band, with a small "See more on Google"
 * link at the bottom. Brand palette only (no emojis, Material Icons for
 * stars and the trailing arrow).
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-10-reviews` and rewrites the section in place.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 805;
const TARGET_BLOCK_ID = 'sec-10';

const REVIEWS_HTML = `
<style>
  .cd-ar-rev { max-width: 1180px; margin: 0 auto; }
  .cd-ar-rev__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 720px; margin: 0 auto 48px auto; }
  .cd-ar-rev__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-ar-rev__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 28px 26px 26px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); display: flex; flex-direction: column; transition: transform .25s ease, box-shadow .25s ease; }
  .cd-ar-rev__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-ar-rev__quote-mark { position: absolute; top: 14px; right: 18px; font-family: Georgia, 'Times New Roman', serif; font-size: 4rem; line-height: 1; color: rgba(239,102,50,0.18); pointer-events: none; user-select: none; }
  .cd-ar-rev__stars { display: flex; gap: 2px; margin: 0 0 14px 0; color: #ffb798; }
  .cd-ar-rev__stars .material-icons { font-size: 20px; color: #ef6632; }
  .cd-ar-rev__quote { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9625rem; line-height: 1.7; color: #4a5568; margin: 0 0 22px 0; flex: 1; }
  .cd-ar-rev__byline { display: flex; align-items: center; gap: 12px; padding-top: 18px; border-top: 1px solid #eef2f8; }
  .cd-ar-rev__avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Raleway', sans-serif; font-weight: 700; font-size: 0.95rem; letter-spacing: 0.02em; flex-shrink: 0; box-shadow: 0 6px 14px rgba(28,51,112,0.18); }
  .cd-ar-rev__card:nth-child(3n+2) .cd-ar-rev__avatar { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 6px 14px rgba(239,102,50,0.22); }
  .cd-ar-rev__card:nth-child(3n+3) .cd-ar-rev__avatar { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 6px 14px rgba(58,168,86,0.22); }
  .cd-ar-rev__meta { display: flex; flex-direction: column; min-width: 0; }
  .cd-ar-rev__name { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; font-weight: 700; color: #1c3370; margin: 0; line-height: 1.2; letter-spacing: -0.005em; text-transform: capitalize; }
  .cd-ar-rev__reviewcount { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; color: #8a94a6; margin: 2px 0 0 0; }
  .cd-ar-rev__footer { margin: 44px auto 0 auto; text-align: center; }
  .cd-ar-rev__more { display: inline-flex; align-items: center; gap: 6px; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; font-weight: 700; color: #25418b; text-decoration: none; padding: 12px 24px; border: 2px solid #25418b; border-radius: 999px; transition: all .2s ease; }
  .cd-ar-rev__more:hover { background: #25418b; color: #ffffff; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(28,51,112,0.2); }
  .cd-ar-rev__more .material-icons { font-size: 18px; }
  @media (max-width: 980px) {
    .cd-ar-rev__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-ar-rev__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-ar-rev__card { padding: 24px 22px 22px 22px; }
  }
</style>
<div class="cd-ar-rev">
  <p class="cd-ar-rev__intro" data-field="intro">{{intro}}</p>
  <div class="cd-ar-rev__grid">
    <div class="cd-ar-rev__card" data-repeat="reviews">
      <span class="cd-ar-rev__quote-mark" aria-hidden="true">&ldquo;</span>
      <div class="cd-ar-rev__stars" aria-label="5 out of 5 stars">
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
      </div>
      <p class="cd-ar-rev__quote" data-field="quote">{{reviews.quote}}</p>
      <div class="cd-ar-rev__byline">
        <div class="cd-ar-rev__avatar" data-field="initials">{{reviews.initials}}</div>
        <div class="cd-ar-rev__meta">
          <p class="cd-ar-rev__name" data-field="name">{{reviews.name}}</p>
          <p class="cd-ar-rev__reviewcount" data-field="reviewCount">{{reviews.reviewCount}}</p>
        </div>
      </div>
    </div>
  </div>
  <div class="cd-ar-rev__footer">
    <a class="cd-ar-rev__more" href="{{moreUrl}}" data-field="moreText">
      <span>{{moreText}}</span>
      <span class="material-icons">arrow_forward</span>
    </a>
  </div>
</div>
`.trim();

const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const REVIEWS_DATA = [
  { name: 'Alfredo Castaneda', reviewCount: '4 reviews', quote: "It's been a pleasure working with Bank of Cardiff. Very professional and knowledgeable customer service. We are blessed to have found them, when other banks denied us loans. Thank you and we hope to keep working together for a better future." },
  { name: 'Katherine Sheldon', reviewCount: '4 reviews', quote: "Cardiff was able to provide me funding where other banks were not. Their representatives were great. They offered me some financial advice in order to get future funding at even better terms which I found very helpful as well. The loan process was very easy and you get funded in less than 48 hours. I will certainly use them again in the future." },
  { name: 'Tolani Turnage', reviewCount: '3 reviews', quote: "Recently got our semi trucks financed through Bank of Cardiff. Never thought we would get the loans approved at one point, but to my surprise we got approved. Not only did we get approved, we got very good interest rates considering this was our very first time financing equipment. It was an awesome experience working with Ally Diaz, she was very polite and helpful." },
  { name: 'Angela Brason', reviewCount: '8 reviews', quote: "I had a great experience with Ms. Tania Stevenson this week. We were in need of a loan to get us through the month, while waiting on payments from net/30 customers. She was very knowledgeable about all of the products that Bank of Cardiff offers. She moved quickly & professionally to meet our needs!" },
  { name: 'Roxy Rodriguez', reviewCount: '2 reviews', quote: "If you need cash just call Saul and Chris they are both amazing people. I never thought I would even get near a loan but they made it happen. The process was easy and fast! I would recommend them 1000x." },
  { name: 'Junior Frett', reviewCount: '1 review', quote: "Had a great experience with Bank of Cardiff. If you need quick and easy finance call them, and specifically ask for Jesse Moore or Sal — they know all the different programs Cardiff offers and better fit your needs. Quick, easy, straight to the point and no bull." },
  { name: 'Rafael Gonzalez', reviewCount: '1 review', quote: "Had a great experience. Great customer service — Sal & Jesse were very helpful. Need a loan? Give them a call." },
  { name: 'Blades of Green', reviewCount: '1 review', quote: "It's always a pleasure to work with John at Bank of Cardiff! We have received nothing less than prompt, attentive, friendly service. Bank of Cardiff gave us comfort and hope during a difficult situation, and we would recommend John Mena to anyone and everyone we know!" },
  { name: 'Marsha Reaves', reviewCount: '1 review', quote: "This is my second time working with Cardiff Bank and I enjoy it. This time around Christian worked with me on getting a bigger loan. I would recommend Cardiff Bank to anyone trying to get a loan. They work with your credit score to get you the best interest rate." },
].map((r) => ({ ...r, initials: initialsOf(r.name) }));

const DEFAULTS = {
  intro: "Here are some reasons our auto-shop customers love working with Cardiff as much as we love working with them.",
  reviews: REVIEWS_DATA,
  moreText: 'See more reviews on Google',
  moreUrl: 'https://www.google.com/search?q=bank+of+cardiff+reviews',
};

const reviewsBlock = {
  id: 'sec-10-reviews',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: REVIEWS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: DEFAULTS.intro },
    {
      name: 'reviews',
      label: 'Customer reviews',
      type: 'repeater',
      fields: [
        { name: 'quote', label: 'Quote', type: 'textarea' },
        { name: 'name', label: 'Reviewer name', type: 'text' },
        { name: 'initials', label: 'Avatar initials', type: 'text' },
        { name: 'reviewCount', label: 'Review count label', type: 'text' },
      ],
    },
    { name: 'moreText', label: 'CTA text', type: 'text', default: DEFAULTS.moreText },
    { name: 'moreUrl', label: 'CTA URL', type: 'url', default: DEFAULTS.moreUrl },
  ],
  values: { ...DEFAULTS },
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

  // Widen so a 3-up card grid breathes.
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
    id: 'sec-10-title',
    order: 1,
    level: 2,
    content: 'What Our Customers Say',
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
    id: 'sec-10-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, reviewsBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-10 -> styled testimonials grid (${REVIEWS_DATA.length} reviews).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
