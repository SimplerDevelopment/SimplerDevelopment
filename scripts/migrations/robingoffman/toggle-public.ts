// Toggle publicAccess on the site + publish flag on its pages for QA review.
// Usage: npx tsx scripts/migrations/robingoffman/toggle-public.ts [on|off]

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function main() {
  const mode = (process.argv[2] || 'on').toLowerCase();
  const enable = mode === 'on';

  const { db } = await import('../../../lib/db');
  const { clientWebsites, posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf-8'));

  await db.update(clientWebsites).set({ publicAccess: enable }).where(eq(clientWebsites.id, ids.websiteId));
  await db.update(posts).set({ published: enable, publishedAt: enable ? new Date() : null }).where(eq(posts.websiteId, ids.websiteId));

  console.log(`Site ${ids.websiteId}: publicAccess=${enable}, posts.published=${enable}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
