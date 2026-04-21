import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) {
    console.log('Post 302 NOT FOUND');
    process.exit(0);
  }
  let parsed: { blocks?: unknown[] } = {};
  try {
    parsed = typeof post.content === 'string' ? JSON.parse(post.content) : (post.content as { blocks?: unknown[] }) || {};
  } catch {
    parsed = {};
  }
  const blocks = (parsed.blocks as Array<Record<string, unknown>>) || [];
  type Block = Record<string, unknown> & { type: string; id: string; blocks?: Block[] };

  function summarize(block: Block, depth = 0) {
    const pad = '  '.repeat(depth);
    const keys = Object.keys(block).filter((k) => !['id', 'type', 'order', 'blocks', 'style', 'elementStyles', 'responsive'].includes(k));
    const summary: Record<string, string> = {};
    for (const k of keys) {
      const v = block[k];
      if (typeof v === 'string') summary[k] = v.length > 60 ? v.slice(0, 60) + '…' : v;
      else if (Array.isArray(v)) summary[k] = `[${v.length}]`;
      else if (typeof v === 'object' && v !== null) summary[k] = '{…}';
      else summary[k] = String(v);
    }
    console.log(`${pad}[${block.type}]`, Object.entries(summary).map(([k, v]) => `${k}=${v}`).join(' '));
    if (block.blocks && Array.isArray(block.blocks)) {
      for (const child of block.blocks) summarize(child as Block, depth + 1);
    }
  }

  blocks.forEach((b, i) => {
    console.log(`\n── Block ${i} ──`);
    summarize(b as Block);
  });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
