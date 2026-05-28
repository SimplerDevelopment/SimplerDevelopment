/**
 * How to Qualify page (post id 804) — iteration 6.
 *
 * Iters 1-5 styled the hero, comparison grid (sec-2), how-it-works steps
 * (sec-3), right-lender card (sec-4), and the final dark-blue CTA band.
 * The single biggest remaining unstyled section is `sec-1` — currently
 * one throwaway sentence ("Qualifying for a small business loan with
 * Cardiff is easy! Learn how here.") sitting alone inside a full 80px
 * vertical band. It wastes premium above-the-fold real estate between
 * the hero and the comparison grid.
 *
 * Fix: convert sec-1 into a 3-pillar "trust strip" that introduces the
 * page's promise immediately under the hero — same icon-card grid
 * pattern as iter5 (data-repeat over `pillars` so the strip is fully
 * editable in the visual editor) but tightened to a more compact band.
 * Brand palette only — deep blue, orange, green.
 *
 * Idempotent: detects the `sec-1` section block (or the already-migrated
 * `sec-1-pillars-iter6` html-render block id) and rewrites in place.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 804;
  const TARGET_BLOCK_ID = 'sec-1';
  const PILLARS_BLOCK_ID = 'sec-1-pillars-iter6';

  const PILLARS_HTML = `
<style>
  .cd-htq-pillars { max-width: 1140px; margin: 0 auto; }
  .cd-htq-pillars__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 720px; margin: 0 auto 40px auto; }
  .cd-htq-pillars__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-htq-pillars__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 30px 26px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; align-items: flex-start; }
  .cd-htq-pillars__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-htq-pillars__icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-htq-pillars__card:nth-child(2) .cd-htq-pillars__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-htq-pillars__card:nth-child(3) .cd-htq-pillars__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-htq-pillars__icon .material-icons { font-size: 28px; }
  .cd-htq-pillars__stat { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.5rem; font-weight: 800; color: #1c3370; margin: 0 0 4px 0; letter-spacing: -0.01em; line-height: 1.15; }
  .cd-htq-pillars__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 700; color: #25418b; margin: 0 0 10px 0; letter-spacing: -0.003em; line-height: 1.3; }
  .cd-htq-pillars__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.95rem; line-height: 1.65; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-htq-pillars__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-htq-pillars__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-htq-pillars__card { padding: 26px 22px; }
  }
</style>
<div class="cd-htq-pillars">
  <p class="cd-htq-pillars__intro" data-field="intro">{{intro}}</p>
  <div class="cd-htq-pillars__grid">
    <article class="cd-htq-pillars__card" data-repeat="pillars">
      <div class="cd-htq-pillars__icon"><span class="material-icons" data-field="icon">{{pillars.icon}}</span></div>
      <p class="cd-htq-pillars__stat" data-field="stat">{{pillars.stat}}</p>
      <p class="cd-htq-pillars__title" data-field="title">{{pillars.title}}</p>
      <p class="cd-htq-pillars__desc" data-field="desc">{{pillars.desc}}</p>
    </article>
  </div>
</div>
`.trim();

  const PILLARS_DEFAULTS = {
    intro:
      'Qualifying for a small business loan with Cardiff is easy. Here is what most applicants can expect before they even finish their application.',
    pillars: [
      {
        icon: 'lock_open',
        stat: 'No collateral',
        title: 'Unsecured financing',
        desc: 'You keep your equipment, inventory, and receivables. Cardiff offers unsecured options so you do not have to pledge assets to access growth capital.',
      },
      {
        icon: 'bolt',
        stat: 'Same-day decisions',
        title: 'Funding in as little as 24 hours',
        desc: 'Most applicants hear back the same business day, and approved files can be funded in under 24 hours so you can move on opportunities while they are still hot.',
      },
      {
        icon: 'verified_user',
        stat: 'Credit scores from 500',
        title: 'Revenue-based options',
        desc: 'Thin credit file? No problem. Cardiff evaluates revenue and cash flow alongside credit, so steady businesses qualify even when traditional lenders say no.',
      },
    ],
  } as const;

  const headerBlock = {
    type: 'heading' as const,
    id: 'sec-1-title-iter6',
    order: 1,
    level: 2,
    content: 'What to Expect When You Apply',
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
    id: 'sec-1-div-iter6',
    order: 2,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  const pillarsBlock = {
    id: PILLARS_BLOCK_ID,
    type: 'html-render' as const,
    width: 'full' as const,
    order: 3,
    html: PILLARS_HTML,
    fields: [
      { name: 'intro', label: 'Intro paragraph', type: 'textarea' as const, default: PILLARS_DEFAULTS.intro },
      {
        name: 'pillars',
        label: 'Trust pillars',
        type: 'array' as const,
        itemFields: [
          { name: 'icon', label: 'Material icon name', type: 'text' as const },
          { name: 'stat', label: 'Stat / headline number', type: 'text' as const },
          { name: 'title', label: 'Pillar title', type: 'text' as const },
          { name: 'desc', label: 'Pillar description', type: 'textarea' as const },
        ],
      },
    ],
    values: { ...PILLARS_DEFAULTS },
  };

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

  const idx = parsed.blocks.findIndex(
    (b: { id?: string }) => b && b.id === TARGET_BLOCK_ID,
  );
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_BLOCK_ID}; aborting`);
    process.exit(1);
  }
  const existing = parsed.blocks[idx];
  const order = typeof existing?.order === 'number' ? existing.order : idx + 1;

  parsed.blocks[idx] = {
    type: 'section' as const,
    id: 'sec-1',
    order,
    maxWidth: '1200px',
    style: {
      backgroundColor: '#ffffff',
      paddingTop: '72px',
      paddingBottom: '72px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [headerBlock, dividerBlock, pillarsBlock],
  };

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced bare sec-1 paragraph with styled 3-pillar "What to Expect When You Apply" trust strip.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
