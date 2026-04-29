/**
 * Batch 19 — stats / case-studies section tweaks.
 *
 * Closes punch-list items:
 *
 *   st1  Heading wraps differently from live. Live breaks after "INTO A";
 *        local breaks after "STRATEGIC". The text is identical; only the
 *        max-width controls the break point. Tighten cs-heading maxWidth
 *        so the wrap matches live.
 *
 *   st2  (already done in batch16) cs-heading textAlign:center —
 *        no-op assertion here.
 *
 *   st3  "Case Study" link arrow already rendered by the renderer
 *        (MetricCardsBlockRender renders <Icon name="arrow_forward" />
 *        next to linkText when metric.link is set). No JSON change
 *        required. Logged as a no-op assertion. The render is also
 *        wrapped in <a>, satisfying st5's "horizontal-separator + arrow
 *        link per metric card" requirement — that is already universal,
 *        already shipped, and post 302 already has metric.link='#'
 *        and metric.linkText='Case Study' on every metric.
 *
 *   st4  "$965K+ Raised" wraps to two lines because the metric value is
 *        rendered at clamp(2.5rem, 4vw, 3.5rem) inline with the
 *        pc-metric-suffix span (which has no styles of its own). Live
 *        renders the suffix smaller and as a separate visual unit. Add
 *        a scoped customCSS on the casestudies-section to make
 *        pc-metric-suffix smaller and force the value+suffix onto a
 *        single line.
 *
 *   st5  Per-metric link schema — the renderer already supports
 *        `link` + `linkText` per metric and renders an arrow_forward
 *        Icon next to it. No schema change required.
 *
 * Idempotent — every edit is a deterministic property set.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch19-stats-tweaks.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Block = Record<string, unknown> & {
  id?: string;
  type?: string;
  blocks?: Block[];
  columns?: Array<Record<string, unknown> & { blocks?: Block[] }>;
};

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
      for (const col of b.columns ?? []) {
        if (Array.isArray(col?.blocks)) {
          const r = findBlockById(col.blocks as Block[], id);
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

  // st1 — tighten cs-heading maxWidth so wrap matches live.
  // Live breaks after "INTO A" → "Turning Slate into a / Strategic Growth Engine".
  // Local at maxWidth:900px breaks after "STRATEGIC". Reduce to 720px.
  const csHeading = findBlockById(parsed.blocks, 'cs-heading') as
    | (Block & { style?: Record<string, unknown> })
    | null;
  if (csHeading) {
    const s = (csHeading.style ??= {}) as Record<string, unknown>;
    if (s.maxWidth !== '720px') {
      s.maxWidth = '720px';
      log.push('st1: cs-heading maxWidth narrowed to 720px');
    } else {
      log.push('st1: cs-heading maxWidth already 720px — skipped');
    }
    if (s.textAlign !== 'center') {
      s.textAlign = 'center';
      log.push('st2: cs-heading textAlign forced to center');
    } else {
      log.push('st2: cs-heading already centered — no-op');
    }
  } else {
    log.push('st1/st2: cs-heading NOT FOUND — skipped');
  }

  // st4 — add scoped customCSS on the casestudies-section to size down
  // the pc-metric-suffix and prevent value+suffix from wrapping.
  const csSection = findBlockById(parsed.blocks, 'casestudies-section') as
    | (Block & { customCSS?: string })
    | null;
  if (csSection) {
    const marker = '/*batch19-stats*/';
    const rule = `${marker} .block-content [data-block-id="cs-metrics"] .pc-metric-suffix { font-size: 0.55em; font-weight: 600; letter-spacing: 0; margin-left: 0.25em; white-space: nowrap; }`;
    const before = csSection.customCSS ?? '';
    if (!before.includes(marker)) {
      csSection.customCSS = (before ? before + '\n' : '') + rule;
      log.push('st4: casestudies-section pc-metric-suffix CSS appended');
    } else {
      log.push('st4: casestudies-section already has rule — skipped');
    }
  } else {
    log.push('st4: casestudies-section NOT FOUND — skipped');
  }

  // st3 — assert metric.link + linkText are set on every metric so the
  // arrow link renders. (Renderer already adds arrow_forward icon.)
  const csMetrics = findBlockById(parsed.blocks, 'cs-metrics') as
    | (Block & { metrics?: Array<Record<string, unknown> & { id?: string; link?: string; linkText?: string }> })
    | null;
  if (csMetrics?.metrics) {
    for (const m of csMetrics.metrics) {
      if (!m.link) {
        m.link = '#';
        log.push(`st3: ${m.id} link defaulted to "#"`);
      }
      if (!m.linkText) {
        m.linkText = 'Case Study';
        log.push(`st3: ${m.id} linkText defaulted to "Case Study"`);
      }
    }
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch19-stats-tweaks applied:');
  for (const line of log) console.log(' -', line);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
