/**
 * Iter 8: Restyle "Loans That Fuel Small Business Growth" (sec-4) on
 * post 800 (business-loans). This is the last bare-paragraph stack on
 * the page — currently 3 long body paragraphs in a narrow centered
 * column, visually identical to the sibling intros we already lifted
 * (sec-5, sec-6, sec-9) and disconnected from the brand styling.
 *
 * Cardiff.co frames this band as a "we know the obstacles you hit
 * trying to get capital" promise. We recast it as the page's argument
 * setup: a centered intro paragraph + a 3-card icon grid pulling out
 * the three obstacles the source paragraph names (perfect-credit
 * gatekeeping, paperwork pile, surprise requirements at the finish
 * line) + a closing "we can help" reassurance band.
 *
 * Pattern lifted from styled-equipment-leasing-iter3.ts (icon-card
 * grid on light-blue backdrop) and styled-business-loans-iter6.ts
 * (data-repeat array of cards). Cards use `data-repeat="challenges"`
 * so the obstacle list is editable as an array in the visual editor.
 *
 * Idempotent: rewrites sec-4 sub-blocks every run, keying the
 * html-render by id `sec-4-challenges`; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 800;
const TARGET_BLOCK_ID = 'sec-4';

const CHALLENGES_HTML = `
<style>
  .cd-bl-grow { max-width: 1140px; margin: 0 auto; }
  .cd-bl-grow__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 780px; margin: 0 auto 40px auto; }
  .cd-bl-grow__lead { text-align: center; color: #25418b; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1rem; line-height: 1.65; max-width: 720px; margin: 0 auto 36px auto; font-weight: 600; }
  .cd-bl-grow__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-bl-grow__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 30px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-bl-grow__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bl-grow__icon { width: 54px; height: 54px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-bl-grow__card:nth-child(2) .cd-bl-grow__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bl-grow__card:nth-child(3) .cd-bl-grow__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bl-grow__icon .material-icons { font-size: 28px; }
  .cd-bl-grow__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-bl-grow__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.9375rem; line-height: 1.7; color: #525f7f; margin: 0; }
  .cd-bl-grow__closer { margin: 44px auto 0 auto; max-width: 820px; text-align: center; padding: 26px 32px; background: linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(239,102,50,0.06) 100%); border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-bl-grow__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-bl-grow__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-bl-grow__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bl-grow__card { padding: 24px 22px; }
    .cd-bl-grow__closer { padding: 22px 20px; }
  }
</style>
<div class="cd-bl-grow">
  <p class="cd-bl-grow__intro" data-field="intro">{{intro}}</p>
  <p class="cd-bl-grow__lead" data-field="lead">{{lead}}</p>
  <div class="cd-bl-grow__grid">
    <div class="cd-bl-grow__card" data-repeat="challenges">
      <div class="cd-bl-grow__icon"><span class="material-icons" data-field="icon">{{challenges.icon}}</span></div>
      <h3 class="cd-bl-grow__card-title" data-field="title">{{challenges.title}}</h3>
      <p class="cd-bl-grow__card-desc" data-field="description">{{challenges.description}}</p>
    </div>
  </div>
  <div class="cd-bl-grow__closer">
    <p class="cd-bl-grow__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();

const CHALLENGES_DEFAULTS = {
  intro:
    "Getting a small business loan can feel like trying to summit Mount Everest. If you’re like most small business owners, you need flexible funding that fits the way you operate — without losing a day of your week to paperwork.",
  lead: "Here’s where traditional lenders trip up the small businesses we work with every day:",
  closer:
    "Cardiff offers small business loans for owners who need operating capital now — without the strict requirements, the hoops, or the perfect financial record. You need a lender who understands the realities of running a small business and offers revenue-based solutions to help you grow.",
  challenges: [
    {
      icon: 'credit_score',
      title: 'Perfect-Credit Gatekeeping',
      description:
        'Banks treat your credit score as the whole story. We look at the full picture — cash flow, revenue, and the day-to-day health of your business — so a less-than-perfect history doesn’t close the door.',
    },
    {
      icon: 'description',
      title: 'Mountains of Paperwork',
      description:
        'Traditional lenders want piles of documents before they’ll even open a conversation. Cardiff’s streamlined online application keeps the back-and-forth short so you can stay focused on running your business.',
    },
    {
      icon: 'warning',
      title: 'Surprise Requirements at the Finish Line',
      description:
        'Just when you think you’re close to approval, the next ask appears. We’re transparent about what we need up front, so the decision you get is the decision that stands.',
    },
  ],
};

const challengesBlock = {
  id: 'sec-4-challenges',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: CHALLENGES_HTML,
  fields: [
    { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: CHALLENGES_DEFAULTS.intro },
    { name: 'lead', label: 'Lead-in line above cards', type: 'textarea', default: CHALLENGES_DEFAULTS.lead },
    {
      name: 'challenges',
      label: 'Lender obstacles Cardiff removes',
      type: 'array',
      itemFields: [
        { name: 'icon', type: 'text', label: 'Material icon name' },
        { name: 'title', type: 'text', label: 'Obstacle title' },
        { name: 'description', type: 'textarea', label: 'How Cardiff handles it' },
      ],
      default: CHALLENGES_DEFAULTS.challenges,
    },
    { name: 'closer', label: 'Closing reassurance', type: 'textarea', default: CHALLENGES_DEFAULTS.closer },
  ],
  values: { ...CHALLENGES_DEFAULTS },
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
  // Soft blue-tinted backdrop to set this band apart from neighbors.
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
    id: 'sec-4-title',
    order: 1,
    level: 2,
    content: 'Loans That Fuel Small Business Growth',
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
    id: 'sec-4-div',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  sec.blocks = [headerBlock, dividerBlock, challengesBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-4 -> styled 3-card "Loans That Fuel Growth" challenges grid.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
