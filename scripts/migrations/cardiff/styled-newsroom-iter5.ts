/**
 * Iteration 5: Newsroom page (post id 826) — add "Browse by Topic" icon-card
 * grid as a new section (id `sec-2b`) between sec-2 (Latest News) and sec-3
 * (Cardiff In The Media).
 *
 * Why: iter1–4 nailed content and rhythm, but the page still drops directly
 * from the 3-card Latest News grid into the press-mentions list. cardiff.co's
 * newsroom navigates by category — the pill tabs above the press mentions
 * (General / Company News / Market & Economy / Press Mentions / Small
 * Business Finance) are the cardiff source-of-truth topics. Surfacing those
 * same topics as a 5-up icon-card grid:
 *   - gives a visual rest between two media-heavy bands (cards above, logo
 *     rows below) — fixes the cavernous "all-list, no-rhythm" feel,
 *   - mirrors the category navigation the original cardiff.co newsroom uses,
 *   - reuses the icon-card pattern proven in
 *     `styled-equipment-leasing-iter3.ts` (5 cards, 3+2 wrap, gradient closer).
 *
 * Idempotent: looks for an existing block with id `sec-2b` and rewrites it
 * in place; otherwise inserts it directly after sec-2 with order=2.5, then
 * re-numbers downstream blocks to keep `order` monotonic.
 *
 * Brand: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798. Raleway + Open Sans.
 * No emojis — Material Icons only.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 826;
const NEW_SECTION_ID = 'sec-2b';
const INSERT_AFTER_ID = 'sec-2';

const TOPICS_HTML = `
<style>
  .cd-nt { max-width: 1180px; margin: 0 auto; padding: 56px 24px 64px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-nt__header { text-align: center; margin: 0 auto 36px auto; max-width: 720px; }
  .cd-nt__eyebrow { font-family: 'Raleway', sans-serif; font-size: 0.82rem; font-weight: 800; letter-spacing: 0.14em; color: #1c89ef; text-transform: uppercase; margin: 0 0 12px 0; }
  .cd-nt__title { font-family: 'Raleway', sans-serif; font-size: 2rem; font-weight: 800; color: #1c3370; line-height: 1.2; letter-spacing: -0.012em; margin: 0 0 14px 0; }
  .cd-nt__rule { width: 56px; height: 3px; background: #ef6632; border-radius: 2px; margin: 0 auto 18px auto; }
  .cd-nt__sub { font-family: 'Open Sans', sans-serif; font-size: 1rem; line-height: 1.65; color: #525f7f; margin: 0; }
  .cd-nt__grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px; }
  .cd-nt__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 12px; padding: 26px 20px; box-shadow: 0 8px 22px rgba(28,51,112,0.06); transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; display: flex; flex-direction: column; text-decoration: none; }
  .cd-nt__card:hover { transform: translateY(-3px); box-shadow: 0 14px 36px rgba(28,51,112,0.12); border-color: #cdd9ec; }
  .cd-nt__icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 0 16px 0; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #fff; box-shadow: 0 6px 14px rgba(28,51,112,0.22); }
  .cd-nt__card:nth-child(2) .cd-nt__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 6px 14px rgba(239,102,50,0.28); }
  .cd-nt__card:nth-child(3) .cd-nt__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 6px 14px rgba(58,168,86,0.28); }
  .cd-nt__card:nth-child(4) .cd-nt__icon { background: linear-gradient(135deg, #ffb798 0%, #ef6632 100%); box-shadow: 0 6px 14px rgba(255,183,152,0.32); }
  .cd-nt__card:nth-child(5) .cd-nt__icon { background: linear-gradient(135deg, #1c89ef 0%, #25418b 100%); box-shadow: 0 6px 14px rgba(28,137,239,0.28); }
  .cd-nt__icon .material-icons { font-size: 26px; }
  .cd-nt__card-title { font-family: 'Raleway', sans-serif; font-size: 1rem; font-weight: 800; color: #1c3370; margin: 0 0 8px 0; letter-spacing: -0.005em; line-height: 1.3; }
  .cd-nt__card-desc { font-family: 'Open Sans', sans-serif; font-size: 0.88rem; line-height: 1.55; color: #525f7f; margin: 0 0 14px 0; flex: 1; }
  .cd-nt__card-more { font-family: 'Raleway', sans-serif; font-size: 0.72rem; font-weight: 700; color: #ef6632; text-transform: uppercase; letter-spacing: 0.12em; margin-top: auto; display: inline-flex; align-items: center; gap: 4px; }
  .cd-nt__card-more::after { content: '\\203A'; font-size: 0.95rem; line-height: 1; }
  @media (max-width: 1100px) {
    .cd-nt__grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 720px) {
    .cd-nt__grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .cd-nt__card { padding: 22px 18px; }
  }
  @media (max-width: 460px) {
    .cd-nt__grid { grid-template-columns: 1fr; }
  }
</style>
<section class="cd-nt">
  <div class="cd-nt__header">
    <p class="cd-nt__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-nt__title" data-field="title">{{title}}</h2>
    <div class="cd-nt__rule"></div>
    <p class="cd-nt__sub" data-field="sub">{{sub}}</p>
  </div>
  <div class="cd-nt__grid">
    <a class="cd-nt__card" href="{{topics.url}}" data-repeat="topics">
      <div class="cd-nt__icon"><span class="material-icons">{{topics.icon}}</span></div>
      <h3 class="cd-nt__card-title">{{topics.title}}</h3>
      <p class="cd-nt__card-desc">{{topics.desc}}</p>
      <span class="cd-nt__card-more">{{topics.cta}}</span>
    </a>
  </div>
</section>
`.trim();

const TOPICS_DEFAULTS = {
  eyebrow: 'BROWSE BY TOPIC',
  title: 'Find the story you came for',
  sub: 'Cardiff covers small-business finance, market shifts, company news, and the press conversations driving lending today. Jump into the topic that matters to you.',
  topics: [
    {
      icon: 'public',
      title: 'General',
      desc: 'A mix of the latest features, interviews, and headlines from across the Cardiff newsroom.',
      cta: 'Browse',
      url: 'https://cardiff.co/newsroom/',
    },
    {
      icon: 'business_center',
      title: 'Company News',
      desc: 'Cardiff announcements — funding milestones, leadership updates, and product launches.',
      cta: 'Browse',
      url: 'https://cardiff.co/newsroom/',
    },
    {
      icon: 'trending_up',
      title: 'Market & Economy',
      desc: 'Analysis on rates, fuel prices, credit cycles, and macro signals affecting Main Street.',
      cta: 'Browse',
      url: 'https://cardiff.co/newsroom/',
    },
    {
      icon: 'campaign',
      title: 'Press Mentions',
      desc: 'Cardiff perspectives quoted in The Business Journals, CNBC, MSN, and other national outlets.',
      cta: 'Browse',
      url: 'https://cardiff.co/newsroom/',
    },
    {
      icon: 'storefront',
      title: 'Small Business Finance',
      desc: 'Practical guidance on capital, cash flow, equipment, and operating decisions for SMBs.',
      cta: 'Browse',
      url: 'https://cardiff.co/newsroom/',
    },
  ],
} as const;

const topicsBlock = {
  id: NEW_SECTION_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3, // placeholder — recomputed in main()
  html: TOPICS_HTML,
  style: {
    backgroundColor: '#f6f9fc',
  },
  fields: [
    { name: 'eyebrow', label: 'Eyebrow', type: 'text', default: TOPICS_DEFAULTS.eyebrow },
    { name: 'title', label: 'Section title', type: 'text', default: TOPICS_DEFAULTS.title },
    { name: 'sub', label: 'Subtitle', type: 'textarea', default: TOPICS_DEFAULTS.sub },
    {
      name: 'topics',
      label: 'Topics',
      type: 'repeater',
      fields: [
        { name: 'icon', label: 'Material icon', type: 'text' },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'desc', label: 'Description', type: 'textarea' },
        { name: 'cta', label: 'CTA text', type: 'text' },
        { name: 'url', label: 'URL', type: 'text' },
      ],
    },
  ],
  values: { ...TOPICS_DEFAULTS, topics: TOPICS_DEFAULTS.topics.map((t) => ({ ...t })) },
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
  const blocks: any[] = parsed.blocks;

  const existingIdx = blocks.findIndex((b) => b?.id === NEW_SECTION_ID);
  const anchorIdx = blocks.findIndex((b) => b?.id === INSERT_AFTER_ID);
  if (anchorIdx === -1) {
    console.error(`Post ${POST_ID}: anchor block ${INSERT_AFTER_ID} not found`);
    process.exit(1);
  }

  if (existingIdx !== -1) {
    // Idempotent rewrite — preserve position & order, replace html/values/fields/style.
    const prevOrder = blocks[existingIdx].order;
    blocks[existingIdx] = { ...topicsBlock, order: prevOrder };
    console.log(`Rewrote existing ${NEW_SECTION_ID} block at index ${existingIdx} (order ${prevOrder}).`);
  } else {
    // Insert immediately after sec-2.
    blocks.splice(anchorIdx + 1, 0, topicsBlock);
    // Re-number `order` from 1..N to stay monotonic.
    blocks.forEach((b, i) => {
      b.order = i + 1;
    });
    console.log(`Inserted ${NEW_SECTION_ID} after ${INSERT_AFTER_ID}; re-numbered ${blocks.length} block orders.`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID} (iter5): Browse-by-Topic icon-card grid in place.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
