/**
 * Iter 7 — Working Capital page (post 837).
 *
 * Biggest remaining unstyled gap: the page has NO FAQ section. Cardiff.co's
 * working-capital page leans on an FAQ block to convert long-tail / hesitant
 * traffic ("how fast?", "do I need collateral?", "what about my credit?").
 * We're sending visitors straight from the apply checklist to the final CTA
 * with no objection-handling layer in between.
 *
 * Fix: insert a NEW top-level `sec-5-faq` section between `sec-4` (How to
 * Apply) and `final-cta`, using the same accordion + elementStyles recipe
 * as the home-page FAQ (restyle-home-faq.ts) — overline, centered title,
 * white-card accordion items with brand typography.
 *
 * Idempotent: re-running detects `sec-5-faq` and rewrites it in place.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 837;
const NEW_SECTION_ID = 'sec-5-faq';

const FAQ_ITEMS = [
  {
    id: 'wc-q-1',
    title: 'How fast can I get working capital from Cardiff?',
    content:
      "Most applicants receive a same-day decision. Once you're approved and your paperwork is in order, Cardiff can deposit funds in your business checking account within 24 hours — fast enough to cover a surprise tax bill, an emergency repair, or a sudden purchase order.",
  },
  {
    id: 'wc-q-2',
    title: 'Do I need collateral for a working capital loan?',
    content:
      "No collateral is required for Cardiff working capital loans up to $250,000. We base approval on your business's overall financial health — revenue trends, deposit history, and time in business — not on pledged assets.",
  },
  {
    id: 'wc-q-3',
    title: 'What credit score do I need to qualify?',
    content:
      "Personal credit isn't the deciding factor. As a rule of thumb, a personal score above 500 keeps you in the running. We weigh business revenue, cash flow, and trajectory far more heavily than a FICO number.",
  },
  {
    id: 'wc-q-4',
    title: 'How is a working capital loan different from a line of credit?',
    content:
      "A term loan is a lump sum with a fixed repayment schedule — great for a one-time investment you can amortize. A business line of credit lets you draw, repay, and re-borrow up to a limit — better for ongoing or unpredictable cash-flow gaps. A working capital advance borrows against future revenue and flexes with monthly sales.",
  },
  {
    id: 'wc-q-5',
    title: 'How much working capital can I borrow?',
    content:
      "Cardiff offers working capital financing up to $250,000 with no collateral required. The right amount for your business is usually a function of your operating cycle — the time it takes to create, sell, and get paid for a product or service. Borrow enough to cover one full cycle without straining the next.",
  },
  {
    id: 'wc-q-6',
    title: 'Can I qualify if my business is less than a year old?',
    content:
      "Yes. Cardiff requires at least 6 months of time in business, plus around $20,000/month ($240,000/year) in revenue with a minimum of three deposits per month. If you meet those marks, your business age won't be a blocker.",
  },
] as const;

const overlineBlock = {
  type: 'heading' as const,
  id: 'sec-5-faq-overline',
  order: 1,
  level: 6 as const,
  alignment: 'center' as const,
  content: 'YOU ASKED. WE ANSWERED.',
  style: {
    color: '#ef6632',
    fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '0.6875rem',
    fontWeight: '700',
    letterSpacing: '0.32em',
    textTransform: 'uppercase',
    margin: '0 0 16px 0',
    textAlign: 'center',
  },
};

const titleBlock = {
  type: 'heading' as const,
  id: 'sec-5-faq-title',
  order: 2,
  level: 2 as const,
  alignment: 'center' as const,
  content: 'Working capital questions, answered',
  style: {
    color: '#25418b',
    fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '2.5rem',
    fontWeight: '800',
    letterSpacing: '-0.018em',
    margin: '0 0 48px 0',
    textAlign: 'center',
  },
};

const accordionBlock = {
  type: 'accordion' as const,
  id: 'sec-5-faq-acc',
  order: 3,
  items: [...FAQ_ITEMS],
  style: { color: '#525f7f' },
  elementStyles: {
    itemTitle: {
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '1rem',
      fontWeight: '700',
      color: '#25418b',
      letterSpacing: '-0.005em',
      lineHeight: '1.35',
    },
    itemContent: {
      fontFamily: "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      fontSize: '0.9375rem',
      lineHeight: '1.65',
      color: '#525f7f',
    },
  },
};

const faqSection = {
  id: NEW_SECTION_ID,
  type: 'section' as const,
  order: 5,
  maxWidth: '880px',
  style: {
    backgroundColor: '#f8fafd',
    paddingTop: '80px',
    paddingBottom: '80px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  blocks: [overlineBlock, titleBlock, accordionBlock],
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

  const existingIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === NEW_SECTION_ID);
  if (existingIdx >= 0) {
    parsed.blocks[existingIdx] = faqSection;
    console.log(`Replaced existing ${NEW_SECTION_ID} at index ${existingIdx} (re-run).`);
  } else {
    const ctaIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === 'final-cta');
    if (ctaIdx === -1) {
      console.error(`Post ${POST_ID}: final-cta not found; aborting`);
      process.exit(1);
    }
    parsed.blocks.splice(ctaIdx, 0, faqSection);
    console.log(`Inserted ${NEW_SECTION_ID} at index ${ctaIdx}.`);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: ensured ${NEW_SECTION_ID}. Block count: ${parsed.blocks.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
