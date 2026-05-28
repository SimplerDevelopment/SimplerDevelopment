/**
 * Iter 2 — Affiliate page (post 796): restyle sec-3, the biggest remaining
 * unstyled section.
 *
 * Original ("The Cardiff Affiliate Program Is Perfect For:") was a stacked
 * list of 8 plain h4 headings ("Marketing Agency Owners", "Accountants",
 * "Consultants", "Payroll Service Providers", "Bankers",
 * "Community Builders", "Business Event Hosts", "Financial Advisors") with
 * no visual structure — looks like a draft, not a finished page.
 *
 * Fix: replace sec-3's children with:
 *   1. Centered H2 + orange underline divider (matches iter1 / iter3 pattern)
 *   2. A single html-render block with an 8-card icon grid (4 across at
 *      desktop, 2 across at tablet, 1 across at mobile) — array-driven via
 *      `data-repeat="audiences"` so authors can add/remove personas without
 *      touching code.
 *
 * Brand palette only: #1c3370, #25418b, #5ac96f, #ef6632, #ffb798.
 * Raleway titles, Open Sans body. Material Icons (no emojis).
 *
 * Idempotent: looks up sec-3 by id, rewrites its `blocks` array each run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 796;
const TARGET_SECTION_ID = 'sec-3';

const AUDIENCE_HTML = `
<style>
  .cd-aff-aud { max-width: 1180px; margin: 0 auto; }
  .cd-aff-aud__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; max-width: 720px; margin: 0 auto 44px auto; }
  .cd-aff-aud__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px; }
  .cd-aff-aud__card { position: relative; background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 28px 22px; box-shadow: 0 10px 28px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; display: flex; flex-direction: column; align-items: flex-start; overflow: hidden; }
  .cd-aff-aud__card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #25418b 0%, #5ac96f 100%); opacity: 0; transition: opacity .25s ease; }
  .cd-aff-aud__card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(28,51,112,0.14); border-color: #d3dcee; }
  .cd-aff-aud__card:hover::before { opacity: 1; }
  .cd-aff-aud__card:nth-child(4n+1) .cd-aff-aud__icon { background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); box-shadow: 0 8px 18px rgba(28,51,112,0.24); }
  .cd-aff-aud__card:nth-child(4n+2) .cd-aff-aud__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-aff-aud__card:nth-child(4n+3) .cd-aff-aud__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-aff-aud__card:nth-child(4n+4) .cd-aff-aud__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.36); }
  .cd-aff-aud__icon { width: 52px; height: 52px; border-radius: 13px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; color: #fff; }
  .cd-aff-aud__icon .material-icons { font-size: 28px; }
  .cd-aff-aud__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0 0 8px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-aff-aud__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9rem; line-height: 1.55; color: #525f7f; margin: 0; }
  @media (max-width: 1080px) {
    .cd-aff-aud__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .cd-aff-aud__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-aff-aud__card { padding: 24px 20px; }
  }
</style>
<div class="cd-aff-aud">
  <p class="cd-aff-aud__intro" data-field="intro">{{intro}}</p>
  <div class="cd-aff-aud__grid">
    <div class="cd-aff-aud__card" data-repeat="audiences">
      <div class="cd-aff-aud__icon"><span class="material-icons" data-field="icon">{{audiences.icon}}</span></div>
      <h3 class="cd-aff-aud__title" data-field="title">{{audiences.title}}</h3>
      <p class="cd-aff-aud__desc" data-field="description">{{audiences.description}}</p>
    </div>
  </div>
</div>
`.trim();

const AUDIENCE_DEFAULTS = {
  intro: 'If your network is full of small-business owners, this program is built for you. Refer them to Cardiff and get paid when they qualify — no closing required.',
  audiences: [
    { title: 'Marketing Agency Owners', description: 'Your clients need working capital to fund the campaigns you build for them.', icon: 'campaign' },
    { title: 'Accountants', description: 'Your books-and-tax clients hit cash-flow gaps every quarter — refer them for funding.', icon: 'calculate' },
    { title: 'Consultants', description: 'The growth advice you give often needs capital behind it to execute.', icon: 'psychology' },
    { title: 'Payroll Service Providers', description: 'Your clients run payroll every week — they need fast, flexible cash to bridge gaps.', icon: 'receipt_long' },
    { title: 'Bankers', description: 'Refer the small-business deals that don’t fit your institution’s box.', icon: 'account_balance' },
    { title: 'Community Builders', description: 'You already convene small-business owners — give them a real funding option.', icon: 'groups' },
    { title: 'Business Event Hosts', description: 'Your attendees are looking for partners that can fund their next move.', icon: 'event' },
    { title: 'Financial Advisors', description: 'Help your business-owner clients access growth capital without disturbing their portfolios.', icon: 'trending_up' },
  ],
} as const;

const audienceBlock = {
  id: 'sec-3-audiences',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: AUDIENCE_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: AUDIENCE_DEFAULTS.intro },
    {
      name: 'audiences',
      label: 'Audience cards',
      type: 'array',
      itemFields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'icon', type: 'text', label: 'Material icon name' },
      ],
    },
  ],
  values: {
    intro: AUDIENCE_DEFAULTS.intro,
    audiences: AUDIENCE_DEFAULTS.audiences.map((a) => ({ ...a })),
  },
};

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema/cms');
  const { eq } = await import('drizzle-orm');

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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_SECTION_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_SECTION_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(`Post ${POST_ID}: block ${TARGET_SECTION_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }

  // Widen container so 4-col grid breathes; tint background to set it apart
  // from neighboring white sec-2 / sec-4.
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
    id: 'sec-3-title',
    order: 1,
    level: 2,
    content: 'The Cardiff Affiliate Program Is Perfect For:',
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
  sec.blocks = [headerBlock, dividerBlock, audienceBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: ${TARGET_SECTION_ID} -> styled 8-card audience grid (data-repeat="audiences").`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
