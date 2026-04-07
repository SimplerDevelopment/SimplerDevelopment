import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function publishHome() {
  const { db } = await import('../../../lib/db');
  const { posts, clientWebsites } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const websiteId = ids.websiteId;

  if (!websiteId) {
    console.error('No websiteId found in ids.json. Run setup-client first.');
    process.exit(1);
  }

  const action = process.argv[2] || 'enable';

  if (action === 'enable') {
    await db.update(clientWebsites).set({ publicAccess: true }).where(eq(clientWebsites.id, websiteId));
    await db.update(posts).set({ published: true }).where(and(eq(posts.websiteId, websiteId), eq(posts.slug, 'home')));
    console.log('Public access ENABLED, home page PUBLISHED');
    console.log('Preview at: http://localhost:3000/sites/crosscap-advisors.simplerdevelopment.com');
  } else if (action === 'disable') {
    await db.update(clientWebsites).set({ publicAccess: false }).where(eq(clientWebsites.id, websiteId));
    await db.update(posts).set({ published: false }).where(and(eq(posts.websiteId, websiteId), eq(posts.slug, 'home')));
    console.log('Public access DISABLED, home page UNPUBLISHED');
  }

  process.exit(0);
}

publishHome().catch(err => { console.error(err); process.exit(1); });
