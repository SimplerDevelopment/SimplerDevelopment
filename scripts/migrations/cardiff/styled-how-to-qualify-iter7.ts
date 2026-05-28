/**
 * How to Qualify page (post id 804) — iteration 7.
 *
 * Iters 1-6 styled hero, sec-1 (trust pillars), sec-2 (compare grid),
 * sec-3 (how-it-works steps), sec-4 (right-lender card), and the final
 * dark-blue CTA band. The single biggest remaining content gap vs the
 * source page (https://cardiff.co/business-loans/how-to-qualify/) is the
 * page's *granular qualification questions* — credit score thresholds,
 * time-in-business minimums, revenue floors, citizenship rules, and
 * ownership/PG requirements that differ between Working Capital and
 * Equipment Finance. The original surfaces these as a wall of <h4>
 * stubs; we can do better by collapsing them into a single accordion FAQ
 * placed right above the final CTA, so a qualifier-anxious visitor can
 * self-screen before submitting.
 *
 * Fix: insert a new `sec-faq` section between `sec-4-right-lender-iter3`
 * (order 5) and `final-cta-band` (order 6) containing an `accordion`
 * block (same component used on the home page FAQ). Brand palette only,
 * Raleway titles + Open Sans body to match the rest of the page.
 *
 * Idempotent: detects the `sec-faq` section by id; rewrites it in place
 * and re-shifts the final CTA back to last position if needed.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const POST_ID = 804;
  const FAQ_SECTION_ID = 'sec-faq';
  const FAQ_ACCORDION_ID = 'sec-faq-acc-iter7';
  const FINAL_CTA_ID = 'final-cta-band';
  const ANCHOR_PREV_ID = 'sec-4-right-lender-iter3';

  const faqItems = [
    {
      id: 'q-credit-score',
      title: 'What credit score do I need to qualify?',
      content:
        'Cardiff is flexible on credit. As a rule of thumb, applicants with a personal credit score above 500 are in the clear for working capital loans. For equipment financing, a stronger credit profile can unlock better rates and higher approval amounts, but lower scores still have a path with the right revenue and cash flow story.',
    },
    {
      id: 'q-time-in-business',
      title: 'How long do I need to have been in business?',
      content:
        'For working capital loans, Cardiff looks for at least 1 year in business. Equipment financing is more forgiving — start-ups are welcome. If you are seeking more than $100K or want the lowest possible rate on an equipment loan, plan on having at least two years of operating history.',
    },
    {
      id: 'q-revenue',
      title: 'What revenue do I need to qualify?',
      content:
        'For working capital, Cardiff looks for roughly $20,000 per month in revenue (about $240,000 annually) with a minimum of three deposits per month. For equipment loans, revenue matters less — a strong credit profile and the right piece of equipment can carry the file even if monthly revenues are modest.',
    },
    {
      id: 'q-citizenship',
      title: 'Is US citizenship required?',
      content:
        'No. US citizenship is not required for any Cardiff loan product. The business owner just needs to be a legal resident of the United States.',
    },
    {
      id: 'q-ownership',
      title: 'Who needs to sign the loan application?',
      content:
        'For working capital, any owner can execute the contract regardless of their ownership percentage. For equipment financing, owners holding 51% or more of the company will need to sign on behalf of the business. Personal Guarantees are required for businesses with fewer than ten owners; Corporation-Only (Corp-Only) approvals are available case-by-case.',
    },
    {
      id: 'q-collateral',
      title: 'Do I need to pledge collateral?',
      content:
        'Working capital loans through Cardiff are unsecured — you do not pledge equipment, inventory, or receivables. Equipment financing is naturally secured by the equipment you are buying, so the asset itself serves as the collateral.',
    },
    {
      id: 'q-industries',
      title: 'Which industries does Cardiff fund?',
      content:
        'Cardiff funds a wide range of small businesses: trucking (long-haul, short-haul, last-mile, interstate, intrastate), dental practices, contractors (general, electrical, roofing, HVAC, plumbing), restaurants, retail, manufacturing, and many service businesses. Automotive dealers, financial services firms, law firms, and non-profits typically do not qualify.',
    },
    {
      id: 'q-speed',
      title: 'How fast can I get funded?',
      content:
        'Most applicants receive a decision the same business day. Approved files can be funded in as little as 24 hours once paperwork is complete, so you can move on time-sensitive opportunities without waiting weeks for a traditional bank.',
    },
  ];

  const overlineBlock = {
    type: 'heading' as const,
    alignment: 'center' as const,
    id: 'sec-faq-overline-iter7',
    order: 1,
    level: 6,
    content: 'YOU ASKED. WE ANSWERED.',
    style: {
      color: '#ef6632',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '0.6875rem',
      fontWeight: '700',
      letterSpacing: '0.32em',
      textTransform: 'uppercase' as const,
      margin: '0 0 16px 0',
      textAlign: 'center',
    },
  };

  const titleBlock = {
    type: 'heading' as const,
    alignment: 'center' as const,
    id: 'sec-faq-title-iter7',
    order: 2,
    level: 2,
    content: 'Qualification questions, answered',
    style: {
      color: '#1c3370',
      fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '2.25rem',
      fontWeight: '800',
      letterSpacing: '-0.015em',
      lineHeight: '1.18',
      margin: '0 0 14px 0',
      textAlign: 'center',
    },
  };

  const dividerBlock = {
    type: 'text' as const,
    id: 'sec-faq-div-iter7',
    order: 3,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  const accordionBlock = {
    type: 'accordion' as const,
    id: FAQ_ACCORDION_ID,
    order: 4,
    items: faqItems,
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
    type: 'section' as const,
    id: FAQ_SECTION_ID,
    order: 0, // re-numbered below
    maxWidth: '880px',
    style: {
      backgroundColor: '#f8fafd',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    blocks: [overlineBlock, titleBlock, dividerBlock, accordionBlock],
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

  // Remove any existing FAQ section we previously inserted (idempotent).
  parsed.blocks = parsed.blocks.filter((b: { id?: string }) => b?.id !== FAQ_SECTION_ID);

  // Find anchor (sec-4 right-lender) and final CTA.
  const anchorIdx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === ANCHOR_PREV_ID);
  if (anchorIdx === -1) {
    console.error(`Post ${POST_ID}: anchor block id=${ANCHOR_PREV_ID} not found; aborting`);
    process.exit(1);
  }

  // Insert FAQ section immediately after anchor.
  parsed.blocks.splice(anchorIdx + 1, 0, faqSection);

  // Re-number `order` 1..N to keep the renderer's sort deterministic.
  parsed.blocks.forEach((b: { order?: number }, i: number) => {
    b.order = i + 1;
  });

  // Sanity: final CTA must remain last.
  const lastBlock = parsed.blocks[parsed.blocks.length - 1];
  if (lastBlock?.id !== FINAL_CTA_ID) {
    console.warn(
      `WARN: last block is ${lastBlock?.id}, expected ${FINAL_CTA_ID} — section order may need manual review.`,
    );
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: inserted styled FAQ accordion section (id=${FAQ_SECTION_ID}, ${faqItems.length} items) between ${ANCHOR_PREV_ID} and ${FINAL_CTA_ID}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
