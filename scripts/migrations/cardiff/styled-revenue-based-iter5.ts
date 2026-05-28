/**
 * Iter 5: Restyle sec-1 of post 828 (revenue-based-business-loans) — the
 * intro narrative band that lives immediately under the hero. Currently this
 * section is 4 long body paragraphs stacked with zero visual treatment, no
 * heading, no breathing room — the single biggest remaining unstyled stretch
 * on the page (iters 1-4 covered hero, sec-3 comparison stack, sec-5 steps,
 * sec-6 "why choose Cardiff").
 *
 * We replace sec-1's sub-blocks with:
 *   1. Centered eyebrow + H2 + orange underline (matches sibling iter2/3/4)
 *   2. A single html-render block carrying:
 *        - A larger, calmer lead paragraph
 *        - A 3-up "what RBL gives you" icon-card grid with data-repeat="points"
 *          so editors can add/remove/reorder points without touching markup
 *        - A closing transition paragraph that hands off to the next section
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632), pink-accent (#ffb798), Raleway + Open Sans. No emojis,
 * Material Icons only.
 *
 * Idempotent: re-running rewrites sec-1's sub-blocks to the same 3-element
 * shape (header + divider + html-render at id `sec-1-intro`). Safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 828;
const TARGET_BLOCK_ID = 'sec-1';

const INTRO_HTML = `
<style>
  .cd-rb-intro { max-width: 1140px; margin: 0 auto; }
  .cd-rb-intro__lead { text-align: center; color: #25418b; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; line-height: 1.7; max-width: 820px; margin: 0 auto 56px auto; font-weight: 500; }
  .cd-rb-intro__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin: 0 0 48px 0; }
  .cd-rb-intro__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 34px 30px; box-shadow: 0 14px 36px rgba(28,51,112,0.07); position: relative; overflow: hidden; transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-rb-intro__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.13); }
  .cd-rb-intro__card::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: linear-gradient(90deg, #25418b 0%, #1c3370 100%); }
  .cd-rb-intro__card:nth-child(2)::after { background: linear-gradient(90deg, #ef6632 0%, #d8501e 100%); }
  .cd-rb-intro__card:nth-child(3)::after { background: linear-gradient(90deg, #5ac96f 0%, #3aa856 100%); }
  .cd-rb-intro__icon { width: 58px; height: 58px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 20px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 10px 22px rgba(28,51,112,0.24); }
  .cd-rb-intro__card:nth-child(2) .cd-rb-intro__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 10px 22px rgba(239,102,50,0.28); }
  .cd-rb-intro__card:nth-child(3) .cd-rb-intro__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 10px 22px rgba(58,168,86,0.28); }
  .cd-rb-intro__icon .material-icons { font-size: 30px; }
  .cd-rb-intro__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-rb-intro__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; flex: 1; }
  .cd-rb-intro__closer { max-width: 820px; margin: 0 auto; padding: 28px 34px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(255,183,152,0.18) 100%); border-radius: 14px; border: 1px solid #e6ecf5; display: flex; align-items: center; gap: 18px; }
  .cd-rb-intro__closer-icon { width: 44px; height: 44px; border-radius: 11px; background: #ef6632; color: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 8px 18px rgba(239,102,50,0.26); }
  .cd-rb-intro__closer-icon .material-icons { font-size: 24px; }
  .cd-rb-intro__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.65; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-rb-intro__grid { grid-template-columns: repeat(2, 1fr); }
    .cd-rb-intro__lead { font-size: 1.0625rem; }
  }
  @media (max-width: 620px) {
    .cd-rb-intro__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-rb-intro__card { padding: 28px 24px; }
    .cd-rb-intro__closer { padding: 22px 22px; flex-direction: column; text-align: center; gap: 14px; }
  }
</style>
<div class="cd-rb-intro">
  <p class="cd-rb-intro__lead" data-field="lead">{{lead}}</p>
  <div class="cd-rb-intro__grid">
    <div class="cd-rb-intro__card" data-repeat="points">
      <div class="cd-rb-intro__icon"><span class="material-icons" data-field="points.icon">{{points.icon}}</span></div>
      <h3 class="cd-rb-intro__card-title" data-field="points.title">{{points.title}}</h3>
      <p class="cd-rb-intro__card-desc" data-field="points.desc">{{points.desc}}</p>
    </div>
  </div>
  <div class="cd-rb-intro__closer">
    <div class="cd-rb-intro__closer-icon"><span class="material-icons" data-field="closerIcon">{{closerIcon}}</span></div>
    <p class="cd-rb-intro__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const INTRO_DEFAULTS = {
  lead:
    "Some months, sales soar. Other times, the numbers dip. For many small businesses, that rhythm is just part of doing business — but traditional loans don't always fit that reality. Fixed payments and rigid terms can strain cash flow when what you really need is flexibility.",
  points: [
    {
      icon: 'sync_alt',
      title: 'Repayment That Flexes With You',
      desc:
        "Revenue-based funding links what you pay to what you earn, so repayment moves at the rhythm of your business instead of fighting against it.",
    },
    {
      icon: 'rocket_launch',
      title: 'Built for Businesses With Momentum',
      desc:
        "Ideal for small businesses that have real revenue but don't always have predictable income — think seasonal swings, growth spurts, and project-based work.",
    },
    {
      icon: 'savings',
      title: 'Working Capital, Fast',
      desc:
        "Cardiff's revenue-based loans give owners fast access to working capital with repayment options that flex alongside cash flow — or fixed payments if you prefer.",
    },
  ],
  closerIcon: 'lightbulb',
  closer:
    "Choosing the best financing for your business always starts with understanding the options — and even within revenue-based financing, you have options.",
} as const;

const introBlock = {
  id: 'sec-1-intro',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: INTRO_HTML,
  fields: [
    { name: 'lead', label: 'Lead paragraph', type: 'textarea', default: INTRO_DEFAULTS.lead },
    {
      name: 'points',
      label: 'Key takeaway cards',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'desc', label: 'Card description', type: 'textarea' },
      ],
    },
    { name: 'closerIcon', label: 'Closer icon (Material icon name)', type: 'text', default: INTRO_DEFAULTS.closerIcon },
    { name: 'closer', label: 'Closing transition paragraph', type: 'textarea', default: INTRO_DEFAULTS.closer },
  ],
  values: { ...INTRO_DEFAULTS },
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

  // Widen so the 3-up card grid breathes; keep the light tinted backdrop so
  // it reads as a clean intro band beneath the hero.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '88px',
    paddingBottom: '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-1-title',
    order: 1,
    level: 2,
    content: 'Funding That Moves With Your Revenue, Not Against It',
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
    id: 'sec-1-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, introBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-1 -> styled intro band (lead + 3-up takeaway grid + closer transition).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
