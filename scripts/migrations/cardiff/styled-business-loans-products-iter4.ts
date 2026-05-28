/**
 * Iter 4: Business Loan Products page (post id 799).
 *
 * Iters 1-3 staged + polished a minimal cardiff.co-faithful layout: a deep-blue
 * H1 hero + a 2-band alternating product strip. The page now reads more like
 * a directory slug than a destination — there is no supporting content to
 * help a visitor self-select a product.
 *
 * Fix: append a "Which loan product is right for you?" FAQ accordion section
 * (id `faq-products`) below the product strip. Built as a single html-render
 * block using <details>/<summary> + `data-repeat="faqs"` so editors can
 * manage Q&As inline via {{faqs.q}} / {{faqs.a}}. Brand palette only —
 * #1c3370 / #25418b / #5ac96f / #ef6632, Raleway + Open Sans.
 *
 * Questions are derived from the seven products already rendered on the page
 * (term loan, working capital, MCA, line of credit, equipment, invoice,
 * revenue-based) — each FAQ answers "when should I pick this?" so the
 * accordion functions as a lightweight self-qualification quiz.
 *
 * Idempotent: matches by id `faq-products`. Re-running rewrites the block
 * in place (preserving any author-edited values) or appends if missing.
 * Re-numbers `order` so the renderer stays sequential. Block count goes
 * from 2 -> 3 on first run, stays at 3 on subsequent runs.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 799;
const FAQ_ID = 'faq-products';

const FAQ_HTML = `
<style>
  .cd-blp-faq {
    background: #f6f9fc;
    padding: 88px 24px 96px 24px;
    position: relative;
  }
  .cd-blp-faq__inner {
    max-width: 860px;
    margin: 0 auto;
  }
  .cd-blp-faq__eyebrow {
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.8125rem;
    font-weight: 700;
    color: #ef6632;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    text-align: center;
    margin: 0 0 14px 0;
  }
  .cd-blp-faq__h2 {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 2.25rem;
    font-weight: 800;
    color: #1c3370;
    letter-spacing: -0.015em;
    line-height: 1.18;
    margin: 0 auto 14px auto;
    max-width: 760px;
    text-align: center;
  }
  .cd-blp-faq__rule {
    width: 56px;
    height: 3px;
    background: #5ac96f;
    border-radius: 2px;
    margin: 0 auto 18px auto;
  }
  .cd-blp-faq__sub {
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.0625rem;
    line-height: 1.7;
    color: #4a5772;
    text-align: center;
    margin: 0 auto 44px auto;
    max-width: 680px;
  }
  .cd-blp-faq__list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .cd-blp-faq__item {
    background: #ffffff;
    border: 1px solid #e8edf6;
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(37,65,139,0.06);
    overflow: hidden;
    transition: box-shadow .2s ease, transform .2s ease;
  }
  .cd-blp-faq__item[open] {
    box-shadow: 0 12px 28px rgba(28,51,112,0.12);
  }
  .cd-blp-faq__item > summary {
    list-style: none;
    cursor: pointer;
    padding: 22px 26px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 1.0625rem;
    font-weight: 700;
    color: #25418b;
    letter-spacing: -0.005em;
    line-height: 1.35;
  }
  .cd-blp-faq__item > summary::-webkit-details-marker { display: none; }
  .cd-blp-faq__item > summary::after {
    content: '+';
    font-size: 1.5rem;
    font-weight: 400;
    color: #ef6632;
    line-height: 1;
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }
  .cd-blp-faq__item[open] > summary::after {
    content: '\\2013';
    color: #1c3370;
  }
  .cd-blp-faq__item[open] > summary {
    border-bottom: 1px solid #eef2f8;
  }
  .cd-blp-faq__a {
    padding: 18px 26px 24px 26px;
    font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 0.9688rem;
    line-height: 1.7;
    color: #525f7f;
    margin: 0;
  }
  @media (max-width: 760px) {
    .cd-blp-faq { padding: 64px 20px 72px 20px; }
    .cd-blp-faq__h2 { font-size: 1.65rem; }
    .cd-blp-faq__sub { font-size: 1rem; margin-bottom: 32px; }
    .cd-blp-faq__item > summary { padding: 18px 20px; font-size: 0.9688rem; }
    .cd-blp-faq__a { padding: 16px 20px 20px 20px; }
  }
</style>
<section class="cd-blp-faq">
  <div class="cd-blp-faq__inner">
    <p class="cd-blp-faq__eyebrow" data-field="eyebrow">{{eyebrow}}</p>
    <h2 class="cd-blp-faq__h2" data-field="title">{{title}}</h2>
    <div class="cd-blp-faq__rule"></div>
    <p class="cd-blp-faq__sub" data-field="subtitle">{{subtitle}}</p>
    <div class="cd-blp-faq__list">
      <details class="cd-blp-faq__item" data-repeat="faqs">
        <summary data-field="q">{{faqs.q}}</summary>
        <p class="cd-blp-faq__a" data-field="a">{{faqs.a}}</p>
      </details>
    </div>
  </div>
</section>
`.trim();

const FAQ_DEFAULTS = {
  eyebrow: 'Find your fit',
  title: 'Which loan product is right for you?',
  subtitle:
    'Each Cardiff product is built for a different stage and cash-flow shape. Use the prompts below to narrow in on the one that matches your business today.',
  faqs: [
    {
      q: 'I need a lump sum with predictable monthly payments — what should I pick?',
      a: 'A Small Business Term Loan is the cleanest fit. You get a single deposit and pay it back on a fixed schedule, which makes budgeting straightforward and is ideal for one-time investments like a buildout, an acquisition, or a major piece of equipment.',
    },
    {
      q: 'My cash flow is uneven — some months are great, some are slow.',
      a: 'Look at Working Capital Loans or Revenue-Based Financing. Both flex with the rhythm of your revenue rather than forcing a fixed monthly nut, so a slow month does not pinch you the same way a term loan would.',
    },
    {
      q: 'My credit is thin but my sales are strong.',
      a: 'A Merchant Cash Advance or Revenue-Based Financing is built for exactly this profile. We underwrite on actual deposits and card volume, not just a FICO score, and pull a percentage of future receipts rather than a hard monthly payment.',
    },
    {
      q: 'I want capital on standby for whenever an opportunity shows up.',
      a: 'A Business Line of Credit gives you a ceiling you can draw against at will — pay interest only on what you use, and the credit replenishes as you pay it back. It is the right tool for unpredictable timing.',
    },
    {
      q: 'I need to buy or upgrade specific equipment.',
      a: 'Equipment Financing keeps the equipment itself as the collateral, which usually means lower rates and longer terms than a general-purpose loan. Cardiff funds new and used equipment across most industries.',
    },
    {
      q: 'I have unpaid customer invoices but I cannot wait 30–90 days to collect.',
      a: 'Invoice Financing advances you most of the invoice value now and settles up when your customer pays. It is a fast way to unlock cash already on your books without taking on a traditional loan.',
    },
    {
      q: 'I am not sure which one fits — what should I do?',
      a: 'Submit one application. A Cardiff funding specialist reviews your situation and matches you with the product (or combination) that fits — there is no penalty for choosing the wrong one upfront, because we route you to the right one before any commitment.',
    },
  ],
} as const;

const faqBlock = {
  id: FAQ_ID,
  type: 'html-render' as const,
  width: 'full' as const,
  order: 3,
  html: FAQ_HTML,
  fields: [
    { name: 'eyebrow', label: 'Eyebrow label', type: 'text' as const, default: FAQ_DEFAULTS.eyebrow },
    { name: 'title', label: 'Section title', type: 'text' as const, default: FAQ_DEFAULTS.title },
    { name: 'subtitle', label: 'Section subtitle', type: 'textarea' as const, default: FAQ_DEFAULTS.subtitle },
    {
      name: 'faqs',
      label: 'FAQ items',
      type: 'array' as const,
      itemFields: [
        { name: 'q', label: 'Question', type: 'text' as const },
        { name: 'a', label: 'Answer', type: 'textarea' as const },
      ],
    },
  ],
  values: {
    eyebrow: FAQ_DEFAULTS.eyebrow,
    title: FAQ_DEFAULTS.title,
    subtitle: FAQ_DEFAULTS.subtitle,
    faqs: [...FAQ_DEFAULTS.faqs],
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

  const idx = parsed.blocks.findIndex((b: any) => b?.id === FAQ_ID);
  if (idx === -1) {
    parsed.blocks.push(faqBlock);
    console.log(`Appended FAQ block ${FAQ_ID} at index ${parsed.blocks.length - 1}.`);
  } else {
    const existing = parsed.blocks[idx];
    // Preserve author-edited values; rewrite html/fields/structure.
    const mergedValues = {
      eyebrow: existing.values?.eyebrow ?? FAQ_DEFAULTS.eyebrow,
      title: existing.values?.title ?? FAQ_DEFAULTS.title,
      subtitle: existing.values?.subtitle ?? FAQ_DEFAULTS.subtitle,
      faqs:
        Array.isArray(existing.values?.faqs) && existing.values.faqs.length > 0
          ? existing.values.faqs
          : [...FAQ_DEFAULTS.faqs],
    };
    parsed.blocks[idx] = { ...faqBlock, values: mergedValues };
    console.log(`Rewrote FAQ block ${FAQ_ID} at index ${idx} (preserved author values).`);
  }

  // Re-number order so renderer stays sequential.
  parsed.blocks.forEach((b: { order?: number }, i: number) => {
    b.order = i + 1;
  });

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}. Block count: ${parsed.blocks.length}, ids: [${parsed.blocks.map((b: any) => b.id).join(', ')}]`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
