/**
 * Iter 8 — post 829 (SBA Loans). After iters 1-7 the last remaining unstyled
 * band is `sec-6` ("Why choose Cardiff"). Today it renders as a default
 * card-grid where each card title is a mashed-together
 * "Title Description-fragment-truncated…" string with no description body and
 * generic repeated check_circle icons. It also sits inside a narrow 880px
 * column with no visual chrome.
 *
 * Mirrors the iter3 equipment-leasing pattern (icon-card grid via a single
 * html-render block with `data-repeat="cards"`). Splits each title back into
 * a clean title + body, gives each card its own distinct Material Icon, and
 * wraps the band in the standard light-blue tint with a 1200px max-width.
 *
 * Preserves sec-6-title + sec-6-div; replaces sec-6-grid-2 with a new
 * html-render block `sec-6-why`. Idempotent: locates section by id and
 * always rewrites sub-blocks to [title, divider, why-html-render].
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 829;
const TARGET_BLOCK_ID = 'sec-6';

const WHY_HTML = `
<style>
  .cd-sba-why { max-width: 1140px; margin: 0 auto; }
  .cd-sba-why__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cd-sba-why__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 32px 28px; box-shadow: 0 12px 32px rgba(28,51,112,0.06); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-sba-why__card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(28,51,112,0.12); }
  .cd-sba-why__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin: 0 0 18px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); }
  .cd-sba-why__card:nth-child(2) .cd-sba-why__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-sba-why__card:nth-child(3) .cd-sba-why__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-sba-why__icon .material-icons { font-size: 30px; }
  .cd-sba-why__card-title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.25rem; font-weight: 800; color: #1c3370; margin: 0 0 12px 0; letter-spacing: -0.005em; line-height: 1.25; }
  .cd-sba-why__card-desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.975rem; line-height: 1.7; color: #525f7f; margin: 0; }
  @media (max-width: 980px) {
    .cd-sba-why__grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 620px) {
    .cd-sba-why__grid { grid-template-columns: 1fr; gap: 18px; }
    .cd-sba-why__card { padding: 26px 22px; }
  }
</style>
<div class="cd-sba-why">
  <div class="cd-sba-why__grid">
    <div class="cd-sba-why__card" data-repeat="cards">
      <div class="cd-sba-why__icon"><span class="material-icons" data-field="icon">{{cards.icon}}</span></div>
      <h3 class="cd-sba-why__card-title" data-field="title">{{cards.title}}</h3>
      <p class="cd-sba-why__card-desc" data-field="desc">{{cards.desc}}</p>
    </div>
  </div>
</div>
`.trim();

const CARDS = [
  {
    icon: 'price_check',
    title: 'Transparent Rates',
    desc: 'Our business loan rates start at 5.99%, ensuring you have a clear, predictable cost of capital with no hidden fees or surprises along the way.',
  },
  {
    icon: 'workspace_premium',
    title: 'Nearly 20 Years of Experience',
    desc: 'We have a proven track record, serving small businesses across the country with the funding solutions and guidance they need to grow.',
  },
  {
    icon: 'handshake',
    title: 'Trusted Partner',
    desc: 'Count on our expertise, reliability, and personalized service to help you choose the right product and move quickly when opportunity strikes.',
  },
];

const whyBlock = {
  id: 'sec-6-why',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: WHY_HTML,
  fields: [
    {
      name: 'cards',
      label: 'Why-Cardiff cards',
      type: 'array' as const,
      itemFields: [
        { name: 'icon', label: 'Material Icons name', type: 'text' },
        { name: 'title', label: 'Card title', type: 'text' },
        { name: 'desc', label: 'Card description', type: 'textarea' },
      ],
    },
  ],
  values: { cards: CARDS },
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
  if (!Array.isArray(sec.blocks)) {
    console.error(`Post ${POST_ID}: ${TARGET_BLOCK_ID}.blocks is missing; aborting`);
    process.exit(1);
  }

  // Widen so the 3-up card grid breathes; apply the soft tint band.
  sec.maxWidth = '1200px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f6f9fc',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  // Preserve title + divider; replace the rest (drop sec-6-grid-2).
  const preserveIds = new Set(['sec-6-title', 'sec-6-div']);
  const preserved = sec.blocks
    .filter((b: any) => preserveIds.has(b?.id))
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  if (preserved.length !== 2) {
    console.error(`Post ${POST_ID}: expected 2 preserved sub-blocks (title/divider), found ${preserved.length}; aborting`);
    process.exit(1);
  }
  preserved[0].order = 1;
  preserved[1].order = 2;
  // Push divider closer to the card grid.
  if (preserved[1].style) {
    preserved[1].style.margin = '0 auto 36px auto';
  }

  sec.blocks = [...preserved, whyBlock];

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-6 -> styled 3-card "Why choose Cardiff" grid (data-repeat=cards).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
