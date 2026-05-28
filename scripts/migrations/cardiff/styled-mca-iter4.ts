/**
 * Merchant Cash Advance page (post 824) — iter4.
 *
 * Biggest remaining unstyled section: sec-3 "What does it take to qualify for
 * working capital financing?" — 12 bare children (intro H2 + divider + 2
 * intro paragraphs + 4 H4/paragraph requirement pairs: Time in Business /
 * Revenue / US Citizenship / Ownership). Currently rendered as a flat
 * single-column text wall with no visual structure for the qualification
 * criteria.
 *
 * cardiff.co presents the qualification requirements as visually distinct
 * cards. We rewrite sec-3.blocks to:
 *   1. Centered H2 + orange underline (same pattern as iter2/iter3)
 *   2. A single html-render block carrying an intro paragraph + a 4-up icon
 *      card grid (one card per requirement) on a light blue-tinted backdrop.
 *
 * Layout: 4-col grid on desktop (1140px container), 2-col at 1100px, 1-col at
 * 620px. Each card has a circular gradient icon chip (Material Icons), title,
 * and copy. Brand palette: #1c3370 / #25418b deep blue, #5ac96f green,
 * #ef6632 orange, #ffb798 peach — no emojis (Material Icons only).
 * Fonts: Raleway (headings) + Open Sans (body).
 *
 * Field convention: bare {{field}} (NOT inside a data-repeat loop), matching
 * the iter3 template pattern.
 *
 * Idempotent: re-running detects an existing `sec-3-quals` html-render child
 * block and refreshes html/values; if missing, replaces sec-3.blocks wholesale
 * (section type asserted).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 824;
const TARGET_BLOCK_ID = 'sec-3';

const QUALS_HTML = `
<style>
  .cd-mca-quals { max-width: 1140px; margin: 0 auto; }
  .cd-mca-quals__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 820px; margin: 0 auto 48px auto; }
  .cd-mca-quals__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-mca-quals__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 32px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-mca-quals__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-mca-quals__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 20px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-mca-quals__card:nth-child(2) .cd-mca-quals__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-mca-quals__card:nth-child(3) .cd-mca-quals__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-mca-quals__card:nth-child(4) .cd-mca-quals__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.40); }
  .cd-mca-quals__icon .material-icons { font-size: 30px; }
  .cd-mca-quals__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-mca-quals__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-mca-quals__credit { margin: 48px auto 0 auto; max-width: 860px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-mca-quals__credit-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 1100px) {
    .cd-mca-quals__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-mca-quals__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-mca-quals__card { padding: 26px 22px; }
    .cd-mca-quals__credit { padding: 22px 20px; }
  }
</style>
<div class="cd-mca-quals">
  <p class="cd-mca-quals__intro" data-field="intro">{{intro}}</p>
  <div class="cd-mca-quals__grid">
    <div class="cd-mca-quals__card">
      <div class="cd-mca-quals__icon"><span class="material-icons" data-field="icon1">{{icon1}}</span></div>
      <h3 class="cd-mca-quals__card-title" data-field="card1Title">{{card1Title}}</h3>
      <p class="cd-mca-quals__card-desc" data-field="card1Desc">{{card1Desc}}</p>
    </div>
    <div class="cd-mca-quals__card">
      <div class="cd-mca-quals__icon"><span class="material-icons" data-field="icon2">{{icon2}}</span></div>
      <h3 class="cd-mca-quals__card-title" data-field="card2Title">{{card2Title}}</h3>
      <p class="cd-mca-quals__card-desc" data-field="card2Desc">{{card2Desc}}</p>
    </div>
    <div class="cd-mca-quals__card">
      <div class="cd-mca-quals__icon"><span class="material-icons" data-field="icon3">{{icon3}}</span></div>
      <h3 class="cd-mca-quals__card-title" data-field="card3Title">{{card3Title}}</h3>
      <p class="cd-mca-quals__card-desc" data-field="card3Desc">{{card3Desc}}</p>
    </div>
    <div class="cd-mca-quals__card">
      <div class="cd-mca-quals__icon"><span class="material-icons" data-field="icon4">{{icon4}}</span></div>
      <h3 class="cd-mca-quals__card-title" data-field="card4Title">{{card4Title}}</h3>
      <p class="cd-mca-quals__card-desc" data-field="card4Desc">{{card4Desc}}</p>
    </div>
  </div>
  <div class="cd-mca-quals__credit">
    <p class="cd-mca-quals__credit-text" data-field="creditNote">{{creditNote}}</p>
  </div>
</div>
`.trim();

const QUALS_DEFAULTS = {
  intro: "Many businesses qualify for working capital lending — you only need evidence that you have a business and that the loan can be repaid. Cardiff’s baseline qualification criteria are straightforward, with flexibility built in for businesses that don’t fit a one-size-fits-all credit box.",
  icon1: 'event_available',
  card1Title: 'Time in Business',
  card1Desc: 'We look for at least 1 year or more of time in business so we can see a track record of operations and revenue.',
  icon2: 'trending_up',
  card2Title: 'Monthly Revenue',
  card2Desc: '$20,000/month — or $240,000 in annual sales — with a minimum of three deposits per month into your business account.',
  icon3: 'public',
  card3Title: 'Residency',
  card3Desc: 'US citizenship is not required. Cardiff only requires that the business owner be a legal resident of the United States.',
  icon4: 'badge',
  card4Title: 'Ownership',
  card4Desc: 'Any owner can execute the funding contract regardless of their percentage of ownership in the business.',
  creditNote: 'Personal credit isn’t weighted as heavily as other commercial credit factors — but a good rule of thumb is that if your score is over 500, you’re in the clear to apply.',
} as const;

const qualsBlock = {
  id: 'sec-3-quals',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: QUALS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: QUALS_DEFAULTS.intro },
    { name: 'icon1', label: 'Card 1 — icon', type: 'text', default: QUALS_DEFAULTS.icon1 },
    { name: 'card1Title', label: 'Card 1 — title', type: 'text', default: QUALS_DEFAULTS.card1Title },
    { name: 'card1Desc', label: 'Card 1 — description', type: 'textarea', default: QUALS_DEFAULTS.card1Desc },
    { name: 'icon2', label: 'Card 2 — icon', type: 'text', default: QUALS_DEFAULTS.icon2 },
    { name: 'card2Title', label: 'Card 2 — title', type: 'text', default: QUALS_DEFAULTS.card2Title },
    { name: 'card2Desc', label: 'Card 2 — description', type: 'textarea', default: QUALS_DEFAULTS.card2Desc },
    { name: 'icon3', label: 'Card 3 — icon', type: 'text', default: QUALS_DEFAULTS.icon3 },
    { name: 'card3Title', label: 'Card 3 — title', type: 'text', default: QUALS_DEFAULTS.card3Title },
    { name: 'card3Desc', label: 'Card 3 — description', type: 'textarea', default: QUALS_DEFAULTS.card3Desc },
    { name: 'icon4', label: 'Card 4 — icon', type: 'text', default: QUALS_DEFAULTS.icon4 },
    { name: 'card4Title', label: 'Card 4 — title', type: 'text', default: QUALS_DEFAULTS.card4Title },
    { name: 'card4Desc', label: 'Card 4 — description', type: 'textarea', default: QUALS_DEFAULTS.card4Desc },
    { name: 'creditNote', label: 'Credit score note', type: 'textarea', default: QUALS_DEFAULTS.creditNote },
  ],
  values: { ...QUALS_DEFAULTS },
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

  // Widen so the 4-col card grid breathes.
  sec.maxWidth = '1200px';
  // Soft blue-tinted background to set this band apart from neighbors.
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
    content: 'What Does It Take to Qualify?',
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
  sec.blocks = [headerBlock, dividerBlock, qualsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-3 -> styled 4-card "Qualify" grid (${parsed.blocks.length} top-level blocks).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
