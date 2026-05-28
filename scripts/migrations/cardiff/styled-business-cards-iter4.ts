/**
 * Iter 4: Restyle the long "Cardiff Business Credit Cards for Fast, Flexible
 * Access to Cash" section on post 797 (business-cards). This is sec-4 — a
 * 10-block wall of intro paragraphs + 3 alternating H3/paragraph feature
 * pairs ("Flexible Cash Advances", "Small Business Lending", "Made for
 * Small Businesses") with no visual structure.
 *
 * We replace sec-4's children with:
 *   1. Centered H2 + orange underline (same pattern as iter3)
 *   2. Intro paragraph (the original lead-in copy)
 *   3. A "What Makes Cardiff Business Credit Cards Different?" sub-heading
 *   4. A single html-render block carrying a 3-up icon card grid using
 *      data-repeat="features" so the editor can add/remove features.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632) accents — no emojis (Material Icons via CDN class).
 *
 * Idempotent: re-running detects existing html-render block at id
 *   `sec-4-features` and rewrites it; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 797;
const TARGET_BLOCK_ID = 'sec-4';

const FEATURES_HTML = `
<style>
  .cd-bc-feat { max-width: 1140px; margin: 0 auto; }
  .cd-bc-feat__sub { text-align: center; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.5rem; font-weight: 800; color: #1c3370; letter-spacing: -0.01em; margin: 0 auto 14px auto; max-width: 820px; line-height: 1.25; }
  .cd-bc-feat__sub-rule { width: 44px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 36px auto; }
  .cd-bc-feat__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-bc-feat__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-bc-feat__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-bc-feat__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-bc-feat__card:nth-child(2) .cd-bc-feat__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-bc-feat__card:nth-child(3) .cd-bc-feat__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-bc-feat__icon .material-icons { font-size: 30px; }
  .cd-bc-feat__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.1875rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-bc-feat__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-bc-feat__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-bc-feat__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-bc-feat__card { padding: 26px 22px; }
  }
</style>
<div class="cd-bc-feat">
  <h3 class="cd-bc-feat__sub" data-field="sub">{{sub}}</h3>
  <div class="cd-bc-feat__sub-rule"></div>
  <div class="cd-bc-feat__grid">
    <article class="cd-bc-feat__card" data-repeat="features">
      <div class="cd-bc-feat__icon"><span class="material-icons" data-field="icon">{{features.icon}}</span></div>
      <h4 class="cd-bc-feat__card-title" data-field="title">{{features.title}}</h4>
      <p class="cd-bc-feat__card-desc" data-field="desc">{{features.desc}}</p>
    </article>
  </div>
</div>
`.trim();

const FEATURES_DEFAULTS = {
  sub: 'What Makes Cardiff Business Credit Cards Different?',
  features: [
    {
      icon: 'bolt',
      title: 'Flexible Cash Advances When You Need Them',
      desc: 'When you get a Cardiff card, you’re unlocking the ability to take fast cash advances. Draw funds up to your available limit to pay employees or vendors, order supplies, or seize time-sensitive opportunities.',
    },
    {
      icon: 'storefront',
      title: 'Small Business Lending',
      desc: 'We base approval on your business revenue, not just your credit score. You can qualify for a Cardiff card even if traditional banks have turned you down — a modern approach that keeps pace with how you actually operate.',
    },
    {
      icon: 'tune',
      title: 'Made for Small Businesses',
      desc: 'Instead of generic, one-size-fits-all products, Cardiff focuses on flexibility, fast access to credit, and terms that actually work for entrepreneurs — practical tools to support day-to-day operations.',
    },
  ],
} as const;

const featuresBlock = {
  id: 'sec-4-features',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: FEATURES_HTML,
  fields: [
    { name: 'sub', label: 'Sub-heading', type: 'text', default: FEATURES_DEFAULTS.sub },
    {
      name: 'features',
      label: 'Features',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material icon', type: 'text' as const, default: 'bolt' },
        { name: 'title', label: 'Title', type: 'text' as const },
        { name: 'desc', label: 'Description', type: 'textarea' as const },
      ],
    },
  ],
  values: {
    sub: FEATURES_DEFAULTS.sub,
    features: FEATURES_DEFAULTS.features.map((f) => ({ ...f })),
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
    console.error(`Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not a section (was ${sec.type}); aborting`);
    process.exit(1);
  }

  // Widen so the 3-col card grid breathes; soft blue-tinted background
  // to set this band apart from neighbors.
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
    id: 'sec-4-title',
    order: 1,
    level: 2,
    content: 'Cardiff Business Credit Cards for Fast, Flexible Access to Cash',
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
    content: '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 28px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };
  const introBlock = {
    type: 'text' as const,
    id: 'sec-4-intro',
    order: 3,
    content:
      'Cardiff business credit cards offer a smart alternative to traditional loans when your business needs quick access to capital. Whether you’re managing seasonal expenses, routine purchases, covering unexpected repairs, or fueling your next phase of growth, a Cardiff card gives you the financial agility to respond as needs arise — with a fast application process and competitive terms that keep your business moving.',
    style: {
      color: '#525f7f',
      fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '1.0625rem',
      lineHeight: '1.75',
      maxWidth: '820px',
      margin: '0 auto 48px auto',
      textAlign: 'center' as const,
    },
  };

  sec.blocks = [headerBlock, dividerBlock, introBlock, featuresBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-4 -> styled intro + 3-feature icon-card grid (data-repeat="features").`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
