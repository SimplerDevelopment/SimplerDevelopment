/**
 * Iter 7: Restyle the "Business Rewards Card" feature band on post 797
 * (business-cards). This is sec-3 — currently a centered H2 + orange
 * divider + a default 3-col `card-grid` of 6 features that all share the
 * same generic `check_circle` icon and no visual hierarchy.
 *
 * Cardiff.co's source page presents these as a perks/benefits showcase
 * for the dedicated rewards card; the current port reads as a checklist.
 *
 * We replace sec-3's children with:
 *   1. Centered H2 + orange underline (matches iter3 / iter4 / iter6)
 *   2. Short eyebrow + intro line introducing the card
 *   3. A single html-render block carrying a 3x2 icon-card grid driven by
 *      data-repeat="features" — each card has a brand-tinted icon chip
 *      (rotating blue / orange / green palette), title, and copy.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632), peach (#ffb798) — no emojis, Material Icons only.
 * Raleway titles, Open Sans body.
 *
 * Idempotent: re-running rewrites sec-3 children, keying off id
 *   `sec-3-features`; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 797;
const TARGET_BLOCK_ID = 'sec-3';

const FEATURES_HTML = `
<style>
  .cd-bc-feat { max-width: 1140px; margin: 0 auto; }
  .cd-bc-feat__eyebrow { text-align: center; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #ef6632; margin: 0 0 10px 0; }
  .cd-bc-feat__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 720px; margin: 0 auto 48px auto; }
  .cd-bc-feat__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-bc-feat__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 32px 26px; box-shadow: 0 12px 30px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .cd-bc-feat__card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #1c3370 0%, #25418b 100%); opacity: .85; }
  .cd-bc-feat__card:hover { transform: translateY(-4px); box-shadow: 0 20px 46px rgba(28,51,112,0.13); }
  .cd-bc-feat__icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 6px 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.24); }
  .cd-bc-feat__icon .material-icons { font-size: 26px; }
  .cd-bc-feat__card:nth-child(2) .cd-bc-feat__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.30); }
  .cd-bc-feat__card:nth-child(2)::before { background: linear-gradient(90deg, #ef6632 0%, #ffb798 100%); }
  .cd-bc-feat__card:nth-child(3) .cd-bc-feat__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.30); }
  .cd-bc-feat__card:nth-child(3)::before { background: linear-gradient(90deg, #5ac96f 0%, #3aa856 100%); }
  .cd-bc-feat__card:nth-child(4) .cd-bc-feat__icon { background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); }
  .cd-bc-feat__card:nth-child(5) .cd-bc-feat__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.22); }
  .cd-bc-feat__card:nth-child(5)::before { background: linear-gradient(90deg, #ffb798 0%, #ef6632 100%); }
  .cd-bc-feat__card:nth-child(6) .cd-bc-feat__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bc-feat__card:nth-child(6)::before { background: linear-gradient(90deg, #5ac96f 0%, #3aa856 100%); }
  .cd-bc-feat__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-bc-feat__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-bc-feat__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-bc-feat__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bc-feat__card { padding: 26px 22px; }
  }
</style>
<div class="cd-bc-feat">
  <p class="cd-bc-feat__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
  <p class="cd-bc-feat__intro" data-field="intro">{{intro}}</p>
  <div class="cd-bc-feat__grid">
    <article class="cd-bc-feat__card" data-repeat="features">
      <div class="cd-bc-feat__icon"><span class="material-icons" data-field="icon">{{features.icon}}</span></div>
      <h3 class="cd-bc-feat__title" data-field="title">{{features.title}}</h3>
      <p class="cd-bc-feat__desc" data-field="desc">{{features.desc}}</p>
    </article>
  </div>
</div>
`.trim();

const FEATURES_DEFAULTS = {
  eyebrow: 'Cardiff Rewards',
  intro:
    'Designed for business owners who want premium perks alongside flexible spending power — without the friction of a traditional bank card.',
  features: [
    {
      icon: 'percent',
      title: '0% Introductory APR for 12 Months',
      desc: 'No interest on purchases and balance transfers for a full year — protect cash flow while you scale.',
    },
    {
      icon: 'flight_takeoff',
      title: 'Enhanced Travel Benefits',
      desc: 'Travel perks built for owners and teams who hit the road to grow the business.',
    },
    {
      icon: 'support_agent',
      title: '24/7 Cardmember Service',
      desc: 'Talk to a real person any hour of the day — never waste a business day on hold.',
    },
    {
      icon: 'receipt_long',
      title: 'Detailed Statements & Online Account Management',
      desc: 'A clean dashboard, exportable statements, and real-time visibility into every dollar.',
    },
    {
      icon: 'account_balance_wallet',
      title: 'Separate Personal and Business Expenses',
      desc: 'Keep books clean and audit-ready by putting every business purchase on a dedicated card.',
    },
    {
      icon: 'savings',
      title: 'Exclusive Rewards & Cash Back',
      desc: 'Earn back on the spend you already make — fuel, supplies, software, travel, and more.',
    },
  ],
} as const;

const featuresBlock = {
  id: 'sec-3-features',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: FEATURES_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: FEATURES_DEFAULTS.eyebrow },
    { name: 'intro', label: 'Intro line', type: 'textarea' as const, default: FEATURES_DEFAULTS.intro },
    {
      name: 'features',
      label: 'Rewards-card features',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'star' },
        { name: 'title', label: 'Feature title', type: 'text' as const },
        { name: 'desc', label: 'Feature description', type: 'textarea' as const },
      ],
    },
  ],
  values: {
    eyebrow: FEATURES_DEFAULTS.eyebrow,
    intro: FEATURES_DEFAULTS.intro,
    features: FEATURES_DEFAULTS.features.map((f) => ({ ...f })),
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
    console.error(
      `Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`,
    );
    process.exit(1);
  }

  // Widen to give the 3x2 grid room; keep the white background to set this
  // band apart from the blue-tinted iter4/5/6 neighbors.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#ffffff',
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
    content: 'Business Rewards Card',
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
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 28px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  sec.blocks = [headerBlock, dividerBlock, featuresBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-3 -> styled 3x2 rewards-card feature grid (data-repeat="features").`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
