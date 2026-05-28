/**
 * Iter 8: Restyle the bare intro band on post 797 (business-cards). Sec-1
 * currently holds a single orphan sentence — "Cardiff offers great rates,
 * a large credit window, and a generous spending limit." — sitting naked
 * between the hero and the dark sec-2 benefits band. Reads as a stranded
 * caption rather than an intro.
 *
 * The source sentence is actually a 3-promise summary (rates / credit
 * window / spending limit). We promote it to a styled "At a Glance"
 * intro band: small eyebrow + lead sentence + a 3-up icon-card row that
 * unpacks each promise. Same icon-card grammar as iter3 (sec-3 features)
 * and iter7, so the page reads as one family.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632), peach (#ffb798) — Raleway titles, Open Sans body,
 * Material Icons (no emojis).
 *
 * Idempotent: re-running rewrites sec-1 children, keying off id
 *   `sec-1-pillars`; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 797;
const TARGET_BLOCK_ID = 'sec-1';

const PILLARS_HTML = `
<style>
  .cd-bc-intro { max-width: 1140px; margin: 0 auto; }
  .cd-bc-intro__eyebrow { text-align: center; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #ef6632; margin: 0 0 10px 0; }
  .cd-bc-intro__lead { text-align: center; color: #1c3370; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.5rem; font-weight: 700; line-height: 1.45; letter-spacing: -0.005em; max-width: 820px; margin: 0 auto 44px auto; }
  .cd-bc-intro__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
  .cd-bc-intro__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 28px 24px; box-shadow: 0 12px 30px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; overflow: hidden; }
  .cd-bc-intro__card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #1c3370 0%, #25418b 100%); opacity: .85; }
  .cd-bc-intro__card:hover { transform: translateY(-4px); box-shadow: 0 20px 46px rgba(28,51,112,0.13); }
  .cd-bc-intro__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 6px 0 16px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.24); }
  .cd-bc-intro__icon .material-icons { font-size: 28px; }
  .cd-bc-intro__card:nth-child(2) .cd-bc-intro__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.30); }
  .cd-bc-intro__card:nth-child(2)::before { background: linear-gradient(90deg, #ef6632 0%, #ffb798 100%); }
  .cd-bc-intro__card:nth-child(3) .cd-bc-intro__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.30); }
  .cd-bc-intro__card:nth-child(3)::before { background: linear-gradient(90deg, #5ac96f 0%, #3aa856 100%); }
  .cd-bc-intro__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0 0 8px 0; letter-spacing: -0.005em; line-height: 1.3; text-transform: uppercase; }
  .cd-bc-intro__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-bc-intro__grid { grid-template-columns: repeat(2, 1fr); }
    .cd-bc-intro__lead { font-size: 1.3rem; }
  }
  @media (max-width: 620px) {
    .cd-bc-intro__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-bc-intro__card { padding: 24px 22px; }
    .cd-bc-intro__lead { font-size: 1.2rem; }
  }
</style>
<div class="cd-bc-intro">
  <p class="cd-bc-intro__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
  <p class="cd-bc-intro__lead" data-field="lead">{{lead}}</p>
  <div class="cd-bc-intro__grid">
    <article class="cd-bc-intro__card" data-repeat="pillars">
      <div class="cd-bc-intro__icon"><span class="material-icons" data-field="icon">{{pillars.icon}}</span></div>
      <h3 class="cd-bc-intro__title" data-field="title">{{pillars.title}}</h3>
      <p class="cd-bc-intro__desc" data-field="desc">{{pillars.desc}}</p>
    </article>
  </div>
</div>
`.trim();

const PILLARS_DEFAULTS = {
  eyebrow: 'At a Glance',
  lead: 'Great rates, a large credit window, and a generous spending limit — built for businesses that move quickly.',
  pillars: [
    {
      icon: 'trending_down',
      title: 'Great Rates',
      desc: 'Competitive pricing that keeps the cost of capital low, so more of every dollar stays in your business.',
    },
    {
      icon: 'credit_score',
      title: 'Large Credit Window',
      desc: 'A wide approval window that meets real businesses where they are — including non-traditional credit profiles.',
    },
    {
      icon: 'attach_money',
      title: 'Generous Spending Limit',
      desc: 'Room to cover payroll, inventory, and growth moves without bumping the ceiling at the wrong moment.',
    },
  ],
} as const;

const pillarsBlock = {
  id: 'sec-1-pillars',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: PILLARS_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text' as const, default: PILLARS_DEFAULTS.eyebrow },
    { name: 'lead', label: 'Lead sentence', type: 'textarea' as const, default: PILLARS_DEFAULTS.lead },
    {
      name: 'pillars',
      label: 'Intro pillars',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'star' },
        { name: 'title', label: 'Pillar title', type: 'text' as const },
        { name: 'desc', label: 'Pillar description', type: 'textarea' as const },
      ],
    },
  ],
  values: {
    eyebrow: PILLARS_DEFAULTS.eyebrow,
    lead: PILLARS_DEFAULTS.lead,
    pillars: PILLARS_DEFAULTS.pillars.map((p) => ({ ...p })),
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

  // Widen to give the 3-up pillar grid room; soft blue tint mirrors the
  // benefits band that follows but stays lighter so it reads as an intro.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '72px',
    paddingBottom: '72px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  sec.blocks = [pillarsBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-1 -> styled 3-pillar intro band (data-repeat="pillars").`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
