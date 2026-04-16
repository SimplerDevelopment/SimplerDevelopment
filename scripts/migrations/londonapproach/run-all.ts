import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import * as path from 'path';

dotenv.config({ path: '.env' });

const dir = __dirname;
const run = (script: string) => {
  console.log(`\n${'='.repeat(60)}\nRunning: ${script}\n${'='.repeat(60)}`);
  execSync(`npx tsx ${path.join(dir, script)}`, { stdio: 'inherit', cwd: path.resolve(dir, '../../..') });
};

async function finalize() {
  const { db } = await import('../../../lib/db');
  const { clientWebsites, posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const fs = await import('fs');
  const ids = JSON.parse(fs.readFileSync(path.join(dir, 'ids.json'), 'utf-8'));
  await db.update(clientWebsites).set({ publicAccess: true }).where(eq(clientWebsites.id, ids.websiteId));
  await db.update(posts).set({ published: true }).where(eq(posts.websiteId, ids.websiteId));
  console.log('publicAccess=true, all posts published=true');
}

(async () => {
  run('setup-client.ts');
  run('create-booking-page.ts');
  run('import-home.ts');
  run('import-services.ts');
  run('import-why-la.ts');
  run('import-team.ts');
  run('import-testimonials.ts');
  run('import-reach-out.ts');
  run('import-navigation.ts');
  await finalize();
  console.log('\n\n=== LONDON APPROACH MIGRATION COMPLETE ===');
  console.log('Preview: http://localhost:3000/sites/london-approach.simplerdevelopment.com/home');
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
