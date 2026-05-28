/**
 * Iteration 2: Replace the 2x2 card-grid (sec-2-grid-3) inside the "Getting
 * Ready for a Loan" section on post 803 with a flat, styled bulleted list
 * that matches cardiff.co/learn/getting-ready/ (orange Material `check` icon
 * + Raleway title + Open Sans body, single column).
 *
 * Idempotent: looks for either the original card-grid id or the new html-render
 * id and either replaces in place or refreshes the html-render.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 803;
  const PARENT_SECTION_ID = 'sec-2';
  const TARGET_BLOCK_ID = 'sec-2-grid-3';
  const NEW_BLOCK_ID = 'sec-2-list-3-iter2';

  const LIST_HTML = `
<style>
  .cd-readylist { max-width: 880px; margin: 0 auto; padding: 4px 24px 8px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-readylist__ul { list-style: none; margin: 0; padding: 0; }
  .cd-readylist__li { display: grid; grid-template-columns: 28px 1fr; gap: 12px; align-items: start; padding: 10px 0; border-bottom: 1px solid #eef1f7; }
  .cd-readylist__li:last-child { border-bottom: none; }
  .cd-readylist__icon { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: rgba(239,102,50,0.10); color: #ef6632; font-family: 'Material Icons'; font-size: 18px; line-height: 1; margin-top: 2px; }
  .cd-readylist__body { color: #25418b; }
  .cd-readylist__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 1rem; line-height: 1.45; color: #1c3370; margin: 0; }
  .cd-readylist__desc { display: block; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 400; font-size: 0.9375rem; line-height: 1.55; color: #525f7f; margin-top: 2px; }
  @media (max-width: 640px) {
    .cd-readylist { padding: 4px 16px 8px 16px; }
    .cd-readylist__title { font-size: 0.9375rem; }
    .cd-readylist__desc { font-size: 0.875rem; }
  }
</style>
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
<div class="cd-readylist">
  <ul class="cd-readylist__ul" data-repeat="items">
    <li class="cd-readylist__li">
      <span class="cd-readylist__icon" aria-hidden="true">check</span>
      <div class="cd-readylist__body">
        <p class="cd-readylist__title" data-field="title">{{items.title}}</p>
        <span class="cd-readylist__desc" data-field="description">{{items.description}}</span>
      </div>
    </li>
  </ul>
</div>
`.trim();

  const newBlock = {
    id: NEW_BLOCK_ID,
    type: 'html-render' as const,
    order: 4,
    html: LIST_HTML,
    fields: [
      {
        name: 'items',
        label: 'Bulleted items',
        type: 'repeater',
        fields: [
          { name: 'title', label: 'Title', type: 'text' },
          { name: 'description', label: 'Description', type: 'textarea' },
        ],
      },
    ],
    values: {
      items: [
        {
          title: 'Go over your business credit profile and address any concerns or potential red flags',
          description: '',
        },
        {
          title: 'Get your business identity in order',
          description: 'a tax I.D. number, separate personal and business expenses, get a separate company phone number and website',
        },
        {
          title: 'Start building your business credit by creating trade credit relationships with suppliers who report your history to the credit bureaus',
          description: '',
        },
        {
          title: 'Work to protect or strengthen your personal credit score',
          description: 'depending on the lender, a score below 500 will make it really tough to get a loan',
        },
      ],
    },
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
  const sec = parsed.blocks.find((b: any) => b?.id === PARENT_SECTION_ID);
  if (!sec || !Array.isArray(sec.blocks)) {
    console.error(`Post ${POST_ID}: parent section ${PARENT_SECTION_ID} missing or has no blocks`);
    process.exit(1);
  }
  const idx = sec.blocks.findIndex((b: any) => b?.id === TARGET_BLOCK_ID || b?.id === NEW_BLOCK_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no card-grid (${TARGET_BLOCK_ID}) or html-render (${NEW_BLOCK_ID}) under ${PARENT_SECTION_ID}; aborting`);
    process.exit(1);
  }
  const existing = sec.blocks[idx];
  if (existing.id === NEW_BLOCK_ID) {
    console.log(`Post ${POST_ID}: iter2 list already applied; refreshing in place.`);
  } else if (existing.type !== 'card-grid') {
    console.error(`Post ${POST_ID}: target block was ${existing.type}, expected card-grid; aborting`);
    process.exit(1);
  }
  // preserve original `order` so siblings stay sorted
  newBlock.order = existing.order ?? newBlock.order;
  sec.blocks[idx] = newBlock;

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, POST_ID));
  console.log(`Updated post ${POST_ID}: replaced ${TARGET_BLOCK_ID} with styled bulleted list (${newBlock.values.items.length} items).`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
