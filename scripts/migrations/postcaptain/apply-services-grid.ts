import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Upgrade post 302's Services Overview section (Block 3, raw columns) to use
 * the extended services-grid block with bullets, per Post Captain's live layout.
 *
 * Target section: first section that is NOT already using flip-card-grid,
 * logo-strip, metric-cards, or team-showcase — specifically the one between
 * the logo strip and the flip-card-grid section. We identify it by checking
 * for a nested columns block with gap=lg.
 */

type AnyBlock = Record<string, unknown> & {
  id: string;
  type: string;
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
  const parsed = typeof post.content === 'string' ? JSON.parse(post.content) : post.content;
  const blocks: AnyBlock[] = parsed.blocks || [];

  // Find the services-overview section. Heuristic: first unmodernized section
  // (one with ONLY nested columns blocks) sitting between logo-strip and
  // flip-card-grid.
  const targetIdx = blocks.findIndex((b, i) => {
    if (b.type !== 'section') return false;
    const nested = (b.blocks as AnyBlock[]) || [];
    if (nested.length === 0) return false;
    const hasModernBlock = nested.some((n) => ['services-grid', 'card-grid', 'flip-card-grid', 'metric-cards', 'logo-strip', 'team-showcase'].includes(n.type));
    if (hasModernBlock) return false;
    const allColumnsOrText = nested.every((n) => ['columns', 'heading', 'text', 'button'].includes(n.type));
    // Want one with at least one columns block and at least 2 columns blocks
    const columnsCount = nested.filter((n) => n.type === 'columns').length;
    return allColumnsOrText && columnsCount >= 2 && i < 5; // within the first 5 sections
  });

  if (targetIdx === -1) {
    console.log('No suitable services section found — it may already be upgraded.');
    process.exit(0);
  }

  console.log(`Targeting section at index ${targetIdx}`);
  const section = blocks[targetIdx];

  section.backgroundColor = '#FFFFFF';
  section.paddingTop = '100px';
  section.paddingBottom = '100px';
  section.paddingLeft = '24px';
  section.paddingRight = '24px';
  section.maxWidth = '1200px';
  section.blocks = [
    {
      id: `services-grid-${Date.now()}`,
      type: 'services-grid',
      order: 1,
      overline: 'OUR SERVICES',
      title: 'Mapping Smarter Moves',
      description: 'Three ways to put a former Slate Captain on your team — without adding headcount.',
      columns: 3,
      accentColor: '#004D80',
      services: [
        {
          id: 'svc-implementations',
          title: 'Implementations',
          description: 'Set everyone up for success in Slate with a collaborative, learn-by-doing approach.',
          icon: 'rocket_launch',
          link: '/service/implementations',
          linkText: 'Explore Implementations',
          bullets: [
            { id: 'i-1', icon: 'school', text: 'Learn along the way' },
            { id: 'i-2', icon: 'layers', text: 'Simplify your tech stack' },
            { id: 'i-3', icon: 'trending_down', text: 'Reduce overhead' },
          ],
        },
        {
          id: 'svc-projects',
          title: 'Projects',
          description: 'Ensure smooth execution in Slate with complete solutions that save your team time.',
          icon: 'assignment_turned_in',
          link: '/service/projects',
          linkText: 'Explore Projects',
          bullets: [
            { id: 'p-1', icon: 'verified', text: 'Complete solutions' },
            { id: 'p-2', icon: 'schedule', text: 'Save staff time' },
            { id: 'p-3', icon: 'handshake', text: 'Expert execution' },
          ],
        },
        {
          id: 'svc-support',
          title: 'Support',
          description: 'Access our Slate Captain services — a real human who adapts to your needs.',
          icon: 'support_agent',
          link: '/service/support',
          linkText: 'Explore Support',
          bullets: [
            { id: 's-1', icon: 'person', text: 'Real human support' },
            { id: 's-2', icon: 'tune', text: 'Adapts to your needs' },
            { id: 's-3', icon: 'favorite', text: 'Feel seen & heard' },
          ],
        },
      ],
    },
  ];

  const newContent = JSON.stringify({ ...parsed, blocks });
  await db.update(posts).set({ content: newContent, updatedAt: new Date() }).where(eq(posts.id, 302));
  console.log(`✓ Replaced section ${targetIdx} with services-grid (Implementations / Projects / Support)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
