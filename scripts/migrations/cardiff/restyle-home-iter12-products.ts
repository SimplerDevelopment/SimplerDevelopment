/**
 * Iter 12 — Replace the home page products card-grid (block 7 "products"
 * → child block 3 "products-grid") with an html-render block.
 *
 * Why: the existing card-grid renders the 6 products as static tiles with no
 * per-card CTA, no hover state, and no visual cue that each card is a link.
 * cardiff.co's equivalent section gives each product a clear "Learn more →"
 * affordance, a lift-on-hover, and a brand-accented icon chip.
 *
 * Strategy: html-render with `data-repeat="cards"` so authors can still
 * add/remove/edit products without touching code. Card content (title, desc,
 * icon, link) is lifted out of the existing card-grid so the data shape is
 * preserved on re-runs.
 *
 * Idempotent: re-checks block ids before swapping; safe to re-run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const HOME_POST_ID = 793;

const PRODUCTS_HTML = `<div class="cd-prod">
  <div class="cd-prod__grid">
    <a class="cd-prod__card" data-repeat="cards" data-field="link" href="{{cards.link}}">
      <div class="cd-prod__icon">
        <span class="material-icons" data-field="icon">{{cards.icon}}</span>
      </div>
      <div class="cd-prod__title" data-field="title">{{cards.title}}</div>
      <div class="cd-prod__desc" data-field="description">{{cards.description}}</div>
      <div class="cd-prod__cta">
        <span data-field="ctaLabel">{{cards.ctaLabel}}</span>
        <span class="material-icons cd-prod__arrow">arrow_forward</span>
      </div>
    </a>
  </div>
  <style>
    .cd-prod { max-width: 1180px; margin: 0 auto; }
    .cd-prod__grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 24px;
    }
    .cd-prod__card {
      position: relative;
      display: flex;
      flex-direction: column;
      background: #ffffff;
      border-radius: 16px;
      padding: 36px 30px 28px 30px;
      border: 1px solid #e8edf6;
      box-shadow: 0 8px 28px rgba(37, 65, 139, 0.06);
      text-decoration: none;
      color: inherit;
      overflow: hidden;
      isolation: isolate;
      transition: transform 0.32s cubic-bezier(0.2, 0.7, 0.2, 1),
                  box-shadow 0.32s cubic-bezier(0.2, 0.7, 0.2, 1),
                  border-color 0.32s ease;
    }
    .cd-prod__card::before {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: 3px;
      background: linear-gradient(90deg, #ef6632 0%, #ffb798 100%);
      transform: scaleX(0.18);
      transform-origin: left center;
      transition: transform 0.45s cubic-bezier(0.2, 0.7, 0.2, 1);
      z-index: 1;
    }
    .cd-prod__card::after {
      content: '';
      position: absolute;
      inset: auto -40px -40px auto;
      width: 160px;
      height: 160px;
      border-radius: 50%;
      background: radial-gradient(circle at center, rgba(90, 201, 111, 0.14), rgba(90, 201, 111, 0) 70%);
      opacity: 0;
      transition: opacity 0.4s ease;
      z-index: 0;
    }
    .cd-prod__card:hover {
      transform: translateY(-6px);
      box-shadow: 0 22px 50px rgba(37, 65, 139, 0.14);
      border-color: #d6deef;
    }
    .cd-prod__card:hover::before { transform: scaleX(1); }
    .cd-prod__card:hover::after { opacity: 1; }
    .cd-prod__icon {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(239, 102, 50, 0.14), rgba(28, 51, 112, 0.06));
      margin: 0 0 22px 0;
      z-index: 2;
      transition: transform 0.4s cubic-bezier(0.2, 0.7, 0.2, 1),
                  background 0.4s ease;
    }
    .cd-prod__card:hover .cd-prod__icon {
      transform: scale(1.05) rotate(-3deg);
      background: linear-gradient(135deg, rgba(239, 102, 50, 0.22), rgba(28, 51, 112, 0.10));
    }
    .cd-prod__icon .material-icons {
      color: #ef6632;
      font-size: 32px;
    }
    .cd-prod__title {
      position: relative;
      font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 800;
      font-size: 1.375rem;
      color: #25418b;
      letter-spacing: -0.012em;
      line-height: 1.25;
      margin: 0 0 12px 0;
      z-index: 2;
    }
    .cd-prod__desc {
      position: relative;
      font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 0.9375rem;
      line-height: 1.6;
      color: #525f7f;
      margin: 0 0 22px 0;
      flex: 1 1 auto;
      z-index: 2;
    }
    .cd-prod__cta {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: auto;
      font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 700;
      font-size: 0.875rem;
      letter-spacing: 0.02em;
      color: #1c3370;
      padding-top: 14px;
      border-top: 1px solid #eef1f8;
      z-index: 2;
      transition: color 0.3s ease;
    }
    .cd-prod__arrow {
      font-size: 18px !important;
      color: #ef6632;
      transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1);
    }
    .cd-prod__card:hover .cd-prod__cta { color: #ef6632; }
    .cd-prod__card:hover .cd-prod__arrow { transform: translateX(6px); }
    .cd-prod__card:focus-visible {
      outline: 3px solid rgba(239, 102, 50, 0.45);
      outline-offset: 2px;
    }
    @media (max-width: 960px) {
      .cd-prod__grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 560px) {
      .cd-prod__grid { grid-template-columns: 1fr; }
      .cd-prod__card { padding: 28px 22px 22px 22px; }
    }
  </style>
</div>`;

const newProductsBlock = {
  id: 'products-grid',
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: PRODUCTS_HTML,
  fields: [
    {
      name: 'cards',
      label: 'Product cards',
      type: 'array',
      itemFields: [
        { name: 'title', type: 'text', label: 'Title' },
        { name: 'description', type: 'textarea', label: 'Description' },
        { name: 'icon', type: 'text', label: 'Material icon name' },
        { name: 'link', type: 'text', label: 'Link URL' },
        { name: 'ctaLabel', type: 'text', label: 'CTA label' },
      ],
    },
  ],
  values: {
    cards: [
      { title: 'Working Capital Loans', description: 'Cash you can deploy today — payroll, inventory, equipment, opportunity capital. Repay on a schedule that matches your revenue.', icon: 'account_balance_wallet', link: '/business-loans/products/working-capital/', ctaLabel: 'Explore working capital' },
      { title: 'Business Line of Credit', description: 'Draw what you need, when you need it. Only pay interest on the balance you actually use.', icon: 'savings', link: '/business-loans/products/line-of-credit/', ctaLabel: 'See line of credit' },
      { title: 'Equipment Financing', description: 'Title or non-title. New, used, or refurbished. Fund the equipment that grows your operation.', icon: 'precision_manufacturing', link: '/business-loans/products/equipment-leasing/', ctaLabel: 'Finance equipment' },
      { title: 'Merchant Cash Advance', description: 'Turn future card sales into working capital today. Payments rise and fall with your revenue.', icon: 'point_of_sale', link: '/business-loans/products/merchant-cash-advance/', ctaLabel: 'Advance against sales' },
      { title: 'SBA Loans', description: 'Long terms, low rates, government-backed. We help you navigate the paperwork and the timeline.', icon: 'verified', link: '/business-loans/products/sba-loans/', ctaLabel: 'Apply for an SBA loan' },
      { title: 'Business Credit Cards', description: 'Day-to-day spend on terms built for businesses — not consumer programs in a different wrapper.', icon: 'credit_card', link: '/business-loans/products/business-cards/', ctaLabel: 'Compare business cards' },
    ],
  },
};

const CTA_FALLBACK_BY_TITLE: Record<string, string> = {
  'Working Capital Loans': 'Explore working capital',
  'Business Line of Credit': 'See line of credit',
  'Equipment Financing': 'Finance equipment',
  'Merchant Cash Advance': 'Advance against sales',
  'SBA Loans': 'Apply for an SBA loan',
  'Business Credit Cards': 'Compare business cards',
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, HOME_POST_ID)).limit(1);
  if (!row) throw new Error(`Post ${HOME_POST_ID} not found`);
  const parsed = JSON.parse(row.content);

  const productsSection = parsed.blocks[7];
  if (productsSection?.id !== 'products') {
    throw new Error(`Expected blocks[7].id === 'products', got ${productsSection?.id}`);
  }
  const oldGrid = productsSection.blocks[2];
  if (oldGrid?.id !== 'products-grid') {
    throw new Error(`Expected products.blocks[2].id === 'products-grid', got ${oldGrid?.id}`);
  }

  // Lift existing cards forward so authoring values survive (idempotent).
  const existing = Array.isArray(oldGrid.cards) ? oldGrid.cards : Array.isArray(oldGrid.values?.cards) ? oldGrid.values.cards : [];
  if (existing.length > 0) {
    newProductsBlock.values.cards = existing.map((c: { title?: string; description?: string; icon?: string; link?: string; ctaLabel?: string }) => ({
      title: c.title || '',
      description: c.description || '',
      icon: c.icon || 'star',
      link: c.link || '#',
      ctaLabel: c.ctaLabel || CTA_FALLBACK_BY_TITLE[c.title || ''] || 'Learn more',
    }));
  }

  productsSection.blocks[2] = newProductsBlock;
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, HOME_POST_ID));
  console.log(`Updated post ${HOME_POST_ID}: products card-grid → html-render with hover lift, animated top border, per-card CTAs`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
