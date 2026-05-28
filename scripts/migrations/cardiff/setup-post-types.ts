/**
 * Cardiff migration — Set up site-scoped post types
 *
 * Cardiff has 4 content kinds: page, blog, news, report. We use the default
 * 'page' for marketing pages and 'blog' for articles, then create custom
 * post types 'news' and 'report' scoped to the Cardiff website.
 *
 * Run:  npx tsx scripts/migrations/cardiff/setup-post-types.ts
 */

import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { postTypes } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const state = JSON.parse(readFileSync(join(process.cwd(), 'scripts/migrations/cardiff/.state/ids.json'), 'utf-8'));

  const types = [
    { name: 'News', slug: 'news', description: 'Press mentions, media coverage, and official Cardiff news.', icon: 'newspaper' },
    { name: 'Report', slug: 'report', description: 'Cardiff market trend reports, lending performance, research.', icon: 'analytics' },
  ];

  for (const t of types) {
    const existing = await db.select().from(postTypes)
      .where(and(eq(postTypes.slug, t.slug), eq(postTypes.websiteId, state.websiteId))).limit(1);
    if (existing.length) {
      console.log(`ℹ️  postType ${t.slug} already present (id=${existing[0].id})`);
    } else {
      const [pt] = await db.insert(postTypes).values({
        name: t.name,
        slug: t.slug,
        description: t.description,
        icon: t.icon,
        active: true,
        websiteId: state.websiteId,
      }).returning();
      console.log(`✅ created postType ${t.slug} id=${pt.id}`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
