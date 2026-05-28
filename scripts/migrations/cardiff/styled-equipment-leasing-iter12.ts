/**
 * Iter 12: Restyle the page-intro band on post 802 (equipment-leasing).
 * This is sec-1 — currently a single bare paragraph sitting on the brand
 * light-blue band, which reads as visually under-treated next to the
 * heavily-styled icon-card sections iters 2-11 produced. It is the single
 * remaining visual gap on the page (iters 1-11 covered hero / sec-2 /
 * sec-4 / sec-5 / sec-6 / sec-7 / sec-8 / sec-9 / sec-10 / sec-11 /
 * sec-12 / final-cta). sec-1 sets up the rest of the page, so we lift
 * it into a proper opener: a centered lede paragraph plus a 3-up trust-
 * bar icon-card grid that previews the page's core value props (fast
 * decisions, flexible terms, accessible credit) and pulls a reader
 * forward into the deeper sections.
 *
 * Pattern: matches iter3 (icon-card grid) and iter11 (data-repeat
 * collection driver). Inside `data-repeat="badges"` we use
 * `{{badges.icon}}` / `{{badges.title}}` / `{{badges.desc}}` per spec.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632), peach (#ffb798). Raleway display, Open Sans body.
 * Material Icons only, no emojis.
 *
 * Layout: 3-col on desktop, 1-col on mobile. Soft band matches the
 * existing sec-1 backdrop so the bridge from hero to body reads as one
 * unified intro region.
 *
 * Idempotent: re-running detects existing html-render at id
 *   `sec-1-intro` and rewrites in place; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 802;
const TARGET_BLOCK_ID = 'sec-1';

const INTRO_HTML = `
<style>
  .cd-eq-intro { max-width: 1140px; margin: 0 auto; }
  .cd-eq-intro__lede { text-align: center; color: #25418b; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.375rem; font-weight: 600; line-height: 1.55; max-width: 820px; margin: 0 auto 14px auto; letter-spacing: -0.005em; }
  .cd-eq-intro__sub { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-eq-intro__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-eq-intro__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-eq-intro__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-eq-intro__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-eq-intro__card:nth-child(3n+2) .cd-eq-intro__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-eq-intro__card:nth-child(3n+3) .cd-eq-intro__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-eq-intro__icon .material-icons { font-size: 30px; }
  .cd-eq-intro__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-eq-intro__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-eq-intro__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-eq-intro__card { padding: 26px 22px; }
    .cd-eq-intro__lede { font-size: 1.1875rem; }
  }
</style>
<div class="cd-eq-intro">
  <p class="cd-eq-intro__lede" data-field="lede">{{lede}}</p>
  <p class="cd-eq-intro__sub" data-field="sub">{{sub}}</p>
  <div class="cd-eq-intro__grid">
    <div class="cd-eq-intro__card" data-repeat="badges">
      <div class="cd-eq-intro__icon"><span class="material-icons" data-field="icon">{{badges.icon}}</span></div>
      <h3 class="cd-eq-intro__title" data-field="title">{{badges.title}}</h3>
      <p class="cd-eq-intro__desc" data-field="desc">{{badges.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const INTRO_DEFAULTS = {
  lede: 'When your small business needs specialized equipment, leasing or financing it through Cardiff keeps cash flowing and your operation running optimally.',
  sub: 'Get the gear you need today with funding built around your business — flexible terms, fast decisions, and a credit threshold that meets real small businesses where they are.',
  badges: [
    {
      icon: 'bolt',
      title: 'Same-Day Decisions',
      desc: 'A streamlined online application means you won’t be left waiting days — most applicants receive a decision the same day they apply.',
    },
    {
      icon: 'tune',
      title: 'Flexible Lease or Loan',
      desc: 'Choose an operating lease, an equipment finance agreement, or a blend of both — whichever shape fits your cash flow and growth plan.',
    },
    {
      icon: 'verified_user',
      title: 'Built for Real Credit Profiles',
      desc: 'You don’t need perfect credit. Cardiff weighs the overall health of your business — revenue, history, and trajectory — not just a score.',
    },
  ],
} as const;

const introBlock = {
  id: 'sec-1-intro',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 1,
  html: INTRO_HTML,
  fields: [
    { name: 'lede', label: 'Lede paragraph', type: 'textarea', default: INTRO_DEFAULTS.lede },
    { name: 'sub', label: 'Supporting paragraph', type: 'textarea', default: INTRO_DEFAULTS.sub },
    {
      name: 'badges',
      label: 'Trust badges',
      type: 'collection',
      default: INTRO_DEFAULTS.badges,
      fields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
      ],
    },
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

  // Widen so the 3-col card grid breathes.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '72px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  sec.blocks = [introBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-1 -> styled lede + 3-up trust-badge grid.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
