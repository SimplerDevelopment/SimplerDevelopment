import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Replace the raw logo-columns inside post 302's "TRUSTED BY 100+" section
 * with the new logo-strip block. The existing section wrapper (white bg,
 * maxWidth) stays; only the inner contents are swapped.
 */

type AnyBlock = Record<string, unknown> & {
  id: string;
  type: string;
  blocks?: AnyBlock[];
};

// Post Captain's client logos from the live site. All hosted on postcaptain.com.
const LOGOS = [
  { url: 'https://postcaptain.com/wp-content/uploads/2024/05/university-of-cincinnati.png', alt: 'University of Cincinnati' },
  { url: 'https://postcaptain.com/wp-content/uploads/2024/05/cooper-union.png', alt: 'Cooper Union' },
  { url: 'https://postcaptain.com/wp-content/uploads/2024/05/university-of-vermont.png', alt: 'University of Vermont' },
  { url: 'https://postcaptain.com/wp-content/uploads/2024/05/northwestern.png', alt: 'Northwestern University' },
  { url: 'https://postcaptain.com/wp-content/uploads/2024/05/carleton.png', alt: 'Carleton College' },
  { url: 'https://postcaptain.com/wp-content/uploads/2024/05/penn.png', alt: 'University of Pennsylvania' },
];

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

  // Target: the section containing TRUSTED BY heading
  const sectionIdx = blocks.findIndex((b) => {
    if (b.type !== 'section') return false;
    const nested = (b.blocks as AnyBlock[]) || [];
    return nested.some((n) => {
      const c = n.content;
      return typeof c === 'string' && c.includes('TRUSTED BY 100+');
    });
  });

  if (sectionIdx === -1) {
    console.log('Could not find TRUSTED BY section');
    process.exit(1);
  }

  const section = blocks[sectionIdx];
  section.blocks = [
    {
      id: `logo-strip-${Date.now()}`,
      type: 'logo-strip',
      order: 1,
      overline: 'TRUSTED BY 100+ COLLEGES & UNIVERSITIES',
      columns: 6,
      grayscale: true,
      logoHeight: '48px',
      gap: 'lg',
      alignment: 'center',
      logos: LOGOS.map((l, i) => ({
        id: `logo-${Date.now()}-${i}`,
        imageUrl: l.url,
        alt: l.alt,
      })),
    },
  ];

  // Tighten the section padding a bit — logo strip has its own vertical space
  section.paddingTop = '40px';
  section.paddingBottom = '40px';

  const newContent = JSON.stringify({ ...parsed, blocks });
  await db.update(posts).set({ content: newContent, updatedAt: new Date() }).where(eq(posts.id, 302));
  console.log(`✓ Replaced section ${sectionIdx} contents with logo-strip block`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
