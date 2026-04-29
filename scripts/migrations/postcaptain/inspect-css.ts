/**
 * Read post 302's customCss and dump its content for inspection.
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/inspect-css.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  console.log('--- customCss length:', (post.customCss ?? '').length);
  console.log(post.customCss ?? '(empty)');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
