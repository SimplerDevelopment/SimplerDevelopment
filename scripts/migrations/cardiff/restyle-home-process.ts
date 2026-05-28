/**
 * Iter 3 — Replace the home page process card-grid (block 4 → child 3) with
 * an html-render block that lays the 5 steps out horizontally with numbered
 * "01/02/03" badges matching cardiff.co's process visual.
 *
 * Root cause: CardGridBlockRender only handles columns: 2|3|4. The current
 * block had columns:5 which silently fell back to grid-cols-1, rendering as
 * a vertical stack of full-width cards that dominated the page.
 *
 * The html-render block keeps each step (icon + title + description) content-
 * managed via an array field so authors can still add/remove/edit steps
 * without touching code.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const HOME_POST_ID = 793;

const PROCESS_HTML = `<div class="cd-process">
  <div class="cd-process__row">
    <div class="cd-process__col" data-repeat="steps">
      <div class="cd-process__num"></div>
      <div class="cd-process__icon"><span class="material-icons" data-field="icon">{{steps.icon}}</span></div>
      <div class="cd-process__title" data-field="title">{{steps.title}}</div>
      <div class="cd-process__desc" data-field="description">{{steps.description}}</div>
    </div>
  </div>
  <style>
    .cd-process { max-width: 1200px; margin: 32px auto 0 auto; counter-reset: cd-step; }
    .cd-process__row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 24px; position: relative; }
    .cd-process__row::before { content: ''; position: absolute; top: 84px; left: 10%; right: 10%; height: 2px; background: linear-gradient(to right, transparent, #e8edf6 12%, #e8edf6 88%, transparent); z-index: 0; }
    .cd-process__col { background: #fff; border-radius: 14px; padding: 24px 18px; text-align: center; position: relative; z-index: 1; border: 1px solid #eef1f8; box-shadow: 0 4px 14px rgba(37,65,139,0.04); counter-increment: cd-step; }
    .cd-process__num { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.72rem; color: #ef6632; letter-spacing: 0.22em; margin: 0 0 12px 0; }
    .cd-process__num::before { content: counter(cd-step, decimal-leading-zero); }
    .cd-process__icon { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 14px; background: rgba(239,102,50,0.10); margin: 0 0 14px 0; }
    .cd-process__icon .material-icons { color: #ef6632; font-size: 28px; }
    .cd-process__title { font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 800; font-size: 0.95rem; color: #25418b; letter-spacing: -0.005em; line-height: 1.25; margin: 0 0 8px 0; }
    .cd-process__desc { font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 0.78rem; line-height: 1.5; color: #525f7f; margin: 0; }
    @media (max-width: 1100px) {
      .cd-process__row { grid-template-columns: repeat(2, 1fr); }
      .cd-process__row::before { display: none; }
    }
    @media (max-width: 640px) {
      .cd-process__row { grid-template-columns: 1fr; }
    }
  </style>
</div>`;

const newProcessBlock = {
  id: 'process-cards',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 4,
  html: PROCESS_HTML,
  fields: [
    {
      name: 'steps',
      label: 'Process steps',
      type: 'array',
      itemFields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'icon', type: 'text', label: 'Material icon name' },
      ],
    },
  ],
  values: {
    steps: [
      { title: 'Apply Online', description: 'Tell us a little about your business and get approved in less than 2 minutes.', icon: 'edit_note' },
      { title: 'Get Approved', description: 'Receive the terms that work best for your budget and get on with your day.', icon: 'task_alt' },
      { title: 'Withdraw Funds', description: 'Link your business checking account to your Cardiff financing and access your funds immediately.', icon: 'account_balance' },
      { title: 'Repayment', description: 'Payments are remitted automatically through ACH withdrawal either daily, weekly, or monthly.', icon: 'autorenew' },
      { title: 'Renew Your Funding', description: 'Pay off your balance early and gain access to more capital at better terms.', icon: 'rocket_launch' },
    ],
  },
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, HOME_POST_ID)).limit(1);
  if (!row) throw new Error(`Post ${HOME_POST_ID} not found`);
  const parsed = JSON.parse(row.content);
  const procSection = parsed.blocks[4];
  if (procSection?.id !== 'process') throw new Error(`Expected block[4].id === 'process', got ${procSection?.id}`);
  const oldGrid = procSection.blocks[3];
  if (oldGrid?.id !== 'process-cards') throw new Error(`Expected procSection.blocks[3].id === 'process-cards', got ${oldGrid?.id}`);

  // Lift existing card content into the array values so authoring stays the
  // same shape across the migration.
  const existingCards = Array.isArray(oldGrid.cards) ? oldGrid.cards : [];
  if (existingCards.length === 5) {
    newProcessBlock.values.steps = existingCards.slice(0, 5).map((card: { title?: string; description?: string; icon?: string }) => ({
      title: card.title || '',
      description: card.description || '',
      icon: card.icon || 'star',
    }));
  }

  procSection.blocks[3] = newProcessBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, HOME_POST_ID));
  console.log(`Updated post ${HOME_POST_ID}: process card-grid → html-render horizontal 5-col with numbered badges`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
