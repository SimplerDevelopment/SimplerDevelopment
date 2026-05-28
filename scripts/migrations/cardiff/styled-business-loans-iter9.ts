/**
 * Iter 9: Restyle the "Let's Fund Your Next Step" section on post 800
 * (business-loans). Currently sec-9 is bare heading + divider + three
 * stacked text paragraphs — visually identical to a footer caption and
 * disconnected from the icon-card pattern used elsewhere on the page.
 *
 * We rebuild sec-9 sub-blocks as:
 *   1. Centered H2 + orange underline (matches sibling sections)
 *   2. A single html-render block with a 3-up icon-card grid on a soft
 *      blue tint, using Material Icons (no emojis), brand palette only
 *      (#1c3370 / #25418b / #5ac96f / #ef6632), Raleway + Open Sans.
 *      Closes with a centered CTA chip linking to /apply.
 *
 * The 3 cards iterate via data-repeat="card" against `cards` so they can
 * be edited in the portal.
 *
 * Idempotent: re-running rewrites sec-9.blocks in full; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 800;
const TARGET_BLOCK_ID = 'sec-9';

const FUND_HTML = `
<style>
  .cd-bl-fund { max-width: 1140px; margin: 0 auto; }
  .cd-bl-fund__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-bl-fund__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-bl-fund__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-bl-fund__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bl-fund__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-bl-fund__card:nth-child(2) .cd-bl-fund__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bl-fund__card:nth-child(3) .cd-bl-fund__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bl-fund__icon .material-icons { font-size: 30px; }
  .cd-bl-fund__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-bl-fund__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-bl-fund__cta-wrap { margin: 48px auto 0 auto; text-align: center; }
  .cd-bl-fund__cta { display: inline-flex; align-items: center; gap: 10px; padding: 16px 32px; background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); color: #ffffff; text-decoration: none; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; font-weight: 700; letter-spacing: 0.02em; border-radius: 999px; box-shadow: 0 12px 28px rgba(239,102,50,0.32); transition: transform .25s ease, box-shadow .25s ease; }
  .cd-bl-fund__cta:hover { transform: translateY(-2px); box-shadow: 0 18px 36px rgba(239,102,50,0.42); }
  .cd-bl-fund__cta .material-icons { font-size: 20px; }
  .cd-bl-fund__cta-sub { margin: 16px auto 0 auto; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; color: #6b7794; max-width: 620px; line-height: 1.6; }
  @media (max-width: 980px) {
    .cd-bl-fund__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-bl-fund__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bl-fund__card { padding: 26px 22px; }
    .cd-bl-fund__cta { padding: 14px 26px; font-size: 0.9375rem; }
  }
</style>
<div class="cd-bl-fund">
  <p class="cd-bl-fund__intro" data-field="intro">{{intro}}</p>
  <div class="cd-bl-fund__grid">
    <div class="cd-bl-fund__card" data-repeat="card">
      <div class="cd-bl-fund__icon"><span class="material-icons">{{card.icon}}</span></div>
      <h3 class="cd-bl-fund__card-title">{{card.title}}</h3>
      <p class="cd-bl-fund__card-desc">{{card.desc}}</p>
    </div>
  </div>
  <div class="cd-bl-fund__cta-wrap">
    <a class="cd-bl-fund__cta" href="{{ctaHref}}">
      <span>{{ctaLabel}}</span>
      <span class="material-icons">arrow_forward</span>
    </a>
    <p class="cd-bl-fund__cta-sub" data-field="ctaSub">{{ctaSub}}</p>
  </div>
</div>
`.trim();

const FUND_DEFAULTS = {
  intro:
    "You’ve worked too hard at your business to be held back by funding gaps. With Cardiff, you don’t have to — our small business loans are designed to help you act quickly and confidently.",
  cards: [
    {
      icon: 'savings',
      title: 'Protect your cash',
      desc: 'Keep your personal savings intact and your emergency fund untouched while you fund the next move.',
    },
    {
      icon: 'credit_card_off',
      title: 'Skip the credit cards',
      desc: 'Avoid maxing out high-interest cards or burning a personal line of credit on a business expense.',
    },
    {
      icon: 'bolt',
      title: 'Move at business speed',
      desc: 'Same-day decisions and fast funding mean opportunities don’t sit waiting on a slow bank.',
    },
  ],
  ctaLabel: 'Apply Now',
  ctaHref: '/apply',
  ctaSub: 'Ready to get a business loan that actually works for your business? Apply now to take the next step.',
} as const;

const fundBlock = {
  id: 'sec-9-fund',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: FUND_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: FUND_DEFAULTS.intro },
    {
      name: 'cards',
      label: 'Benefit cards',
      type: 'repeater',
      itemFields: [
        { name: 'icon', label: 'Material Icon name', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
      default: FUND_DEFAULTS.cards,
    },
    { name: 'ctaLabel', label: 'CTA button label', type: 'text', default: FUND_DEFAULTS.ctaLabel },
    { name: 'ctaHref', label: 'CTA href', type: 'text', default: FUND_DEFAULTS.ctaHref },
    { name: 'ctaSub', label: 'CTA sub-copy', type: 'textarea', default: FUND_DEFAULTS.ctaSub },
  ],
  values: { ...FUND_DEFAULTS },
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

  // Widen for 3-card grid + give it a soft blue band so it visually
  // belongs to the iter5/iter6/iter8 family rather than the white CTA.
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
    id: 'sec-9-title',
    order: 1,
    level: 2,
    content: 'Let’s Fund Your Next Step',
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
    id: 'sec-9-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, fundBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-9 -> styled 3-card "Let’s Fund Your Next Step" grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
