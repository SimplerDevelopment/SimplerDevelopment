/**
 * Iter 5: Add a "Why Choose Cardiff for Trucking Loans" benefits band on
 * post 817 (industries-trucking). Iters 1-4 styled the hero, stats (sec-1),
 * loan-products grid (sec-2), and customer testimonials (sec-3). The page
 * then jumps straight from reviews to the final CTA with no benefits/value
 * recap — visually the biggest remaining gap before the close.
 *
 * This inserts a new `section` block id=`sec-4-why` *before* final-cta:
 *   1. Centered H2 + orange underline (matches iter2/iter3/iter4 pattern)
 *   2. One html-render block carrying a 4-up icon card grid on a
 *      light-blue background, with a closing summary band.
 *
 * The 4 cards are trucking-specific: same-day funding, fleet/equipment-
 * friendly underwriting, seasonal/revenue-based repayment, and credit
 * flexibility — derived from the loan-product copy already on the page
 * plus the brand's general "why us" pillars.
 *
 * Idempotent: re-running detects existing section id `sec-4-why` and
 * rewrites it in place (preserving its position between sec-3 and
 * final-cta); safe to re-run.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632) accents. Raleway + Open Sans. Material Icons, no
 * emojis.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 817;
const NEW_SECTION_ID = 'sec-4-why';
const INSERT_BEFORE_ID = 'final-cta';

const WHY_HTML = `
<style>
  .cd-trk-why { max-width: 1140px; margin: 0 auto; }
  .cd-trk-why__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-trk-why__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-trk-why__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-trk-why__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-trk-why__icon { width: 54px; height: 54px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-trk-why__card:nth-child(2) .cd-trk-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-trk-why__card:nth-child(3) .cd-trk-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-trk-why__card:nth-child(4) .cd-trk-why__icon { background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-trk-why__icon .material-icons { font-size: 28px; }
  .cd-trk-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-trk-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-trk-why__closer { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 26px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-trk-why__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 1080px) {
    .cd-trk-why__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-trk-why__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-trk-why__card { padding: 26px 22px; }
    .cd-trk-why__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-trk-why">
  <p class="cd-trk-why__intro" data-field="intro">{{intro}}</p>
  <div class="cd-trk-why__grid">
    <div class="cd-trk-why__card" data-repeat="cards">
      <div class="cd-trk-why__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <h3 class="cd-trk-why__card-title" data-field="title">{{cards.title}}</h3>
      <p class="cd-trk-why__card-desc" data-field="desc">{{cards.desc}}</p>
    </div>
  </div>
  <div class="cd-trk-why__closer">
    <p class="cd-trk-why__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const WHY_DEFAULTS = {
  intro: 'Trucking businesses run on tight margins and tighter timelines. Cardiff was built to keep your wheels turning — with funding terms designed around the realities of the road.',
  cards: [
    {
      icon: 'bolt',
      title: 'Same-Day Funding',
      desc: 'Apply online in minutes and receive a decision the same day. When a repair, fuel run, or new contract can’t wait, Cardiff moves at the speed of your business.',
    },
    {
      icon: 'local_shipping',
      title: 'Fleet & Equipment Friendly',
      desc: 'Whether you’re buying your first rig or expanding a fleet, our underwriters understand trucking. Equipment financing is often easier to qualify for because the asset itself secures the loan.',
    },
    {
      icon: 'tune',
      title: 'Revenue-Based Repayment',
      desc: 'Freight payments don’t arrive on a fixed schedule — your repayments shouldn’t either. We structure terms around your real cash flow, so slow weeks don’t become missed payments.',
    },
    {
      icon: 'verified_user',
      title: 'Credit Flexibility',
      desc: 'A bumpy credit history won’t stop the conversation. Cardiff looks at the overall health of your trucking business — revenue, runtime, and run rate — not just a single score.',
    },
  ],
  closer: 'From owner-operators picking up their second truck to multi-truck carriers scaling a fleet, Cardiff has the financing tools to keep your business rolling forward.',
} as const;

const whyBlock = {
  id: 'sec-4-why-render',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: WHY_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: WHY_DEFAULTS.intro },
    {
      name: 'cards',
      label: 'Benefit cards',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Icon (Material Icons name)', type: 'text', default: 'bolt' },
        { name: 'title', label: 'Card title', type: 'text', default: '' },
        { name: 'desc', label: 'Card description', type: 'textarea', default: '' },
      ],
      default: WHY_DEFAULTS.cards,
    },
    { name: 'closer', label: 'Closing summary', type: 'textarea', default: WHY_DEFAULTS.closer },
  ],
  values: { ...WHY_DEFAULTS },
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

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-4-why-title',
    order: 1,
    level: 2,
    content: 'Why Choose Cardiff for Trucking Loans',
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
    id: 'sec-4-why-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  const newSection = {
    type: 'section' as const,
    id: NEW_SECTION_ID,
    order: 4,
    maxWidth: '1200px',
    style: {
      backgroundColor: '#ffffff',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [headerBlock, dividerBlock, whyBlock],
  };

  // Idempotent: if sec-4-why already exists, replace it in place.
  const existingIdx = parsed.blocks.findIndex((b: any) => b?.id === NEW_SECTION_ID);
  if (existingIdx !== -1) {
    parsed.blocks[existingIdx] = newSection;
    console.log(`Replaced existing block ${NEW_SECTION_ID} at index ${existingIdx}`);
  } else {
    // Insert before final-cta.
    const ctaIdx = parsed.blocks.findIndex((b: any) => b?.id === INSERT_BEFORE_ID);
    if (ctaIdx === -1) {
      console.error(`Post ${POST_ID}: no block with id=${INSERT_BEFORE_ID}; aborting`);
      process.exit(1);
    }
    parsed.blocks.splice(ctaIdx, 0, newSection);
    console.log(`Inserted ${NEW_SECTION_ID} before ${INSERT_BEFORE_ID} (index ${ctaIdx})`);
  }

  // Re-number `order` on top-level blocks so final-cta sits last.
  parsed.blocks.forEach((b: any, i: number) => {
    if (typeof b === 'object' && b !== null) b.order = i + 1;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: added 4-card "Why Choose Cardiff for Trucking Loans" benefits band.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
