/**
 * Iter 12 — post 829 (SBA Loans). Iters 1-11 styled every band on the
 * page; the single remaining visual gap is sec-1 — currently a 3-up
 * stat-pill row whose title ("Quick Approvals, No Hard Credit Checks,
 * Zero Obligations") makes three concrete claims that go un-visualized.
 * The claims are the page's strongest top-of-funnel trust message but
 * the band reads as bare numbers without anything that anchors the
 * three differentiators in the reader's eye.
 *
 * Mirroring the move made in `styled-equipment-leasing-iter12.ts`
 * (which added a trust-bar icon-card row to its sec-1 lede), this iter
 * extends sec-1 with an iter3-style 3-up icon-card grid sitting BELOW
 * the existing stat pills. Each card pairs one of the three title
 * claims with a Material Icon chip + supporting one-liner.
 *
 * Pattern: matches `styled-equipment-leasing-iter3.ts` (icon-card grid
 * with alternating blue/orange chip gradients on nth-child positions)
 * and uses `data-repeat="cards"` with `{{cards.icon}}` / `{{cards.title}}`
 * / `{{cards.desc}}` per the field-templating contract — so editors
 * add/remove differentiators from one array control.
 *
 * Brand palette only — deep blue (#1c3370 / #25418b), green (#5ac96f),
 * orange (#ef6632), peach (#ffb798). Raleway display, Open Sans body.
 * Material Icons only, no emojis. Stat pills are preserved verbatim.
 *
 * Idempotent: rewrites sec-1's html/fields/values in place; safe to
 * re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 829;
const TARGET_BLOCK_ID = 'sec-1';

const STATS_HTML = `
<style>
  .cd-sba-stats { background: #f6f9fc; padding: 72px 24px 80px 24px; }
  .cd-sba-stats__inner { max-width: 1140px; margin: 0 auto; }
  .cd-sba-stats__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.85rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.015em; color: #25418b; text-align: center; margin: 0 0 16px 0; text-transform: none; }
  .cd-sba-stats__rule { width: 48px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 44px auto; }
  .cd-sba-stats__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; margin-bottom: 56px; }
  .cd-sba-stats__card { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 999px; padding: 26px 28px; text-align: center; box-shadow: 0 6px 18px rgba(28, 51, 112, 0.06); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 130px; transition: transform 0.18s ease, box-shadow 0.18s ease; }
  .cd-sba-stats__card:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(28, 51, 112, 0.12); }
  .cd-sba-stats__value { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 3rem; font-weight: 800; line-height: 1; color: #1c3370; margin: 0 0 10px 0; letter-spacing: -0.02em; }
  .cd-sba-stats__label { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.72rem; font-weight: 700; line-height: 1.35; color: #ef6632; margin: 0; text-transform: uppercase; letter-spacing: 0.14em; }
  .cd-sba-stats__trust-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-sba-stats__trust { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-sba-stats__trust:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-sba-stats__chip { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-sba-stats__trust:nth-child(2) .cd-sba-stats__chip { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-sba-stats__trust:nth-child(3) .cd-sba-stats__chip { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-sba-stats__chip .material-icons { font-size: 30px; }
  .cd-sba-stats__trust-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-sba-stats__trust-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-sba-stats__trust-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 900px) {
    .cd-sba-stats__grid { grid-template-columns: 1fr; gap: 14px; margin-bottom: 44px; }
    .cd-sba-stats__card { border-radius: 18px; min-height: 110px; padding: 22px 24px; }
    .cd-sba-stats__title { font-size: 1.5rem; }
  }
  @media (max-width: 620px) {
    .cd-sba-stats__trust-grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-sba-stats__trust { padding: 26px 22px; }
  }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
<section class="cd-sba-stats">
  <div class="cd-sba-stats__inner">
    <h2 class="cd-sba-stats__title" data-field="title">{{title}}</h2>
    <div class="cd-sba-stats__rule"></div>
    <div class="cd-sba-stats__grid">
      <div class="cd-sba-stats__card" data-repeat="stats">
        <div class="cd-sba-stats__value" data-field="value">{{stats.value}}</div>
        <div class="cd-sba-stats__label" data-field="label">{{stats.label}}</div>
      </div>
    </div>
    <div class="cd-sba-stats__trust-grid">
      <div class="cd-sba-stats__trust" data-repeat="cards">
        <div class="cd-sba-stats__chip"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
        <h3 class="cd-sba-stats__trust-title" data-field="title">{{cards.title}}</h3>
        <p class="cd-sba-stats__trust-desc" data-field="desc">{{cards.desc}}</p>
      </div>
    </div>
  </div>
</section>
`.trim();

const STATS_CARDS = [
  {
    icon: 'rocket_launch',
    title: 'Quick Approvals',
    desc: 'Apply in five minutes and most applicants get a same-day decision — no waiting weeks for an answer that lets you plan ahead.',
  },
  {
    icon: 'shield',
    title: 'No Hard Credit Checks',
    desc: 'Checking your options uses a soft inquiry only, so exploring SBA financing with Cardiff never dings your personal credit score.',
  },
  {
    icon: 'verified',
    title: 'Zero Obligations',
    desc: 'See real offers before you commit. Review terms, ask questions, and walk away — there is no fee and no pressure to sign.',
  },
];

const STATS_DEFAULTS = {
  title: 'Quick Approvals, No Hard Credit Checks, Zero Obligations.',
  stats: [
    { value: '$500K', label: 'Business Financing up to' },
    { value: '$8 Billion+', label: 'Amount Funded to Small Businesses' },
    { value: '5 minutes', label: 'Application Process only takes' },
  ],
  cards: STATS_CARDS,
} as const;

const STATS_FIELDS = [
  { name: 'title', label: 'Section title', type: 'text' as const },
  {
    name: 'stats',
    label: 'Stat pills',
    type: 'array' as const,
    itemFields: [
      { name: 'value', label: 'Value', type: 'text' as const },
      { name: 'label', label: 'Label', type: 'text' as const },
    ],
  },
  {
    name: 'cards',
    label: 'Trust-bar cards',
    type: 'array' as const,
    itemFields: [
      { name: 'icon', label: 'Material Icons name', type: 'text' as const },
      { name: 'title', label: 'Card title', type: 'text' as const },
      { name: 'desc', label: 'Card description', type: 'textarea' as const },
    ],
  },
];

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
  if (sec.type !== 'html-render') {
    console.error(
      `Post ${POST_ID}: block ${TARGET_BLOCK_ID} is not html-render (was ${sec.type}); aborting`,
    );
    process.exit(1);
  }

  // Preserve any existing user-edited stat values; only fall back to defaults
  // if the editor never set them. Always overwrite html/fields and seed cards
  // with defaults so re-runs converge.
  const existingStats =
    Array.isArray(sec.values?.stats) && sec.values.stats.length > 0
      ? sec.values.stats
      : STATS_DEFAULTS.stats;
  const existingTitle =
    typeof sec.values?.title === 'string' && sec.values.title.trim()
      ? sec.values.title
      : STATS_DEFAULTS.title;

  sec.html = STATS_HTML;
  sec.fields = STATS_FIELDS;
  sec.values = {
    title: existingTitle,
    stats: existingStats,
    cards: STATS_CARDS,
  };

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: sec-1 -> stat pills + iter3-style 3-up trust-bar icon-card grid.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
