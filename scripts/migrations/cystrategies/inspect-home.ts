import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const WEBSITE_ID = 142;

async function inspect() {
  const dbUrl = process.env.DATABASE_URL || '';
  const masked = dbUrl.replace(/:\/\/[^@]+@/, '://***@');
  console.log(`DATABASE_URL: ${masked}`);

  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      postType: posts.postType,
      published: posts.published,
      contentLen: posts.content,
      updatedAt: posts.updatedAt,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home')));

  if (rows.length === 0) {
    console.log(`No home row for website_id=${WEBSITE_ID}`);
    process.exit(0);
  }
  for (const r of rows) {
    const len = (r.contentLen as unknown as string)?.length ?? 0;
    let topBlocks = '?';
    try {
      const parsed = JSON.parse(r.contentLen as unknown as string);
      topBlocks = `${parsed.blocks?.length ?? 0} blocks`;
    } catch {
      topBlocks = `<unparseable, ${len}b>`;
    }
    console.log(
      `id=${r.id} title=${r.title} slug=${r.slug} type=${r.postType} published=${r.published} content=${len}b ${topBlocks} updated=${r.updatedAt?.toISOString?.()} created=${r.createdAt?.toISOString?.()}`,
    );
  }
  process.exit(0);
}

inspect().catch((e) => {
  console.error(e);
  process.exit(1);
});
