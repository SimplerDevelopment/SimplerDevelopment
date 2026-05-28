/**
 * Iter 7 (post 830 — short-term-working-capital-loans):
 * Fill in sec-8 "Frequently Asked Questions" — currently just an H2 +
 * orange divider with NO body content. This is by far the biggest
 * remaining visual gap on the page: the heading promises FAQs and the
 * reader finds nothing.
 *
 * Cardiff.co's source page renders 11 FAQ toggles (Divi `et_pb_toggle`
 * components). We add them as a single `accordion` block (one of the
 * platform's built-in interactive block types) styled to match the home
 * page FAQ pattern from `restyle-home-faq.ts`:
 *   - itemTitle: Raleway 700 #25418b
 *   - itemContent: Open Sans #525f7f
 *   - section background tint #f8fafd, tightened padding, 880px max width
 *
 * Idempotent: detects an existing `sec-8-faq` accordion in sec-8.blocks
 * and rewrites it in place; otherwise appends one after the H2 + divider.
 * Preserves the existing sec-8-title and sec-8-div blocks untouched.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const POST_ID = 830;
const SECTION_ID = 'sec-8';
const ACC_BLOCK_ID = 'sec-8-faq';

type FaqItem = { id: string; title: string; content: string };

const ITEMS: FaqItem[] = [
  {
    id: 'faq-1',
    title: 'What is the repayment term for a short-term business loan?',
    content:
      'Most short-term Cardiff loans range from six to 18 months. Fixed payment amounts give you a clear repayment schedule, so you always know what to expect. This structure also makes it easier to manage cash flow while paying down your loan.',
  },
  {
    id: 'faq-2',
    title: 'When will I receive funding with a short-term loan?',
    content:
      'Speed depends on how quickly you complete the application and provide the required information. You can complete Cardiff’s online application in minutes, and qualified applicants can get approved and funded as fast as the same day.',
  },
  {
    id: 'faq-3',
    title: 'Do I need perfect credit to qualify for a short-term loan?',
    content:
      'No, Cardiff works with business owners who have credit scores as low as 500. Approval depends more on your revenue and time in business than your credit score. If traditional lenders have turned you away, Cardiff is a strong option.',
  },
  {
    id: 'faq-4',
    title: 'Are there penalties for paying off my loan early?',
    content:
      'No. Eligible borrowers can take advantage of interest-free early payoff options. This flexibility allows you to save money and improve your cash flow.',
  },
  {
    id: 'faq-5',
    title: 'What industries can get a short-term loan through Cardiff?',
    content:
      'Cardiff offers short-term business term loans to a wide range of industries, including hospitality, retail, restaurants, construction, landscaping, and healthcare. Our focus is on the performance of your business, not just the sector you operate in, making our loans accessible to many small and mid-sized businesses.',
  },
  {
    id: 'faq-6',
    title: 'What is a short-term business term loan?',
    content:
      'A short-term loan is a lump sum of funding that you repay over a fixed, brief period, typically six to 18 months. These loans help you cover immediate business needs without committing to long-term debt.',
  },
  {
    id: 'faq-7',
    title: 'Can I use a Cardiff term loan for working capital?',
    content:
      'Yes, Cardiff term loans offer flexible financing. Business owners often use them for working capital needs such as payroll, inventory, or operating expenses. You can allocate them where your business needs them most.',
  },
  {
    id: 'faq-8',
    title: 'When should I choose a term loan vs. a line of credit?',
    content:
      'A term loan provides a lump sum upfront with structured repayment, while a line of credit is a revolving source of funding you can access as needed. Term loans are an excellent choice for immediate financial needs. Lines of credit are better for ongoing, flexible funding needs.',
  },
  {
    id: 'faq-9',
    title: 'Is collateral required for a short-term business loan?',
    content:
      'No, Cardiff offers unsecured short-term loans, meaning you don’t need to put up assets. We base approval on factors like revenue, time in business, and financial performance, which makes the process simpler and faster compared to collateral-based loans.',
  },
  {
    id: 'faq-10',
    title: "Can startups apply for Cardiff's term loans?",
    content:
      'Cardiff generally works with businesses operating for at least six to 12 months. Startups without an operating history may not qualify yet. Once you’ve established consistent revenue, you may be eligible for funding.',
  },
  {
    id: 'faq-11',
    title: 'How much can I borrow with a Cardiff term loan?',
    content:
      'Cardiff offers loan amounts ranging from $10,000 to $500,000. The size of your loan depends on your revenue, financial history, and funding needs. This flexibility allows Cardiff to support both smaller and larger businesses.',
  },
];

function buildAccordionBlock(order: number, items: FaqItem[]) {
  return {
    type: 'accordion' as const,
    id: ACC_BLOCK_ID,
    order,
    items,
    style: {
      color: '#525f7f',
    },
    elementStyles: {
      itemTitle: {
        fontFamily: "Raleway, -apple-system, BlinkMacSystemFont, sans-serif",
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
  const sec = parsed.blocks.find((b: { id?: string }) => b?.id === SECTION_ID);
  if (!sec || sec.type !== 'section' || !Array.isArray(sec.blocks)) {
    console.error(`Post ${POST_ID}: section ${SECTION_ID} missing or not a section`);
    process.exit(1);
  }

  // Tighten the FAQ section chrome to match home FAQ pattern.
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f8fafd',
    paddingTop: '64px',
    paddingBottom: '64px',
  };
  sec.maxWidth = '880px';

  const existingIdx = sec.blocks.findIndex(
    (b: { id?: string }) => b?.id === ACC_BLOCK_ID,
  );

  if (existingIdx === -1) {
    // Insert after the divider (sec-8-div, order 2). Use order 3 to
    // appear immediately below it.
    sec.blocks.push(buildAccordionBlock(3, ITEMS));
  } else {
    // Preserve any author-edited copy on individual items by id, but
    // ensure the full canonical set of 11 is present.
    const existing = sec.blocks[existingIdx];
    const order = typeof existing?.order === 'number' ? existing.order : 3;
    const preservedById = new Map<string, FaqItem>();
    if (Array.isArray(existing?.items)) {
      for (const it of existing.items) {
        if (it && typeof it.id === 'string') preservedById.set(it.id, it as FaqItem);
      }
    }
    const merged = ITEMS.map((seed) => {
      const prev = preservedById.get(seed.id);
      if (!prev) return seed;
      const pickStr = (v: unknown, fb: string) =>
        typeof v === 'string' && v.trim().length > 0 ? v : fb;
      return {
        id: seed.id,
        title: pickStr(prev.title, seed.title),
        content: pickStr(prev.content, seed.content),
      };
    });
    sec.blocks[existingIdx] = buildAccordionBlock(order, merged);
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: ${SECTION_ID} now has accordion ${ACC_BLOCK_ID} with ${ITEMS.length} items`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
