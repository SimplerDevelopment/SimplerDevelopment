/**
 * Annual Letter iter 2 — Convert the 3 plain text headings at the top of sec-1
 * ($12 Billion+ Funded / 5 Minute Approvals / Same Day Funds) into a floating
 * 3-up white pill card strip with circular icon badges that overlaps the
 * hero/section seam, matching cardiff.co/2025-annual-letter.
 *
 * Idempotent: if sec-1 already begins with an html-render block whose id is
 * `sec-1-stats` we leave it alone and just rewrite the values/html. Otherwise
 * we insert the new block at index 0 and strip the 3 stat headings that used
 * to live further down the section.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 794;

const STATS_HTML = `<div class="cdal-stats">
  <div class="cdal-stats__row">
    <div class="cdal-stats__card" data-repeat="cards">
      <div class="cdal-stats__icon">
        <span class="material-icons" data-field="icon">{{cards.icon}}</span>
      </div>
      <div class="cdal-stats__body">
        <div class="cdal-stats__title" data-field="title">{{cards.title}}</div>
        <div class="cdal-stats__desc" data-field="description">{{cards.description}}</div>
      </div>
    </div>
  </div>
  <style>
    .cdal-stats { max-width: 1200px; margin: -90px auto 40px auto; padding: 0 24px; position: relative; z-index: 5; }
    .cdal-stats__row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
    .cdal-stats__card { background: #ffffff; border-radius: 999px; padding: 18px 24px; display: flex; align-items: center; gap: 16px; box-shadow: 0 18px 40px rgba(28,51,112,0.18), 0 4px 12px rgba(28,51,112,0.08); border: 1px solid rgba(28,51,112,0.06); }
    .cdal-stats__icon { flex: 0 0 auto; width: 64px; height: 64px; border-radius: 50%; background: #25418b; display: inline-flex; align-items: center; justify-content: center; }
    .cdal-stats__icon .material-icons { color: #ffffff; font-size: 32px; }
    .cdal-stats__body { min-width: 0; }
    .cdal-stats__title { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 1.05rem; color: #25418b; letter-spacing: -0.005em; line-height: 1.2; margin: 0 0 4px 0; }
    .cdal-stats__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.82rem; line-height: 1.45; color: #525f7f; margin: 0; }
    @media (max-width: 960px) {
      .cdal-stats { margin-top: -50px; }
      .cdal-stats__row { grid-template-columns: 1fr; }
      .cdal-stats__card { border-radius: 18px; }
    }
  </style>
</div>`;

const STATS_BLOCK = {
  id: 'sec-1-stats',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 0,
  html: STATS_HTML,
  fields: [
    {
      name: 'cards',
      label: 'Stat cards',
      type: 'array',
      itemFields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'icon', type: 'text', label: 'Material icon name' },
      ],
    },
  ],
  values: {
    cards: [
      { title: '$12 Billion+ Funded', description: 'Over 21 years, we have funded over $12 Billion for small businesses.', icon: 'attach_money' },
      { title: '5 Minute Approvals', description: 'Know how much funding you can get within 5 minutes of applying.', icon: 'schedule' },
      { title: 'Same Day Funds', description: 'With our online process, we can provide funds within 24 hours of approval.', icon: 'account_balance' },
    ],
  },
};

const STAT_HEADING_IDS = new Set(['sec-1-h4-3', 'sec-1-h4-4', 'sec-1-h4-5']);

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const [row] = await db.select().from(posts).where(eq(posts.id, POST_ID)).limit(1);
  if (!row) throw new Error(`Post ${POST_ID} not found`);
  const parsed = JSON.parse(row.content);
  const sec1 = parsed.blocks.find((b: any) => b.id === 'sec-1');
  if (!sec1) throw new Error('sec-1 not found');
  if (!Array.isArray(sec1.blocks)) throw new Error('sec-1.blocks is not an array');

  // Strip stat headings if present (idempotent — fine if already removed).
  sec1.blocks = sec1.blocks.filter((b: any) => !STAT_HEADING_IDS.has(b?.id));

  // Insert / replace the floating stats card strip at index 0.
  const existingIdx = sec1.blocks.findIndex((b: any) => b?.id === 'sec-1-stats');
  if (existingIdx >= 0) {
    sec1.blocks[existingIdx] = STATS_BLOCK;
  } else {
    sec1.blocks.unshift(STATS_BLOCK);
  }

  // Re-number order so the rest of the section keeps a clean sequence.
  sec1.blocks.forEach((b: any, i: number) => { b.order = i + 1; });

  // Remove section vertical padding-top so the floating cards can overlap the
  // hero. Keep horizontal padding intact (the html-render block carries its
  // own max-width + padding).
  sec1.style = sec1.style || {};
  sec1.style.paddingTop = '0px';
  // Let the html-render block break out of the narrow column.
  sec1.maxWidth = '100%';

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: sec-1 now leads with 3-up floating stat cards (idempotent).`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
