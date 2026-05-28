/**
 * Iter 5 — Tighten home page section paddings so the overall vertical rhythm
 * matches cardiff.co's denser layout. The original uses ~56-72px section
 * paddings; the port had ~96px on most sections producing 192px gaps between
 * content blocks (too much breathing room).
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const HOME_POST_ID = 793;

// Apply per-section padding overrides keyed by block id
const PADDING_MAP: Record<string, { pt?: string; pb?: string }> = {
  intro: { pt: '64px', pb: '32px' },
  process: { pt: '24px', pb: '64px' },
  'stats-band': { pt: '64px', pb: '64px' },
  'alt-lending': { pt: '64px', pb: '40px' },
  products: { pt: '24px', pb: '64px' },
  designed: { pt: '64px', pb: '64px' },
  'better-credit': { pt: '64px', pb: '64px' },
  'mid-cta': { pt: '64px', pb: '64px' },
  why: { pt: '64px', pb: '40px' },
  testimonials: { pt: '64px', pb: '64px' },
  'final-cta': { pt: '72px', pb: '72px' },
};

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, HOME_POST_ID)).limit(1);
  if (!row) throw new Error(`Post ${HOME_POST_ID} not found`);
  const parsed = JSON.parse(row.content);
  let changed = 0;
  for (const b of parsed.blocks) {
    const map = PADDING_MAP[b.id];
    if (!map) continue;
    b.style = b.style || {};
    if (map.pt) b.style.paddingTop = map.pt;
    if (map.pb) b.style.paddingBottom = map.pb;
    changed++;
  }
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, HOME_POST_ID));
  console.log(`Updated post ${HOME_POST_ID}: tightened paddings on ${changed} sections`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
