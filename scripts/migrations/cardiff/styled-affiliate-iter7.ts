/**
 * Iter 7 — Affiliate page (post 796): rebuild sec-7, the "Frequently Asked
 * Questions" band, into a real branded accordion.
 *
 * Prior iters: iter1 hero, iter2 audience grid (sec-3), iter3 3-step (sec-2),
 * iter4 support (sec-5), iter5 service benefits (sec-6), iter6 deep-blue
 * value-prop band (sec-1).
 *
 * Side-by-side vs cardiff.co/affiliate/ exposes sec-7 as the biggest
 * remaining gap. The port has the right *headline* ("Frequently Asked
 * Questions") and an orange divider, but the body is two orphan paragraphs:
 * one about tracking leads in Impact.com, one about ad imagery / scripts /
 * Telegram support. The cardiff.co source has a full 9-item accordion with
 * affiliate-specific questions:
 *   1. Do I get paid even if the business owner doesn't take the loan?
 *   2. How much can I earn per qualified referral?
 *   3. How do I know if someone qualifies?
 *   4. Is this program only for professional affiliates?
 *   5. What tools and support do I get?
 *   6. How and when do I get paid?
 *   7. Is there any cost to join the affiliate program?
 *   8. How to reach out and contact us?
 *   9. What can affiliates do, and what are the limits?
 *
 * A prospective affiliate scans this section to answer the two questions
 * that decide whether they sign up: "How do I get paid?" and "Do I have to
 * do anything other than introduce people?" Without the accordion, both
 * remain unanswered on the page.
 *
 * Fix: rewrite sec-7 to mirror the FAQ accordion pattern used on
 * styled-how-to-qualify-iter7 (post 804) — Raleway "YOU ASKED. WE ANSWERED."
 * overline, deep-blue H2, orange divider rule, then a branded accordion
 * block with the 9 affiliate-specific Q&A pairs lifted verbatim from
 * cardiff.co. Keep the existing two orphan paragraphs by folding them
 * into the answers for Q3 (Impact dashboard) and Q5 (tools/support) where
 * they already belong.
 *
 * Brand palette only: #1c3370 / #25418b / #5ac96f / #ef6632 / #ffb798.
 * Raleway titles + Open Sans body. Material Icons over emojis.
 *
 * Idempotent: looks up sec-7 by id, rewrites blocks + style each run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_ID = 796;
const TARGET_SECTION_ID = 'sec-7';

const FAQ_ITEMS = [
  {
    id: 'q-paid-even-if-no-loan',
    title: "Do I get paid even if the business owner doesn't take the loan?",
    content:
      "Yes. As long as the business owner you refer qualifies for our funding, you get paid — even if they ultimately decide not to take the loan. You're rewarded for the introduction, not the close.",
  },
  {
    id: 'q-how-much-earn',
    title: 'How much can I earn per qualified referral?',
    content:
      'For every qualified referral you send, you receive a $50 payout. If your qualified referral goes on to take a loan, you receive an additional 5% commission on the funded loan amount.',
  },
  {
    id: 'q-how-do-i-know-qualifies',
    title: 'How do I know if someone qualifies?',
    content:
      'You can track qualified leads and funded loan commissions in your Impact.com dashboard. Once you sign up, you will receive credentials to access the Impact Dashboard and see every referral, status, and payout in one place.',
  },
  {
    id: 'q-professional-only',
    title: 'Is this program only for professional affiliates?',
    content:
      "No — the Cardiff affiliate opportunity is for everyone, even if you've never done anything like this before. We provide all the training, resources, and support you need to succeed, whether you're a seasoned partner or sending us your very first introduction.",
  },
  {
    id: 'q-tools-support',
    title: 'What tools and support do I get?',
    content:
      'You will gain access to ad imagery, ad videos, scripts to use to pitch, a Cardiff affiliate guide, and an exclusive Telegram support group. You can also email our affiliate support team any time with questions on a specific referral or campaign.',
  },
  {
    id: 'q-how-when-paid',
    title: 'How and when do I get paid?',
    content:
      'Cardiff affiliates earn commission by referring businesses that meet our qualification criteria — you get paid for driving qualified leads, even if they do not end up taking a loan. Once the referral is tracked and approved through our partner platform (Impact), your earnings are released and paid out according to your selected payout schedule.',
  },
  {
    id: 'q-cost-to-join',
    title: 'Is there any cost to join the affiliate program?',
    content: 'No. It is free to join the Cardiff affiliate program — there are no setup fees, monthly fees, or minimums.',
  },
  {
    id: 'q-contact',
    title: 'How do I reach out and contact the affiliate team?',
    content:
      'Email <a href="mailto:affiliates_support@cardiff.co" style="color:#25418b;text-decoration:underline">affiliates_support@cardiff.co</a> and a member of our affiliate team will get back to you, usually the same business day.',
  },
  {
    id: 'q-limits',
    title: 'What can affiliates do, and what are the limits?',
    content:
      "Cardiff affiliates can refer qualified business owners to our platform, but all funding applications must be submitted directly by the applicant. To protect privacy and meet compliance standards, we only discuss application details with the applicant — not brokers, consultants, or third parties. Affiliates may share our application link and request that clients apply directly. We're happy to provide general program information, but we cannot discuss individual applicants or application outcomes.",
  },
];

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema/cms');
  const { eq } = await import('drizzle-orm');

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

  const idx = parsed.blocks.findIndex((b: { id?: string }) => b?.id === TARGET_SECTION_ID);
  if (idx === -1) {
    console.error(`Post ${POST_ID}: no block with id=${TARGET_SECTION_ID}; aborting`);
    process.exit(1);
  }
  const sec = parsed.blocks[idx];
  if (sec.type !== 'section') {
    console.error(
      `Post ${POST_ID}: block ${TARGET_SECTION_ID} is not a section (was ${sec.type}); aborting`,
    );
    process.exit(1);
  }

  // Re-paint the section as a soft band so the accordion cards have contrast.
  sec.maxWidth = '880px';
  sec.style = {
    ...(sec.style || {}),
    backgroundColor: '#f8fafd',
    paddingTop: '88px',
    paddingBottom: '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
  };

  const overlineBlock = {
    type: 'heading' as const,
    id: 'sec-7-overline-iter7',
    order: 1,
    level: 6,
    content: 'YOU ASKED. WE ANSWERED.',
    alignment: 'center' as const,
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
    id: 'sec-7-title',
    order: 2,
    level: 2,
    content: 'Frequently Asked Questions',
    alignment: 'center' as const,
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
    id: 'sec-7-div',
    order: 3,
    content:
      '<div style="width:56px;height:3px;background:#ef6632;margin:0 auto 36px auto;border-radius:2px"></div>',
    style: { textAlign: 'center' as const, margin: '0 auto 0 auto' },
  };

  const accordionBlock = {
    type: 'accordion' as const,
    id: 'sec-7-acc-iter7',
    order: 4,
    items: FAQ_ITEMS,
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

  sec.blocks = [overlineBlock, titleBlock, dividerBlock, accordionBlock];

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, POST_ID));
  console.log(
    `Updated post ${POST_ID}: ${TARGET_SECTION_ID} -> branded FAQ band with ${FAQ_ITEMS.length}-item affiliate accordion.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
