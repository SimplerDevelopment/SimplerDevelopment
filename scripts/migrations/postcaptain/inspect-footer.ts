/**
 * Show post 302's footer-1 block as JSON.
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface Block {
  id?: string;
  type?: string;
  blocks?: Block[];
  columns?: Array<{ blocks?: Block[] }>;
  panels?: Array<{ blocks?: Block[] }>;
  [k: string]: unknown;
}

function find(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (Array.isArray(b.blocks)) {
      const r = find(b.blocks, id);
      if (r) return r;
    }
    if (Array.isArray(b.columns)) {
      for (const c of b.columns) if (Array.isArray(c?.blocks)) { const r = find(c.blocks, id); if (r) return r; }
    }
    if (Array.isArray(b.panels)) {
      for (const p of b.panels) if (Array.isArray(p?.blocks)) { const r = find(p.blocks, id); if (r) return r; }
    }
  }
  return null;
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content);
  const footer = find(parsed.blocks, 'footer-1');
  console.log(JSON.stringify(footer, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
