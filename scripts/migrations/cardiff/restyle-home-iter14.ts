/**
 * Iter 14: Restyle the "Why Cardiff" band on the home page (post 793, block
 * id `why`). The current treatment is overline + big headline + two centered
 * paragraphs on a narrow 760px column — visually bland for a "why us" anchor
 * section that sits right between the mid-CTA and the FAQ.
 *
 * We keep the existing crisp overline + headline + orange divider but trade
 * the two paragraphs for a 4-pillar reasons grid (icon chip + title + body)
 * built as a single html-render block using `data-repeat="pillars"`, plus a
 * closing summary that earns the "we make it possible" payoff.
 *
 * Layout: 4-up auto-grid on desktop, 2-up on tablet, 1-up on mobile. Cards
 * lift slightly on hover. Brand-only palette — deep blue (#1c3370 / #25418b),
 * green (#5ac96f), orange (#ef6632), peach (#ffb798), Raleway + Open Sans.
 * Material Icons only (no emojis).
 *
 * Idempotent: re-running rewrites sec `why` blocks in place; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 793;
const TARGET_BLOCK_ID = 'why';

const PILLARS_HTML = `
<style>
  .cd-why { max-width: 1140px; margin: 0 auto; }
  .cd-why__lede { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 56px auto; }
  .cd-why__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-why__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 30px 26px 28px 26px; box-shadow: 0 10px 28px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; display: flex; flex-direction: column; overflow: hidden; }
  .cd-why__card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #25418b 0%, #5ac96f 100%); opacity: 0; transition: opacity .25s ease; }
  .cd-why__card:hover { transform: translateY(-4px); box-shadow: 0 20px 44px rgba(28,51,112,0.14); border-color: #d4dff0; }
  .cd-why__card:hover::before { opacity: 1; }
  .cd-why__icon { width: 54px; height: 54px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 20px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 20px rgba(28,51,112,0.22); }
  .cd-why__card:nth-child(2) .cd-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 20px rgba(239,102,50,0.28); }
  .cd-why__card:nth-child(3) .cd-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 20px rgba(58,168,86,0.28); }
  .cd-why__card:nth-child(4) .cd-why__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 20px rgba(255,183,152,0.45); }
  .cd-why__icon .material-icons { font-size: 28px; }
  .cd-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-why__closer { margin: 52px auto 0 auto; max-width: 860px; text-align: center; padding: 30px 36px; background: linear-gradient(135deg, rgba(28,51,112,0.05) 0%, rgba(239,102,50,0.07) 100%); border-radius: 14px; border: 1px solid #e6ecf5; }
  .cd-why__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.125rem; line-height: 1.65; color: #25418b; margin: 0; font-weight: 600; letter-spacing: -0.005em; }
  @media (max-width: 1100px) {
    .cd-why__grid { grid-template-columns: repeat(2, 1fr); gap: 20px; }
  }
  @media (max-width: 620px) {
    .cd-why__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-why__card { padding: 26px 22px; }
    .cd-why__closer { padding: 24px 22px; }
    .cd-why__closer-text { font-size: 1.0625rem; }
  }
</style>
<div class="cd-why">
  <p class="cd-why__lede" data-field="lede">{{lede}}</p>
  <div class="cd-why__grid">
    <div class="cd-why__card" data-repeat="pillars">
      <div class="cd-why__icon"><span class="material-icons" data-field="icon">{{pillars.icon}}</span></div>
      <h3 class="cd-why__card-title" data-field="title">{{pillars.title}}</h3>
      <p class="cd-why__card-desc" data-field="desc">{{pillars.desc}}</p>
    </div>
  </div>
  <div class="cd-why__closer">
    <p class="cd-why__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const PILLARS_DEFAULTS = {
  lede:
    "At Cardiff, we understand that momentum matters. You aren't just chasing numbers — you're building teams, launching products, signing leases, and growing your reach. Every day lost to outdated underwriting is a missed opportunity.",
  pillars: [
    {
      icon: 'bolt',
      title: 'Decisions in Hours, Not Weeks',
      desc: 'A streamlined online application and same-day decisioning — so you can act on the opportunity in front of you instead of waiting on a bank.',
    },
    {
      icon: 'insights',
      title: 'The Full Picture',
      desc: 'We look beyond the credit score at revenue trends, cash flow, and business potential — the things that actually predict whether you can grow.',
    },
    {
      icon: 'handshake',
      title: 'A Real Partner',
      desc: 'You get a human who learns your business, not a portal that pings you. Guidance from short-term cash flow through long-term growth capital.',
    },
    {
      icon: 'rocket_launch',
      title: 'Built for Momentum',
      desc: 'Repayment terms that flex with your revenue cycles, capital that scales as you scale — financing that keeps pace with the business you are building.',
    },
  ],
  closer: "When you're ready to move, Cardiff makes it possible.",
} as const;

const pillarsBlock = {
  id: 'why-pillars',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: PILLARS_HTML,
  fields: [
    { name: 'lede', label: 'Lede paragraph', type: 'textarea', default: PILLARS_DEFAULTS.lede },
    {
      name: 'pillars',
      label: 'Reason pillars',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Pillar title', type: 'text' },
        { name: 'desc', label: 'Pillar description', type: 'textarea' },
      ],
      default: PILLARS_DEFAULTS.pillars,
    },
    { name: 'closer', label: 'Closing payoff line', type: 'textarea', default: PILLARS_DEFAULTS.closer },
  ],
  values: { ...PILLARS_DEFAULTS },
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
    console.error(`Post ${POST_ID}: ${TARGET_BLOCK_ID} is not a section (was ${sec.type})`);
    process.exit(1);
  }

  // Widen so the 4-up card grid breathes; tint bg to lift the band off neighbors.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '88px',
    paddingBottom: '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const overlineBlock = {
    type: 'heading' as const,
    id: 'why-overline',
    order: 1,
    level: 6,
    content: 'WHY CARDIFF',
    alignment: 'center' as const,
    style: {
      color: '#ef6632',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '0.6875rem',
      fontWeight: '700',
      letterSpacing: '0.32em',
      textTransform: 'uppercase',
      margin: '0 0 16px 0',
      textAlign: 'center',
    },
  };
  const titleBlock = {
    type: 'heading' as const,
    id: 'why-title',
    order: 2,
    level: 2,
    content: "When you're ready to move, we make it possible.",
    alignment: 'center' as const,
    style: {
      color: '#25418b',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '2.5rem',
      fontWeight: '800',
      letterSpacing: '-0.018em',
      lineHeight: '1.15',
      margin: '0 auto 20px auto',
      maxWidth: '900px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'why-div',
    order: 3,
    content: '<div style="width:60px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  sec.blocks = [overlineBlock, titleBlock, dividerBlock, pillarsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: block "${TARGET_BLOCK_ID}" -> 4-pillar grid + closer.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
