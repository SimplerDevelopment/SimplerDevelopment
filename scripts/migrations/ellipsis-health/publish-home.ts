import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  await db.update(posts).set({ published: true }).where(eq(posts.id, 284));
  console.log('Home page published');
  process.exit(0);
}
run();
