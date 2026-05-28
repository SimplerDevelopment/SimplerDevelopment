/**
 * Iter 6: Restyle sec-7 of post 828 (revenue-based-business-loans) — the
 * "Which Businesses Benefit from Revenue-Based Business Loans?" section.
 *
 * In iters 1–5 we styled the hero plus sec-1, sec-3, sec-5, sec-6. sec-7 is
 * now the worst-looking remaining section: a centered heading, a one-line
 * intro, and a 5-card card-grid whose titles were mangled by em-dash
 * splitting at import time (`E` / `Service` instead of `E-commerce` /
 * `Service-Based Businesses`). The result is a wall of muddled blue chips
 * with broken industry names.
 *
 * Sibling pattern: styled-equipment-leasing-iter3.ts (icon-card grid). We
 * use data-repeat="industries" with {{industries.field}} placeholders so
 * the cards are repeater-driven (sibling iter5 uses the same convention).
 *
 * Replace sec-7's sub-blocks with:
 *   1. Centered H2 + orange underline (matches iters 2-5)
 *   2. A single html-render block carrying a 5-up icon card grid on a
 *      light-blue band, with an industry-specific Material icon per card
 *      and a clean closing line.
 *
 * Layout: 3-up top row, 2-up bottom row centered (auto-fit grid). Brand
 * palette only — deep blue (#1c3370 / #25418b), green (#5ac96f), orange
 * (#ef6632) accents — no emojis.
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-7-industries` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 828;
const TARGET_BLOCK_ID = 'sec-7';

const INDUSTRIES_HTML = `
<style>
  .cd-rb-ind { max-width: 1140px; margin: 0 auto; }
  .cd-rb-ind__lead { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-rb-ind__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-rb-ind__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-rb-ind__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-rb-ind__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-rb-ind__card:nth-child(2) .cd-rb-ind__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-rb-ind__card:nth-child(4) .cd-rb-ind__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-rb-ind__card:nth-child(5) .cd-rb-ind__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.22); }
  .cd-rb-ind__icon .material-icons { font-size: 30px; }
  .cd-rb-ind__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-rb-ind__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-rb-ind__closer { margin: 48px auto 0 auto; max-width: 820px; text-align: center; padding: 28px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-rb-ind__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-rb-ind__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-rb-ind__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-rb-ind__card { padding: 26px 22px; }
    .cd-rb-ind__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-rb-ind">
  <p class="cd-rb-ind__lead" data-field="lead">{{lead}}</p>
  <div class="cd-rb-ind__grid">
    <div class="cd-rb-ind__card" data-repeat="industries">
      <div class="cd-rb-ind__icon"><span class="material-icons" data-field="industries.icon">{{industries.icon}}</span></div>
      <h3 class="cd-rb-ind__card-title" data-field="industries.title">{{industries.title}}</h3>
      <p class="cd-rb-ind__card-desc" data-field="industries.desc">{{industries.desc}}</p>
    </div>
  </div>
  <div class="cd-rb-ind__closer">
    <p class="cd-rb-ind__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const INDUSTRIES_DEFAULTS = {
  lead:
    'Revenue-based business loans are ideal for businesses in a wide range of industries where income rises and falls with seasons, projects, or campaigns. A few of the verticals we fund most often:',
  industries: [
    {
      icon: 'storefront',
      title: 'Retail',
      desc:
        'Perfect for businesses with fluctuating sales, especially during peak seasons — a revenue-based loan can help you bridge cash flow gaps between busy periods.',
    },
    {
      icon: 'restaurant',
      title: 'Restaurants & Hospitality',
      desc:
        'With varying revenue streams based on seasons, events, or holidays, revenue-based loans are a great way to maintain operations during slower months.',
    },
    {
      icon: 'support_agent',
      title: 'Service-Based Businesses',
      desc:
        'This type of financing can cover staffing costs or fund marketing campaigns during high-demand periods so you never have to slow down when work picks up.',
    },
    {
      icon: 'shopping_cart',
      title: 'E-commerce',
      desc:
        'Online businesses can use revenue-based loans to fund inventory, marketing efforts, or fulfillment needs without overburdening day-to-day cash flow.',
    },
    {
      icon: 'construction',
      title: 'Construction & Contractors',
      desc:
        'For businesses with long gaps between payments, a revenue-based loan ensures you can manage your cash flow and operations until project completion.',
    },
  ],
  closer:
    'If you run a business where income varies over time and you need a flexible way to borrow, a revenue-based business loan from Cardiff could be the perfect fit.',
} as const;

const industriesBlock = {
  id: 'sec-7-industries',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: INDUSTRIES_HTML,
  fields: [
    { name: 'lead', label: 'Lead paragraph', type: 'textarea', default: INDUSTRIES_DEFAULTS.lead },
    {
      name: 'industries',
      label: 'Industry cards',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon name', type: 'text' },
        { name: 'title', label: 'Industry name', type: 'text' },
        { name: 'desc', label: 'Industry description', type: 'textarea' },
      ],
    },
    { name: 'closer', label: 'Closing summary line', type: 'textarea', default: INDUSTRIES_DEFAULTS.closer },
  ],
  values: { ...INDUSTRIES_DEFAULTS },
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

  // Widen so the 3-up top row breathes; light-blue band matches sibling iter5
  // and visually links the two info-dense sections.
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
    id: 'sec-7-title',
    order: 1,
    level: 2,
    content: 'Which Businesses Benefit from Revenue-Based Business Loans?',
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
    id: 'sec-7-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, industriesBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-7 -> styled 5-up industry icon-card grid (data-repeat).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
