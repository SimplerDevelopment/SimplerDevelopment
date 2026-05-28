/**
 * Iteration 3: Newsroom page (post id 826) — Cardiff In The Media (sec-3).
 *
 * Gap vs cardiff.co/newsroom: the port currently renders sec-3 as a plain
 * stacked list of headlines. The original is a press-mention list with a
 * 2-col split per row — left has the headline + date + Read More link,
 * right has a large outlet logo card (Business Journals, Washington Times,
 * MSN, TJG, CNBC). Above the list sits a pill-style tab filter strip
 * (General / Company News / Market & Economy / Press Mentions / Small
 * Business Finance) with the "General" pill highlighted as active.
 *
 * Fix: replace sec-3 with a single `html-render` "press-mentions" block.
 * Tabs are visual-only (no real filtering) to match the static snapshot the
 * other iterations have established for visual parity. Idempotent —
 * re-running swaps the block in place, preserving `order`.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 826;

const PRESS_MENTIONS_HTML = `
<style>
  .cd-pm { background: #ffffff; padding: 64px 24px 80px 24px; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-pm__inner { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: 220px 1fr; gap: 56px; align-items: start; }
  .cd-pm__heading { font-family: 'Raleway', sans-serif; font-size: 1.55rem; font-weight: 800; color: #1c89ef; line-height: 1.2; margin: 0 0 14px 0; }
  .cd-pm__sub { font-family: 'Open Sans', sans-serif; font-size: 0.92rem; line-height: 1.55; color: #4a5772; margin: 0; }
  .cd-pm__right { display: flex; flex-direction: column; }
  .cd-pm__tabs { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 28px 0; padding: 0; list-style: none; }
  .cd-pm__tab { font-family: 'Open Sans', sans-serif; font-size: 0.88rem; font-weight: 600; color: #4a5772; background: transparent; border: 1px solid transparent; border-radius: 999px; padding: 8px 18px; cursor: pointer; line-height: 1; }
  .cd-pm__tab.is-active { background: #1c89ef; color: #ffffff; }
  .cd-pm__list { display: flex; flex-direction: column; }
  .cd-pm__row { display: grid; grid-template-columns: 1fr 260px; gap: 32px; align-items: center; padding: 28px 0; border-bottom: 1px solid #e6ecf3; }
  .cd-pm__row:first-child { padding-top: 0; }
  .cd-pm__row:last-child { border-bottom: 0; }
  .cd-pm__title { font-family: 'Raleway', sans-serif; font-size: 1.15rem; font-weight: 700; color: #0e1a3a; line-height: 1.35; margin: 0 0 10px 0; }
  .cd-pm__title a { color: inherit; text-decoration: none; }
  .cd-pm__title a:hover { color: #1c89ef; }
  .cd-pm__date { font-family: 'Open Sans', sans-serif; font-size: 0.82rem; color: #6b7894; margin: 0 0 12px 0; }
  .cd-pm__more { font-family: 'Open Sans', sans-serif; font-size: 0.85rem; font-weight: 700; color: #ef6632; text-transform: uppercase; letter-spacing: 0.06em; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
  .cd-pm__more::after { content: '\\203A'; font-size: 1.05rem; line-height: 1; }
  .cd-pm__more:hover { color: #25418b; }
  .cd-pm__logo-card { background: #ffffff; border: 1px solid #e6ecf3; border-radius: 14px; padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 110px; box-shadow: 0 6px 18px rgba(28,51,112,0.05); }
  .cd-pm__logo { max-width: 100%; max-height: 64px; width: auto; height: auto; object-fit: contain; }
  @media (max-width: 960px) {
    .cd-pm__inner { grid-template-columns: 1fr; gap: 24px; }
    .cd-pm__row { grid-template-columns: 1fr; gap: 16px; }
    .cd-pm__logo-card { order: -1; min-height: 90px; }
  }
</style>
<section class="cd-pm">
  <div class="cd-pm__inner">
    <div class="cd-pm__left">
      <h2 class="cd-pm__heading" data-field="heading">{{heading}}</h2>
      <p class="cd-pm__sub" data-field="sub">{{sub}}</p>
    </div>
    <div class="cd-pm__right">
      <ul class="cd-pm__tabs">
        <li data-repeat="tabs">
          <button type="button" class="cd-pm__tab {{tabs.activeClass}}" data-field="label">{{tabs.label}}</button>
        </li>
      </ul>
      <div class="cd-pm__list">
        <div class="cd-pm__row" data-repeat="mentions">
          <div class="cd-pm__copy">
            <h3 class="cd-pm__title" data-field="title">
              <a href="{{mentions.url}}">{{mentions.title}}</a>
            </h3>
            <div class="cd-pm__date" data-field="date">{{mentions.date}}</div>
            <a class="cd-pm__more" href="{{mentions.url}}" data-field="readMoreText">{{mentions.readMoreText}}</a>
          </div>
          <a class="cd-pm__logo-card" href="{{mentions.url}}">
            <img class="cd-pm__logo" src="{{mentions.logoUrl}}" alt="{{mentions.outletName}}" data-field="logoUrl" />
          </a>
        </div>
      </div>
    </div>
  </div>
</section>
`.trim();

const pressMentionsBlock = {
  id: 'sec-3',
  type: 'html-render' as const,
  width: 'full' as const,
  html: PRESS_MENTIONS_HTML,
  fields: [
    { name: 'heading', label: 'Section heading', type: 'text' as const, default: 'Cardiff In The Media' },
    { name: 'sub', label: 'Sub-copy', type: 'text' as const },
    {
      name: 'tabs',
      label: 'Filter tabs',
      type: 'array' as const,
      itemFields: [
        { name: 'label', label: 'Tab label', type: 'text' as const },
        { name: 'activeClass', label: 'Active class (is-active or empty)', type: 'text' as const, default: '' },
      ],
    },
    {
      name: 'mentions',
      label: 'Press mentions',
      type: 'array' as const,
      itemFields: [
        { name: 'title', label: 'Headline', type: 'text' as const },
        { name: 'date', label: 'Date', type: 'text' as const },
        { name: 'readMoreText', label: 'Read more text', type: 'text' as const, default: 'Read More' },
        { name: 'url', label: 'URL', type: 'url' as const, default: '#' },
        { name: 'logoUrl', label: 'Outlet logo URL', type: 'url' as const },
        { name: 'outletName', label: 'Outlet name (alt)', type: 'text' as const },
      ],
    },
  ],
  values: {
    heading: 'Cardiff In The Media',
    sub: 'Explore the full collection of press mentions, expert content, and stories from the Cardiff team.',
    tabs: [
      { label: 'General', activeClass: 'is-active' },
      { label: 'Company News', activeClass: '' },
      { label: 'Market & Economy', activeClass: '' },
      { label: 'Press Mentions', activeClass: '' },
      { label: 'Small Business Finance', activeClass: '' },
    ],
    mentions: [
      {
        title: 'Lenders are changing the game. It’s driving up costs for businesses',
        date: 'May 14, 2026',
        readMoreText: 'Read More',
        url: 'https://cardiff.co/learn/news/lenders-are-changing-the-game-its-driving-up-costs-for-businesses/',
        logoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2026/05/The-Business-Journals-Logo.png',
        outletName: 'The Business Journals',
      },
      {
        title: 'California business exodus expands as KB Home heads for Arizona',
        date: 'May 12, 2026',
        readMoreText: 'Read More',
        url: 'https://cardiff.co/learn/news/california-business-exodus-expands-as-kb-home-heads-for-arizona/',
        logoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2026/05/The-Washington-Times-Logo.png',
        outletName: 'The Washington Times',
      },
      {
        title: 'Trump proposes suspending federal gas tax as fuel prices surge',
        date: 'May 11, 2026',
        readMoreText: 'Read More',
        url: 'https://cardiff.co/learn/news/trump-proposes-suspending-federal-gas-tax-as-fuel-prices-surge/',
        logoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2025/12/MSN-Logo.png',
        outletName: 'MSN',
      },
      {
        title: 'Fort Wayne retail market’s vacancy rate declines, proves an attractive investment',
        date: 'May 7, 2026',
        readMoreText: 'Read More',
        url: 'https://cardiff.co/learn/news/fort-wayne-retail-markets-vacancy-rate-declines-proves-an-attractive-investment/',
        logoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2026/05/TJG-Logo.png',
        outletName: 'TJG',
      },
      {
        title: 'The U.S.-Iran war is coming for your credit score and mortgage application',
        date: 'May 2, 2026',
        readMoreText: 'Read More',
        url: 'https://cardiff.co/learn/news/the-u-s-iran-war-is-coming-for-your-credit-score-and-mortgage-application/',
        logoUrl: 'https://cardiffcompany.wpenginepowered.com/wp-content/uploads/2026/05/CNBC-Logo.png',
        outletName: 'CNBC',
      },
    ],
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

  // Idempotent: locate sec-3 and swap for the html-render version, preserving
  // its `order`. Re-running ends at the same final state regardless of prior
  // sec-3 shape (original `section` or html-render from a previous run).
  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'sec-3');
  if (idx < 0) {
    console.error(`Post ${POST_ID}: no block with id 'sec-3' found; aborting`);
    process.exit(1);
  }
  const order = parsed.blocks[idx]?.order;
  parsed.blocks[idx] = order != null ? { ...pressMentionsBlock, order } : pressMentionsBlock;

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: replaced sec-3 with press-mentions html-render block. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
