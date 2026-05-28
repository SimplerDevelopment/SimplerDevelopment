/**
 * Iter — Fix the 4th stat in the "Built for businesses that move fast"
 * panel. Currently the value is "6 months" and the label is truncated —
 * cardiff.co's original is "84%" with the full sentence as label.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

async function main() {
  const [row] = await db.select().from(posts).where(eq(posts.id, 793)).limit(1);
  if (!row) throw new Error('Post 793 not found');
  const parsed = JSON.parse(row.content);
  const stats = parsed.blocks[5].blocks[2];
  if (stats?.id !== 'stats-grid') throw new Error(`Expected stats-grid, got ${stats?.id}`);
  const kpi4 = stats.stats.find((i: { id: string; value: string; label: string }) => i.id === 'kpi-4');
  if (!kpi4) throw new Error('kpi-4 not found');
  kpi4.value = '84%';
  kpi4.label = 'Most customers receive additional funds within 6 months';
  await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, 793));
  console.log('Updated kpi-4: 84% / Most customers receive additional funds within 6 months');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
