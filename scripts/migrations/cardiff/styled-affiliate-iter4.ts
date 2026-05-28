/**
 * Iter 4 — Affiliate page (post 796): restyle sec-5, the biggest remaining
 * unstyled section (9 children — h2 + divider + 4 raw "benefit" h4s with no
 * descriptions + a punchline h3 + body line + lone h2 leftover). On the live
 * port, those 4 benefits read as a vertical stack of bare title strings.
 *
 * Iter 1 handled sec-1 (hero). Iter 2 handled sec-3 (audience grid).
 * Iter 3 handled sec-2 (3-step process).
 *
 * sec-5 sells "We Provide All The Direction, Guidance & Support You'll Need
 * To Succeed!" — the supporting-tools promise. Four benefits:
 *   - Done For You Marketing Assets
 *   - Live Monthly Trainings
 *   - Get Paid Fast & On Time
 *   - Community Support
 * …followed by a punchline ("This Is The Easiest Money You've Never Made.")
 * and a body kicker ("And the biz owners you know? They already need this!").
 *
 * Fix: split sec-5 into a clean 3-part structure (same family as iter3) —
 *   1. Centered H2 + orange underline divider (matches iter1/iter2/iter3)
 *   2. 4-up icon-card grid via single html-render w/ data-repeat="benefits"
 *      (4 cards w/ icon chip + title + body copy — copy filled in to give
 *      each bare h4 a real one-liner, since the source page had no body).
 *   3. Gradient closer band w/ the punchline + kicker so they actually
 *      function as the section's "and here's why you care" payoff.
 *
 * Brand palette only: #1c3370, #25418b, #5ac96f, #ef6632, #ffb798.
 * Raleway titles, Open Sans body. Material Icons (no emojis).
 *
 * Idempotent: looks up sec-5 by id, rewrites its blocks + style each run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 796;
const TARGET_SECTION_ID = 'sec-5';

const BENEFITS_HTML = `
<style>
  .cd-aff-sup { max-width: 1140px; margin: 0 auto; }
  .cd-aff-sup__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 40px auto; }
  .cd-aff-sup__intro strong { color: #1c3370; font-weight: 700; }
  .cd-aff-sup__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; }
  .cd-aff-sup__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 30px 24px; box-shadow: 0 10px 28px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-aff-sup__card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(28,51,112,0.14); }
  .cd-aff-sup__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-aff-sup__card:nth-child(2) .cd-aff-sup__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-aff-sup__card:nth-child(3) .cd-aff-sup__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-aff-sup__card:nth-child(4) .cd-aff-sup__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 8px 18px rgba(255,183,152,0.34); }
  .cd-aff-sup__icon .material-icons { font-size: 28px; }
  .cd-aff-sup__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-aff-sup__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.92rem; line-height: 1.65; color: #525f7f; margin: 0; }
  .cd-aff-sup__closer { margin: 44px auto 0 auto; max-width: 880px; text-align: center; padding: 32px 36px; background: linear-gradient(135deg, rgba(28,51,112,0.05) 0%, rgba(239,102,50,0.08) 100%); border-radius: 14px; border: 1px solid #e6ecf5; }
  .cd-aff-sup__closer-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.5rem; font-weight: 800; color: #1c3370; margin: 0 0 8px 0; letter-spacing: -0.01em; line-height: 1.25; }
  .cd-aff-sup__closer-sub { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.65; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 1100px) {
    .cd-aff-sup__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-aff-sup__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-aff-sup__card { padding: 24px 20px; }
    .cd-aff-sup__closer { padding: 24px 22px; }
  }
</style>
<div class="cd-aff-sup">
  <p class="cd-aff-sup__intro" data-field="intro">{{intro}}</p>
  <div class="cd-aff-sup__grid">
    <div class="cd-aff-sup__card" data-repeat="benefits">
      <div class="cd-aff-sup__icon"><span class="material-icons" data-field="icon">{{benefits.icon}}</span></div>
      <div class="cd-aff-sup__title" data-field="title">{{benefits.title}}</div>
      <p class="cd-aff-sup__desc" data-field="description">{{benefits.description}}</p>
    </div>
  </div>
  <div class="cd-aff-sup__closer">
    <div class="cd-aff-sup__closer-title" data-field="closerTitle">{{closerTitle}}</div>
    <p class="cd-aff-sup__closer-sub" data-field="closerSub">{{closerSub}}</p>
  </div>
</div>
`.trim();

const INTRO_DEFAULT =
  'You’re never on your own. We arm every affiliate with the <strong>assets, training, payouts, and community</strong> you need to turn referrals into real, recurring income.';

const BENEFITS_DEFAULTS = [
  {
    title: 'Done For You Marketing Assets',
    description: 'Ad creative, scripts, swipe copy, and a full Cardiff affiliate guide — ready to deploy the day you join.',
    icon: 'campaign',
  },
  {
    title: 'Live Monthly Trainings',
    description: 'Join our top affiliates on live monthly calls for proven strategies, fresh playbooks, and Q&A you can act on.',
    icon: 'school',
  },
  {
    title: 'Get Paid Fast & On Time',
    description: 'Track every qualified lead and funded commission in your Impact.com dashboard — payouts arrive like clockwork.',
    icon: 'payments',
  },
  {
    title: 'Community Support',
    description: 'A private affiliate Telegram group plus direct email support — answers in hours, not weeks.',
    icon: 'forum',
  },
] as const;

const CLOSER_TITLE_DEFAULT = 'This Is The Easiest Money You’ve Never Made.';
const CLOSER_SUB_DEFAULT = 'And the business owners you already know? They need this — right now.';

const benefitsBlock = {
  id: 'sec-5-support',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: BENEFITS_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph (HTML allowed)', type: 'textarea', default: INTRO_DEFAULT },
    {
      name: 'benefits',
      label: 'Support benefits',
      type: 'array',
      itemFields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'icon', type: 'text', label: 'Material icon name' },
      ],
    },
    { name: 'closerTitle', label: 'Closer title', type: 'text', default: CLOSER_TITLE_DEFAULT },
    { name: 'closerSub', label: 'Closer sub', type: 'textarea', default: CLOSER_SUB_DEFAULT },
  ],
  values: {
    intro: INTRO_DEFAULT,
    benefits: BENEFITS_DEFAULTS.map((b) => ({ ...b })),
    closerTitle: CLOSER_TITLE_DEFAULT,
    closerSub: CLOSER_SUB_DEFAULT,
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

  // Widen container so the 4-up benefits grid breathes; keep white background
  // so the gradient closer band reads against it.
  sec.maxWidth = '1240px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#ffffff',
    paddingTop: '88px',
    paddingBottom: '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-5-title',
    order: 1,
    level: 2,
    content: 'We Provide All The Direction, Guidance & Support You’ll Need To Succeed',
    alignment: 'center' as const,
    style: {
      color: '#1c3370',
      fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.18',
      margin: '0 auto 14px auto',
      maxWidth: '960px',
      textAlign: 'center',
    },
  };
  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-5-div',
    order: 2,
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 28px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  sec.blocks = [headerBlock, dividerBlock, benefitsBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: ${TARGET_SECTION_ID} -> header + 4-up benefits grid (data-repeat="benefits") + closer band.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
