/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv';
import * as fs from 'fs'; import * as path from 'path';
dotenv.config({ path: '.env' });
async function main() {
  const on = process.argv[2] === 'on';
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname,'data','ids.json'),'utf8'));
  const { db } = await import('../../../lib/db');
  const { clientWebsites, posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  await db.update(clientWebsites).set({ publicAccess: on }).where(eq(clientWebsites.id, ids.websiteId));
  await db.update(posts).set({ published: on }).where(eq(posts.websiteId, ids.websiteId));
  console.log(`publicAccess + published set to ${on} for website ${ids.websiteId}`);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
