/**
 * Iter 4 — Add elementStyles + style to the home page FAQ accordion block
 * (block 12 → child 2, id "faq-acc") so it visually matches cardiff.co's
 * styled accordion (white card chrome, blue chevron, proper typography).
 *
 * The AccordionBlockRender already supports elementStyles.itemTitle and
 * elementStyles.itemContent. We just need to populate them.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const HOME_POST_ID = 793;

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, HOME_POST_ID)).limit(1);
  if (!row) throw new Error(`Post ${HOME_POST_ID} not found`);
  const parsed = JSON.parse(row.content);
  const faqSection = parsed.blocks[12];
  if (faqSection?.id !== 'faq') throw new Error(`Expected block[12].id === 'faq', got ${faqSection?.id}`);
  const acc = faqSection.blocks[2];
  if (acc?.id !== 'faq-acc') throw new Error(`Expected faqSection.blocks[2].id === 'faq-acc', got ${acc?.id}`);

  acc.style = {
    ...(acc.style || {}),
    color: '#525f7f',
  };
  acc.elementStyles = {
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
  };

  // Also tighten the section padding
  faqSection.style = {
    ...(faqSection.style || {}),
    paddingTop: '64px',
    paddingBottom: '64px',
    backgroundColor: '#f8fafd',
  };
  faqSection.maxWidth = '880px';

  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, HOME_POST_ID));
  console.log(`Updated post ${HOME_POST_ID}: added elementStyles to faq-acc + tightened section padding`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
