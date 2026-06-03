/**
 * Push ONLY the updated customCss / customJs from _home-enhance.ts onto the
 * relayer home page — without rewriting blocks or touching published state.
 * Use after editing HOME_CSS / HOME_JS when the page content is otherwise fine.
 *
 *   npx tsx scripts/migrations/relayer/_update-home-code.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { HOME_CSS, HOME_JS } from './_home-enhance';

const PROD_INDICATORS = ['tramway.proxy.rlwy.net:43167', 'metro.proxy.rlwy.net:25565'];
const DATABASE_URL = process.env.DATABASE_URL ?? '';
if (PROD_INDICATORS.some((p) => DATABASE_URL.includes(p)) && process.env.ALLOW_PROD !== '1') {
  console.error('REFUSING: DATABASE_URL points at a production host.');
  process.exit(1);
}

(async () => {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and, sql } = await import('drizzle-orm');
  const rows = await db
    .select({ id: posts.id, published: posts.published })
    .from(posts)
    .where(and(eq(posts.websiteId, 447), eq(posts.slug, 'home')))
    .limit(1);
  if (!rows.length) {
    console.error('No relayer home page found (websiteId=447, slug=home).');
    process.exit(1);
  }
  // The local dryrun DB has an enqueue_embedding_job trigger whose ON CONFLICT
  // arbiter index is missing, so any posts UPDATE aborts. A CSS/JS-only change
  // has nothing to re-embed, so skip triggers for just this statement.
  await db.execute(sql`SET session_replication_role = replica`);
  await db
    .update(posts)
    .set({ customCss: HOME_CSS, customJs: HOME_JS, updatedAt: new Date() })
    .where(eq(posts.id, rows[0].id));
  await db.execute(sql`SET session_replication_role = DEFAULT`);
  console.log(`[update-home-code] id=${rows[0].id} published=${rows[0].published} css=${HOME_CSS.length}b js=${HOME_JS.length}b`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
