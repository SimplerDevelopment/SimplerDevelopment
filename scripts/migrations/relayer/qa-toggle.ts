/**
 * Toggle Relayer site visibility for local QA.
 *   npx tsx scripts/migrations/relayer/qa-toggle.ts on    # publicAccess + publish all posts
 *   npx tsx scripts/migrations/relayer/qa-toggle.ts off   # revert to private + drafts
 */
import { T as _T } from './_shared'; // ensures env/prod-guard runs
void _T;
import { WEBSITE_ID } from './_shared';

async function run() {
  const mode = process.argv[2] === 'on' ? 'on' : 'off';
  const { db } = await import('../../../lib/db');
  const { eq } = await import('drizzle-orm');
  const { clientWebsites, posts } = await import('../../../lib/db/schema');
  const on = mode === 'on';
  await db.update(clientWebsites).set({ publicAccess: on }).where(eq(clientWebsites.id, WEBSITE_ID));
  await db.update(posts).set({ published: on }).where(eq(posts.websiteId, WEBSITE_ID));
  console.log(`[qa-toggle] websiteId=${WEBSITE_ID} publicAccess=${on}, all posts published=${on}`);
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
