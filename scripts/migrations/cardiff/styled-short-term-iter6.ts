/**
 * Iter 6 — Short-Term Working Capital Loans page (post 830).
 *
 * Single remaining gap: three sibling `card-grid` blocks still render with
 * the platform's default styling — bare check_circle bullets stacked in
 * a 3-col grid, no visual rhythm, no brand voice. They sit inside
 *   - sec-1 ("uses of short-term loans")          -> sec-1-grid-9
 *   - sec-3 ("when a short-term loan makes sense") -> sec-3-grid-4
 *   - sec-4 ("who can benefit from Cardiff's term loans") -> sec-4-grid-5
 *
 * Iters 1-5 styled the hero, stat pills (sec-1), features (sec-2),
 * comparison table (sec-5), and reviews band (sec-9). Restyling these
 * three card-grids in one pass brings the whole body of the page up
 * to the same brand polish as the Equipment Leasing port.
 *
 * Replace each card-grid with a single html-render block that uses the
 * iter3 "icon-card" recipe from
 *   scripts/migrations/cardiff/styled-equipment-leasing-iter3.ts
 * adapted to the `data-repeat="cards"` array pattern (mirrors
 * styled-working-capital-iter10's `data-repeat="items"` approach) so
 * content editors can add/remove items in the portal.
 *
 * Each grid gets a section-appropriate icon set and a distinct accent
 * (deep blue / orange / green) so the three bands read as a family
 * without feeling repetitive. Each card has a circular gradient icon
 * chip + Raleway title; the grid sits inside a hover-lift card.
 *
 * Brand: #1c3370 / #25418b headings, #5ac96f / #ef6632 / #ffb798 accents,
 * Raleway titles, Open Sans body. Material Icons (no emojis).
 *
 * Idempotent: detects each target `card-grid` (or a previously-run
 * html-render at the same id) and rewrites it. Safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 830;

type CardItem = { icon: string; title: string };
type GridSpec = {
  sectionId: string;
  blockId: string;
  intro: string;
  closer: string;
  accent: 'blue' | 'orange' | 'green';
  cards: CardItem[];
};

const GRIDS: GridSpec[] = [
  {
    sectionId: 'sec-1',
    blockId: 'sec-1-grid-9',
    intro:
      "Short-term loans are especially useful when your business has a clear, near-term need for capital and a steady revenue stream to support repayment.",
    closer:
      "If you don't want to carry debt for years but still need access to reliable funds, short-term loans give you financial flexibility without a long-term commitment.",
    accent: 'blue',
    cards: [
      { icon: 'sync_alt', title: 'Managing temporary cash flow gaps' },
      { icon: 'priority_high', title: 'Financing urgent operational expenses' },
      { icon: 'ac_unit', title: 'Covering seasonal slowdowns' },
      { icon: 'inventory_2', title: 'Paying for inventory purchases' },
      { icon: 'build', title: 'Handling emergency repairs or short-term investments' },
    ],
  },
  {
    sectionId: 'sec-3',
    blockId: 'sec-3-grid-4',
    intro:
      "Term loans can provide a financial bridge when timing is critical. Here are a few scenarios where they can be especially useful:",
    closer:
      "Short-term business loans are about speed and adaptability — a simple, practical way to handle financial needs while staying focused on growth.",
    accent: 'orange',
    cards: [
      { icon: 'storefront', title: 'A retail store ordering bulk inventory ahead of the holidays' },
      { icon: 'medical_services', title: 'A medical practice expanding to a second location' },
      { icon: 'restaurant', title: 'A restaurant updating kitchen equipment before a local food festival' },
      { icon: 'construction', title: 'A construction firm purchasing materials for a new project' },
      { icon: 'content_cut', title: 'A salon covering payroll during a slow month' },
    ],
  },
  {
    sectionId: 'sec-4',
    blockId: 'sec-4-grid-5',
    intro:
      "Cardiff's term loans are designed for small business owners who need reliable funding without the hassle of traditional bank lending. You may be a great fit if:",
    closer:
      "Cardiff's term loans are built for entrepreneurs who see opportunities but don't want to wait months for bank approval — whether you're expanding, bridging a cash flow gap, or investing in growth.",
    accent: 'green',
    cards: [
      { icon: 'payments', title: 'You need $10,000 to $500,000 in capital' },
      { icon: 'event_available', title: 'Your business has been operational for 12 months' },
      { icon: 'trending_up', title: 'You generate consistent monthly revenue' },
      { icon: 'check_circle', title: 'You want predictable repayment terms with no surprises' },
      { icon: 'rocket_launch', title: "You're seeking fast, short-term funding without extensive red tape" },
    ],
  },
];

function gridHtml(accent: 'blue' | 'orange' | 'green') {
  // Distinct accent per grid so the three bands feel like a family,
  // not three carbon copies of the same component.
  const chip =
    accent === 'blue'
      ? 'background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); box-shadow: 0 8px 18px rgba(28,51,112,0.22);'
      : accent === 'orange'
        ? 'background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28);'
        : 'background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28);';
  const closerTint =
    accent === 'blue'
      ? 'linear-gradient(135deg, rgba(28,51,112,0.04) 0%, rgba(255,183,152,0.10) 100%)'
      : accent === 'orange'
        ? 'linear-gradient(135deg, rgba(239,102,50,0.06) 0%, rgba(28,51,112,0.04) 100%)'
        : 'linear-gradient(135deg, rgba(90,201,111,0.10) 0%, rgba(28,51,112,0.04) 100%)';
  return `
<style>
  .cd-st-cards-${accent} { max-width: 1140px; margin: 0 auto; }
  .cd-st-cards-${accent} .cd-st-cards__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 40px auto; }
  .cd-st-cards-${accent} .cd-st-cards__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
  .cd-st-cards-${accent} .cd-st-cards__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 28px 24px; box-shadow: 0 10px 28px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; gap: 14px; }
  .cd-st-cards-${accent} .cd-st-cards__card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(28,51,112,0.12); }
  .cd-st-cards-${accent} .cd-st-cards__icon { width: 48px; height: 48px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; color: #fff; ${chip} }
  .cd-st-cards-${accent} .cd-st-cards__icon .material-icons { font-size: 26px; }
  .cd-st-cards-${accent} .cd-st-cards__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; font-weight: 800; color: #1c3370; margin: 0; letter-spacing: -0.005em; line-height: 1.35; }
  .cd-st-cards-${accent} .cd-st-cards__closer { margin: 40px auto 0 auto; max-width: 880px; text-align: center; padding: 26px 30px; background: ${closerTint}; border-radius: 12px; border: 1px solid #e6ecf5; }
  .cd-st-cards-${accent} .cd-st-cards__closer-text { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.7; color: #25418b; margin: 0; font-weight: 500; }
  @media (max-width: 980px) {
    .cd-st-cards-${accent} .cd-st-cards__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-st-cards-${accent} .cd-st-cards__grid { grid-template-columns: 1fr; gap: 16px; }
    .cd-st-cards-${accent} .cd-st-cards__card { padding: 24px 20px; }
    .cd-st-cards-${accent} .cd-st-cards__closer { padding: 22px 18px; }
  }
</style>
<div class="cd-st-cards-${accent}">
  <p class="cd-st-cards__intro" data-field="intro">{{intro}}</p>
  <div class="cd-st-cards__grid">
    <div class="cd-st-cards__card" data-repeat="cards">
      <div class="cd-st-cards__icon"><span class="material-icons">{{cards.icon}}</span></div>
      <h3 class="cd-st-cards__title">{{cards.title}}</h3>
    </div>
  </div>
  <div class="cd-st-cards__closer">
    <p class="cd-st-cards__closer-text" data-field="closer">{{closer}}</p>
  </div>
</div>
`.trim();
}

function buildBlock(spec: GridSpec, order: number) {
  return {
    id: spec.blockId,
    type: 'html-render' as const,
    width: 'full' as const,
    order,
    html: gridHtml(spec.accent),
    fields: [
      { name: 'intro', label: 'Intro paragraph', type: 'textarea', default: spec.intro },
      {
        name: 'cards',
        label: 'Cards',
        type: 'array',
        itemFields: [
          { name: 'icon', label: 'Material icon name', type: 'text' },
          { name: 'title', label: 'Card title', type: 'text' },
        ],
      },
      { name: 'closer', label: 'Closing line', type: 'textarea', default: spec.closer },
    ],
    values: {
      intro: spec.intro,
      cards: spec.cards.map((c) => ({ ...c })),
      closer: spec.closer,
    },
  };
}

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

  const pickStr = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.trim().length > 0 ? v : fallback;

  const touched: string[] = [];
  for (const spec of GRIDS) {
    const sec = parsed.blocks.find((b: { id?: string }) => b?.id === spec.sectionId);
    if (!sec || sec.type !== 'section' || !Array.isArray(sec.blocks)) {
      console.error(`Post ${POST_ID}: section ${spec.sectionId} missing or not a section; skipping`);
      continue;
    }
    const childIdx = sec.blocks.findIndex((b: { id?: string }) => b?.id === spec.blockId);
    if (childIdx === -1) {
      console.error(`Post ${POST_ID}: ${spec.blockId} not found in ${spec.sectionId}; skipping`);
      continue;
    }
    const existing = sec.blocks[childIdx];
    const order = typeof existing?.order === 'number' ? existing.order : childIdx;
    const newBlock = buildBlock(spec, order);

    // Preserve author-overridden scalar fields if a previous iter6 run
    // already produced an html-render here. Cards array is intentionally
    // re-seeded (we changed shape from `card-grid.cards[]` to the
    // data-repeat icon/title pair).
    if (existing?.type === 'html-render' && existing.values) {
      newBlock.values.intro = pickStr(existing.values.intro, spec.intro);
      newBlock.values.closer = pickStr(existing.values.closer, spec.closer);
    }

    sec.blocks[childIdx] = newBlock;
    touched.push(`${spec.sectionId}/${spec.blockId}`);
  }

  if (touched.length === 0) {
    console.error(`Post ${POST_ID}: nothing to update`);
    process.exit(1);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: styled icon-card grids -> ${touched.join(', ')}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
