// One-off: prefix already-imported portfolio posts' slugs with "portfolio/".

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf-8'));

  const portfolioPosts = await db.select().from(posts).where(and(eq(posts.websiteId, ids.websiteId), eq(posts.postType, 'portfolio')));

  for (const p of portfolioPosts) {
    if (!p.slug.startsWith('portfolio/')) {
      const newSlug = `portfolio/${p.slug}`;
      await db.update(posts).set({ slug: newSlug }).where(eq(posts.id, p.id));
      console.log(`${p.slug} → ${newSlug}`);
    }
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
