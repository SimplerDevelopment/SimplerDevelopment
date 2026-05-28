/**
 * Iter 10: Restyle sec-2 on post 805 (auto-repair) —
 * "Auto Shop Funding That Matches Your Timeline".
 *
 * Currently a stack of 3 bare paragraphs under H2 + orange underline.
 * The other sections on this page (3,4,5,6,7,8) all use the polished
 * gradient icon-tile grid pattern; sec-2 is the last bare-text gap above
 * the fold-adjacent content and still feels like a Word doc.
 *
 * Convert sec-2 to:
 *   1. Centered H2 + orange underline (kept)
 *   2. A full-width html-render with a 3-up icon-card grid carrying the
 *      same three ideas — timing pressure, Cardiff's fast match, and the
 *      "stay in line" outcome — as scannable cards.
 *   3. data-repeat="card" with {{card.field}} so portal editors can add /
 *      remove cards without code changes.
 *
 * Brand palette only — deep blue, orange, green accents — no emojis.
 * Idempotent: replaces sec.blocks each run; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 805;
const TARGET_BLOCK_ID = 'sec-2';

const TIMELINE_HTML = `
<style>
  .cd-ar-tl { max-width: 1140px; margin: 0 auto; }
  .cd-ar-tl__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-ar-tl__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; overflow: hidden; }
  .cd-ar-tl__card::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #25418b 0%, #1c3370 100%); }
  .cd-ar-tl__card:nth-child(2)::after { background: linear-gradient(90deg, #ef6632 0%, #d8501e 100%); }
  .cd-ar-tl__card:nth-child(3)::after { background: linear-gradient(90deg, #5ac96f 0%, #3aa856 100%); }
  .cd-ar-tl__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.14); }
  .cd-ar-tl__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-ar-tl__card:nth-child(2) .cd-ar-tl__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-ar-tl__card:nth-child(3) .cd-ar-tl__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-ar-tl__icon .material-icons { font-size: 30px; }
  .cd-ar-tl__label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; color: #ef6632; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; margin: 0 0 8px 0; }
  .cd-ar-tl__card:nth-child(1) .cd-ar-tl__label { color: #25418b; }
  .cd-ar-tl__card:nth-child(3) .cd-ar-tl__label { color: #3aa856; }
  .cd-ar-tl__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-ar-tl__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-ar-tl__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-ar-tl__card { padding: 26px 22px; }
  }
</style>
<div class="cd-ar-tl">
  <div class="cd-ar-tl__grid">
    <div class="cd-ar-tl__card" data-repeat="card">
      <div class="cd-ar-tl__icon"><span class="material-icons">{{card.icon}}</span></div>
      <div class="cd-ar-tl__label">{{card.label}}</div>
      <h3 class="cd-ar-tl__title">{{card.title}}</h3>
      <p class="cd-ar-tl__desc">{{card.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const TIMELINE_DEFAULTS = {
  cards: [
    {
      icon: 'schedule',
      label: 'The Pressure',
      title: 'Customers Expect Fast Turnarounds',
      desc: 'Timing matters in the auto repair business. Customers expect to pick up their vehicles quickly — that means managing parts, payroll, equipment repairs, and insurance payments without missing a beat.',
    },
    {
      icon: 'bolt',
      label: 'The Match',
      title: 'Funding on Your Timeline',
      desc: 'Cardiff offers auto body shop owners fast financing — flexible products to cover payroll when an insurance company asks for more documentation, or longer-term equipment loans to replace a lift.',
    },
    {
      icon: 'verified',
      label: 'The Outcome',
      title: 'Keep Your Financials in Line',
      desc: 'An auto repair loan with Cardiff helps you keep operations and reputation on track, so the only holes you’re dealing with are the ones in the ground — not in your wallet.',
    },
  ],
} as const;

const timelineBlock = {
  id: 'sec-2-timeline',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: TIMELINE_HTML,
  fields: [
    {
      name: 'cards',
      label: 'Timeline cards',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'label', label: 'Overline label', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'desc', label: 'Card description', type: 'textarea' },
      ],
      default: TIMELINE_DEFAULTS.cards,
    },
  ],
  values: {
    cards: TIMELINE_DEFAULTS.cards.map((c) => ({ ...c })),
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

  // Widen so the 3-col card grid breathes; soft tinted backdrop differentiates
  // this band from the white sections above/below.
  sec.maxWidth = '1200px';
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
    id: 'sec-2-title',
    order: 1,
    level: 2,
    content: 'Auto Shop Funding That Matches Your Timeline',
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
    id: 'sec-2-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, timelineBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-2 -> styled 3-card "Funding That Matches Your Timeline" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
