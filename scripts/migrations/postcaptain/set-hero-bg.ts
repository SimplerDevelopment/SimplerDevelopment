import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const HERO_BG_URL = 'https://postcaptain.com/wp-content/uploads/2025/05/home-bg.png';

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
  const blocks = (parsed.blocks || []) as Array<Record<string, unknown>>;

  const heroIdx = blocks.findIndex((b) => b.type === 'hero');
  if (heroIdx === -1) {
    console.log('No hero block found on post 302');
    process.exit(1);
  }

  const hero = blocks[heroIdx] as Record<string, unknown>;
  console.log('Before:', {
    legacyBackgroundImage: hero.backgroundImage,
    styleBackgroundImage: (hero.style as Record<string, unknown> | undefined)?.backgroundImage,
  });

  // Prefer the new style.backgroundImage (which our refactored render path respects),
  // while also setting legacy backgroundImage for backward compatibility with any
  // other code paths still reading the old field.
  hero.backgroundImage = HERO_BG_URL;
  const existingStyle = (typeof hero.style === 'object' && hero.style !== null ? hero.style : {}) as Record<string, unknown>;
  hero.style = {
    ...existingStyle,
    backgroundImage: HERO_BG_URL,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  console.log('After:', {
    legacyBackgroundImage: hero.backgroundImage,
    styleBackgroundImage: (hero.style as Record<string, unknown>).backgroundImage,
  });

  const newContent = JSON.stringify({ ...parsed, blocks });
  await db
    .update(posts)
    .set({ content: newContent, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('\n✓ Set hero background image on post 302');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
