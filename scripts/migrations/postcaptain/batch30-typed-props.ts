/**
 * Batch 30 — wire the new typed block props onto post 302.
 *
 * Two universal extensions just landed:
 *   1. SiteFooterBlock now accepts `brandSize: 'sm' | 'md' | 'lg'`.
 *   2. MetricCardsBlock now accepts `logoColumnWidth` and `labelMaxWidth`
 *      (CSS-unit strings).
 *
 * This batch sets the postcaptain-specific values:
 *   - footer-1.brandSize = 'lg'  → bumps the brand-column logo to h-12
 *     and wordmark base size to 12px without needing CSS overrides.
 *   - cs-metrics.logoColumnWidth = '110px'  → reserves the right side
 *     for the institution logo, so the value+label heading column has
 *     a known max width.
 *   - cs-metrics.labelMaxWidth = '260px'  → keeps "IN READMIT
 *     COMPLETIONS" and similar labels on a single line at desktop.
 *
 * Idempotent. Existing customCss (batch28 wordmark second-line tuning,
 * batch29 stats heading-fit) stays — those rules sit on top of the
 * renderer defaults and are still load-bearing for fine-tuned typography.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch30-typed-props.ts dotenv_config_path=.env.local
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

interface PostContent {
  blocks: Block[];
  version?: string;
}

function findBlockById(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (Array.isArray(b.blocks)) {
      const r = findBlockById(b.blocks, id);
      if (r) return r;
    }
    if (Array.isArray(b.columns)) {
      for (const col of b.columns) {
        if (Array.isArray(col?.blocks)) {
          const r = findBlockById(col.blocks, id);
          if (r) return r;
        }
      }
    }
    if (Array.isArray(b.panels)) {
      for (const p of b.panels) {
        if (Array.isArray(p?.blocks)) {
          const r = findBlockById(p.blocks, id);
          if (r) return r;
        }
      }
    }
  }
  return null;
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;
  const log: string[] = [];

  // 1) footer-1.brandSize = 'lg'
  const footer = findBlockById(parsed.blocks, 'footer-1');
  if (!footer) {
    log.push('footer-1 NOT FOUND — skipped brandSize');
  } else {
    if (footer.brandSize !== 'lg') {
      footer.brandSize = 'lg';
      log.push("footer-1.brandSize = 'lg'");
    } else {
      log.push("footer-1.brandSize already 'lg' — skipped");
    }
  }

  // 2) cs-metrics.logoColumnWidth + labelMaxWidth
  const metrics = findBlockById(parsed.blocks, 'cs-metrics');
  if (!metrics) {
    log.push('cs-metrics NOT FOUND — skipped logo/label widths');
  } else {
    if (metrics.logoColumnWidth !== '110px') {
      metrics.logoColumnWidth = '110px';
      log.push("cs-metrics.logoColumnWidth = '110px'");
    } else {
      log.push("cs-metrics.logoColumnWidth already '110px' — skipped");
    }
    if (metrics.labelMaxWidth !== '260px') {
      metrics.labelMaxWidth = '260px';
      log.push("cs-metrics.labelMaxWidth = '260px'");
    } else {
      log.push("cs-metrics.labelMaxWidth already '260px' — skipped");
    }
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch30-typed-props applied:');
  for (const line of log) console.log('  -', line);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
