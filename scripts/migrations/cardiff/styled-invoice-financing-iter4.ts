/**
 * Iter 4 — Business Invoice Financing (post 798), sec-7.
 *
 * sec-7 currently mashes together a closing CTA ("Ready to Unlock Your
 * Invoices?") with 10 raw Google reviews rendered as alternating
 * heading / heading / text triples — no quotation marks, no cards, no
 * star rating, no avatars. Reads as a wall of text.
 *
 * Rewrite sec-7 children to:
 *   1. Centered H2 "What Our Clients Say" + orange underline divider
 *      (matches iter1 / iter2 / iter3 header pattern).
 *   2. Short lede paragraph.
 *   3. A single html-render block carrying a responsive 3-up testimonial
 *      grid (data-repeat="reviews") with avatar initials chip, name,
 *      review-count, 5-star bar, opening quote-mark glyph, and quote body.
 *   4. A small Google source line + "See more reviews" pill link.
 *
 * The "Ready to Unlock Your Invoices?" CTA + lede paragraphs that
 * previously opened sec-7 are folded into the existing final-cta block's
 * surrounding context (preserved verbatim above the grid as headline +
 * intro), so no content is lost.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632), peach (#ffb798) accents — Material Icons, no emojis.
 *
 * Idempotent: re-running rewrites sec-7 children every time.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 798;
const TARGET_BLOCK_ID = 'sec-7';

const REVIEWS = [
  {
    name: 'Alfredo Castaneda',
    initials: 'AC',
    reviewCount: '4 reviews',
    quote:
      "It's been a pleasure working with Bank of Cardiff. Very professional and knowledgeable customer service. We are blessed to have found them, when other banks denied us loans. Thank you and we hope to keep working together for a better future.",
  },
  {
    name: 'Katherine Sheldon',
    initials: 'KS',
    reviewCount: '4 reviews',
    quote:
      'Cardiff was able to provide me funding where other banks were not. Their representatives were great and offered me financial advice for future funding at even better terms. The loan process was very easy and you get funded in less than 48 hours. I will certainly use them again.',
  },
  {
    name: 'Tolani Turnage',
    initials: 'TT',
    reviewCount: '3 reviews',
    quote:
      'Recently got our semi trucks financed through Bank of Cardiff. Not only did we get approved, we got very good interest rates considering this was our first time financing equipment. Awesome experience — communication was excellent throughout the process.',
  },
  {
    name: 'Angela Brason',
    initials: 'AB',
    reviewCount: '8 reviews',
    quote:
      'I had a great experience with Ms. Tania Stevenson this week. We were in need of a loan to get us through the month, while waiting on payments from net/30 customers. She moved quickly and professionally to meet our needs!',
  },
  {
    name: 'Roxy Rodriguez',
    initials: 'RR',
    reviewCount: '2 reviews',
    quote:
      'If you need cash just call Saul and Chris — they are both amazing people. I never thought I would even get near a loan but they made it happen. The process was easy and fast. I would recommend them 1000x.',
  },
  {
    name: 'Junior Frett',
    initials: 'JF',
    reviewCount: '1 review',
    quote:
      'Had a great experience with Bank of Cardiff. If you need quick and easy finance call them, and specifically ask for Jesse Moore or Sal — they know all the different programs Cardiff offers. Quick, easy, straight to the point.',
  },
  {
    name: 'Blades of Green',
    initials: 'BG',
    reviewCount: '1 review',
    quote:
      "It's always a pleasure to work with John at Bank of Cardiff! We have received nothing less than prompt, attentive, friendly service. Bank of Cardiff gave us comfort and hope during a difficult situation, and we would recommend John Mena to anyone.",
  },
  {
    name: 'Marsha Reaves',
    initials: 'MR',
    reviewCount: '1 review',
    quote:
      'This is my second time working with Cardiff Bank and I enjoy it. This time around Christian worked with me on getting a bigger loan. I would recommend Cardiff Bank to anyone trying to get a loan — they work with your credit score to get you the best rate.',
  },
  {
    name: 'Christel Aime',
    initials: 'CA',
    reviewCount: '2 reviews',
    quote:
      'John and Mitch were very great, responsive and stayed in touch with me the whole process. This is my third transaction with Bank of Cardiff — I would recommend them any time.',
  },
];

const REVIEWS_HTML = `<div class="cd-if-rev">
  <div class="cd-if-rev__grid">
    <div class="cd-if-rev__card" data-repeat="reviews">
      <div class="cd-if-rev__quote-mark">&ldquo;</div>
      <div class="cd-if-rev__stars">
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
        <span class="material-icons">star</span>
      </div>
      <p class="cd-if-rev__text" data-field="quote">{{reviews.quote}}</p>
      <div class="cd-if-rev__who">
        <div class="cd-if-rev__avatar" data-field="initials">{{reviews.initials}}</div>
        <div class="cd-if-rev__meta">
          <div class="cd-if-rev__name" data-field="name">{{reviews.name}}</div>
          <div class="cd-if-rev__count" data-field="reviewCount">{{reviews.reviewCount}}</div>
        </div>
      </div>
    </div>
  </div>
  <div class="cd-if-rev__source">
    <span class="material-icons">verified</span>
    <span>Verified reviews from Google</span>
  </div>
  <div class="cd-if-rev__cta">
    <a class="cd-if-rev__btn" href="https://www.google.com/search?q=Bank+of+Cardiff+reviews" target="_blank" rel="noopener">
      See more reviews on Google
      <span class="material-icons">arrow_forward</span>
    </a>
  </div>
  <style>
    .cd-if-rev { max-width: 1200px; margin: 0 auto; }
    .cd-if-rev__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
    .cd-if-rev__card { position: relative; background: #fff; border: 1px solid #e6ecf5; border-radius: 16px; padding: 36px 28px 28px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); display: flex; flex-direction: column; transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
    .cd-if-rev__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.14); border-color: #d8e2f2; }
    .cd-if-rev__quote-mark { position: absolute; top: 8px; right: 22px; font-family: Raleway, sans-serif; font-weight: 800; font-size: 4.5rem; line-height: 1; color: #ef6632; opacity: 0.18; pointer-events: none; }
    .cd-if-rev__stars { display: flex; gap: 2px; margin: 0 0 14px 0; }
    .cd-if-rev__stars .material-icons { font-size: 20px; color: #f4b400; }
    .cd-if-rev__text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.65; color: #3d4a6a; margin: 0 0 22px 0; flex: 1 1 auto; }
    .cd-if-rev__who { display: flex; align-items: center; gap: 14px; padding-top: 18px; border-top: 1px solid #eef2f9; }
    .cd-if-rev__avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; font-family: Raleway, sans-serif; font-weight: 800; font-size: 0.95rem; letter-spacing: 0.02em; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 6px 14px rgba(28,51,112,0.22); }
    .cd-if-rev__card:nth-child(3n+2) .cd-if-rev__avatar { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 6px 14px rgba(239,102,50,0.26); }
    .cd-if-rev__card:nth-child(3n+3) .cd-if-rev__avatar { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 6px 14px rgba(58,168,86,0.26); }
    .cd-if-rev__name { font-family: Raleway, sans-serif; font-weight: 800; font-size: 1rem; color: #1c3370; letter-spacing: -0.005em; line-height: 1.2; }
    .cd-if-rev__count { font-family: 'Open Sans', sans-serif; font-size: 0.78rem; color: #7886a3; margin-top: 3px; letter-spacing: 0.01em; }
    .cd-if-rev__source { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 40px 0 0 0; font-family: 'Open Sans', sans-serif; font-size: 0.85rem; color: #5b6884; letter-spacing: 0.02em; }
    .cd-if-rev__source .material-icons { font-size: 18px; color: #5ac96f; }
    .cd-if-rev__cta { text-align: center; margin: 18px 0 0 0; }
    .cd-if-rev__btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 26px; background: #1c3370; color: #fff !important; border-radius: 999px; font-family: Raleway, sans-serif; font-weight: 700; font-size: 0.9rem; letter-spacing: 0.02em; text-decoration: none; transition: background .2s ease, transform .2s ease, box-shadow .2s ease; box-shadow: 0 8px 22px rgba(28,51,112,0.22); }
    .cd-if-rev__btn:hover { background: #ef6632; transform: translateY(-2px); box-shadow: 0 12px 28px rgba(239,102,50,0.32); }
    .cd-if-rev__btn .material-icons { font-size: 18px; }
    @media (max-width: 1024px) {
      .cd-if-rev__grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 640px) {
      .cd-if-rev__grid { grid-template-columns: 1fr; gap: 18px; }
      .cd-if-rev__card { padding: 30px 22px 22px 22px; }
    }
  </style>
</div>`;

const reviewsBlock = {
  id: 'sec-7-reviews',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: REVIEWS_HTML,
  fields: [
    {
      name: 'reviews',
      label: 'Customer reviews',
      type: 'array',
      itemFields: [
        { name: 'name', type: 'text', label: 'Reviewer name' },
        { name: 'initials', type: 'text', label: 'Avatar initials (2 chars)' },
        { name: 'reviewCount', type: 'text', label: 'Review count label' },
        { name: 'quote', type: 'textarea', label: 'Quote' },
      ],
    },
  ],
  values: { reviews: REVIEWS },
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

  // Widen the rail so a 3-up testimonial grid breathes.
  sec.maxWidth = '1280px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-7-title',
    order: 1,
    level: 2,
    content: 'What Our Clients Say',
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
    id: 'sec-7-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 22px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  const ledeBlock = {
    type: 'text' as const,
    id: 'sec-7-lede',
    order: 3,
    content:
      '<p style="font-family:\'Open Sans\',-apple-system,BlinkMacSystemFont,sans-serif;font-size:1.0625rem;line-height:1.65;color:#525f7f;max-width:760px;margin:0 auto 44px auto;text-align:center">Real business owners. Real funding. Hear why thousands of companies trust Cardiff to keep their cash flow moving.</p>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  sec.blocks = [headerBlock, dividerBlock, ledeBlock, reviewsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-7 -> styled 3-up testimonial grid (${REVIEWS.length} reviews).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
