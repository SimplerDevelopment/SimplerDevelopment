/**
 * Strip the legacy `footer-dark` block from post 302's customCss — the new
 * SiteFooterBlockRender handles light-bg theming itself, so the !important
 * rules forcing white text now break a white-bg footer.
 *
 * Idempotent.
 */
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const css = post.customCss ?? '';
  // Remove the named footer-dark block delimited by `/* footer-dark — ... */ ... /* /footer-dark */`.
  const stripped = css.replace(/\/\* footer-dark[\s\S]*?\/\* \/footer-dark \*\//g, '');
  if (stripped === css) {
    console.log('no footer-dark block to remove (already clean).');
  } else {
    console.log(`removed ${css.length - stripped.length} chars of footer-dark CSS.`);
  }
  await db
    .update(posts)
    .set({ customCss: stripped, updatedAt: new Date() })
    .where(eq(posts.id, 302));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
