import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Apply the new flip-card-grid and metric-cards blocks to post 302 (Post Captain home).
 *
 * Block 6 (case studies columns) → metric-cards block
 * Inserts a new section with flip-card-grid between the Services section (Block 2)
 * and the Portals section (Block 3) to showcase the new interactive block type.
 */

type AnyBlock = Record<string, unknown> & {
  id: string;
  type: string;
  order?: number;
  blocks?: AnyBlock[];
};

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) {
    console.log('Post 302 not found');
    process.exit(1);
  }
  const parsed = typeof post.content === 'string' ? JSON.parse(post.content) : (post.content as { blocks: AnyBlock[] });
  const blocks: AnyBlock[] = parsed.blocks || [];

  console.log(`Starting block count: ${blocks.length}`);

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Replace Block 6 (case studies columns section) with a metric-cards block
  // ──────────────────────────────────────────────────────────────────────────
  const block6Idx = blocks.findIndex((b) => {
    if (b.type !== 'section') return false;
    const nested = (b.blocks as AnyBlock[] | undefined) || [];
    return nested.some((n) => {
      const content = n.content as string | undefined;
      return typeof content === 'string' && content.includes('TURNING SLATE INTO A STRATEGIC GROWTH ENGINE');
    });
  });

  if (block6Idx !== -1) {
    const metricCardsSection: AnyBlock = {
      id: 'metrics-section',
      type: 'section',
      order: 6,
      backgroundColor: '#FFFFFF',
      paddingTop: '100px',
      paddingBottom: '100px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1200px',
      blocks: [
        {
          id: 'metrics-heading',
          type: 'heading',
          order: 1,
          content: 'TURNING SLATE INTO A STRATEGIC GROWTH ENGINE',
          level: 2,
          alignment: 'center',
          elementStyles: {
            _block: {
              fontFamily: 'Poppins',
              fontSize: '32px',
              fontWeight: '700',
              color: '#1F2937',
              letterSpacing: '0.02em',
              textTransform: 'uppercase' as const,
            },
          },
        },
        {
          id: 'metrics-intro',
          type: 'text',
          order: 2,
          content: 'Finally — a partner who sees the big picture, speaks your language, and knows how to convert Slate from an operational tool into a true engine for growth.',
          alignment: 'center',
          style: {
            maxWidth: '720px',
            margin: '0 auto 48px',
            color: '#4B5563',
            fontSize: '18px',
            lineHeight: '1.6',
          },
        },
        {
          id: 'metrics-block',
          type: 'metric-cards',
          order: 3,
          columns: 4,
          accentColor: '#004D80',
          metrics: [
            {
              id: 'm-1',
              value: '83%',
              label: 'Increase in Readmit Completions',
              institution: 'William Peace University',
              link: '/case-studies/william-peace',
              linkText: 'Case Study',
            },
            {
              id: 'm-2',
              value: '$965K+',
              label: 'Raised from 2,600+ Donors',
              institution: 'Loyola University Maryland',
              link: '/case-studies/loyola',
              linkText: 'Case Study',
            },
            {
              id: 'm-3',
              value: '2 Days',
              label: 'Staff Time Saved By Eliminating Advance Badge Printing',
              institution: 'VCU',
              link: '/case-studies/vcu',
              linkText: 'Case Study',
            },
            {
              id: 'm-4',
              value: '5 Years',
              label: 'Historical Data Integrated into Funnel Reports',
              institution: 'Landmark College',
              link: '/case-studies/landmark',
              linkText: 'Case Study',
            },
          ],
        },
      ],
    };
    blocks[block6Idx] = metricCardsSection;
    console.log(`✓ Replaced block ${block6Idx} (case studies) with metric-cards`);
  } else {
    console.log('⚠ Could not locate case studies section (Block 6)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Add a flip-card-grid section between Block 2 (services) and Block 3 (portals)
  //    Showcases the new flip card block with Slate service benefits
  // ──────────────────────────────────────────────────────────────────────────
  const existingFlipSection = blocks.findIndex((b) => b.id === 'flip-cards-section');
  if (existingFlipSection === -1) {
    const flipSection: AnyBlock = {
      id: 'flip-cards-section',
      type: 'section',
      order: 2.5,
      backgroundColor: '#F9FAFB',
      paddingTop: '100px',
      paddingBottom: '100px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1200px',
      blocks: [
        {
          id: 'flip-cards-grid',
          type: 'flip-card-grid',
          order: 1,
          overline: 'WHY SLATE CAPTAINS',
          title: 'Built Around How You Actually Work',
          description: 'Hover any card to see how we meet teams where they are.',
          columns: 3,
          flipTrigger: 'hover',
          flipAxis: 'horizontal',
          cardHeight: '300px',
          accentColor: '#004D80',
          cards: [
            {
              id: 'fc-1',
              frontTitle: 'Learn Along the Way',
              frontSubtitle: 'Training baked in',
              frontIcon: 'school',
              backText: 'Every engagement is a learning opportunity. We document, explain, and hand off — so your team owns the outcome, not just the deliverable.',
              backLink: '/service/implementations',
              backLinkText: 'Explore Implementations',
            },
            {
              id: 'fc-2',
              frontTitle: 'Simplify Your Stack',
              frontSubtitle: 'Less sprawl, more Slate',
              frontIcon: 'layers',
              backText: 'Consolidate forms, portals, dashboards, and communications into Slate — the source of truth your staff already trusts.',
              backLink: '/service/projects',
              backLinkText: 'Explore Projects',
            },
            {
              id: 'fc-3',
              frontTitle: 'Real Human Support',
              frontSubtitle: 'Captains, not bots',
              frontIcon: 'support_agent',
              backText: 'When you need us, you reach a former Slate Captain — someone who has lived in your shoes and can act fast.',
              backLink: '/service/support',
              backLinkText: 'Explore Support',
            },
          ],
          elementStyles: {
            title: {
              fontFamily: 'Poppins',
              fontSize: '40px',
              fontWeight: '700',
              color: '#1F2937',
            },
            overline: {
              fontFamily: 'Poppins',
              fontWeight: '600',
            },
          },
        },
      ],
    };

    // Insert after block with order 2 (services overview)
    const afterIdx = blocks.findIndex((b) => (b.order as number) === 2) + 1;
    blocks.splice(afterIdx, 0, flipSection);
    console.log(`✓ Inserted flip-card-grid section at position ${afterIdx}`);
  } else {
    console.log('→ Flip card section already exists, skipping insert');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Save
  // ──────────────────────────────────────────────────────────────────────────
  const newContent = JSON.stringify({ ...parsed, blocks });
  await db
    .update(posts)
    .set({ content: newContent, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log(`\nFinal block count: ${blocks.length}`);
  console.log('✓ Saved post 302');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
