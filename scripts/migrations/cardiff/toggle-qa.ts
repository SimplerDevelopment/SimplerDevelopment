/**
 * Cardiff migration — Visual QA toggle
 *
 * Run with `on` to enable publicAccess + publish the home page for QA.
 * Run with `off` to disable publicAccess + revert the home page to draft.
 *
 * Usage:
 *   npx tsx scripts/migrations/cardiff/toggle-qa.ts on
 *   npx tsx scripts/migrations/cardiff/toggle-qa.ts off
 */

import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const mode = process.argv[2];
  if (mode !== 'on' && mode !== 'off') {
    console.error('Usage: toggle-qa.ts on|off');
    process.exit(1);
  }
  const enable = mode === 'on';

  const { db } = await import('../../../lib/db');
  const { clientWebsites, posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const state = JSON.parse(readFileSync(join(process.cwd(), 'scripts/migrations/cardiff/.state/ids.json'), 'utf-8'));

  await db.update(clientWebsites)
    .set({ publicAccess: enable })
    .where(eq(clientWebsites.id, state.websiteId));

  // Publish/unpublish ALL posts on this site so the migration can be QA'd end-to-end
  const result = await db.update(posts)
    .set({ published: enable, ...(enable ? { publishedAt: new Date() } : {}) })
    .where(eq(posts.websiteId, state.websiteId))
    .returning({ id: posts.id });

  console.log(`✅ publicAccess=${enable}, ${result.length} posts.published=${enable}`);
  console.log(`Subdomain: ${state.subdomain}`);
  console.log(`QA URL: http://localhost:3000/sites/${state.subdomain}.simplerdevelopment.com/home`);
  console.log(`Alt URL: http://localhost:3000/sites/${state.subdomain}.simplerdevelopment.com/`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
