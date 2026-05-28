import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [p] = await db.select().from(posts).where(eq(posts.id, 793));
  const content = JSON.parse(p.content);
  const tBlock = content.blocks.find((b: any) => b.id === 'testimonials');
  const hr = tBlock.blocks.find((b: any) => b.id === 't-grid');
  console.log('fields:', JSON.stringify(hr.fields, null, 2).slice(0, 1200));
  console.log('---values---');
  console.log(JSON.stringify(hr.values, null, 2).slice(0, 400));
  console.log('---html (first 600 chars)---');
  console.log(hr.html.slice(0, 600));
  console.log('---html (last 600 chars)---');
  console.log(hr.html.slice(-600));
  console.log('---length---', hr.html.length);
  console.log('---has data-repeat---', hr.html.includes('data-repeat="testimonials"'));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
