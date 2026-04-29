/**
 * Batch 18b — fix audits icon glyph rendering.
 *
 * Batch 18 prepended <span class="material-icons pc-audit-icon">gps_fixed</span>
 * (etc.) to each audit badge text block. Vision-review on the next pass
 * showed the icons rendering as the literal text "gps_fixed", "storage",
 * "workspaces" instead of the Material Icons glyphs.
 *
 * Root cause: the parent text block's inline style sets
 * `font-family: Poppins`, which overrides the .material-icons class
 * font-family on its child span. Ligature substitution needs the actual
 * Material Icons font family.
 *
 * Fix: extend the scoped customCSS rule to force
 *   font-family: 'Material Icons' !important;
 * on .pc-audit-icon. This is idempotent — we look for an updated marker
 * and replace the prior rule body verbatim if found.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch18b-audits-icon-font.ts dotenv_config_path=.env.local
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

const RULE = `/*batch18b-audits*/
.block-content [data-block-id^="badge-"] {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 10px !important;
  border: 0 !important;
  padding: 12px 8px !important;
}
.block-content [data-block-id^="badge-"] .pc-audit-icon {
  font-family: 'Material Icons', 'Material Icons Outlined' !important;
  font-weight: normal !important;
  font-style: normal !important;
  font-size: 22px !important;
  line-height: 1 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
  display: inline-block !important;
  white-space: nowrap !important;
  word-wrap: normal !important;
  direction: ltr !important;
  -webkit-font-feature-settings: 'liga' !important;
  -webkit-font-smoothing: antialiased !important;
  font-feature-settings: 'liga' !important;
  color: #FFFFFF !important;
  opacity: 0.9 !important;
}`;

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;
  const log: string[] = [];

  const auditsSection = findBlockById(parsed.blocks, 'audits-section') as
    | (Block & { customCSS?: string })
    | null;
  if (!auditsSection) {
    log.push('audits-section NOT FOUND — skipped');
  } else {
    let css = auditsSection.customCSS ?? '';

    // Strip any prior batch18 / batch18b rules.
    const stripMarker = (src: string, marker: string): string => {
      const idx = src.indexOf(marker);
      if (idx < 0) return src;
      // Find the next batchNN marker (or EOF) and cut there.
      const nextMarker = src.slice(idx + 1).search(/\/\*batch\d+/);
      const endIdx = nextMarker < 0 ? src.length : idx + 1 + nextMarker;
      return (src.slice(0, idx) + src.slice(endIdx)).trim();
    };
    css = stripMarker(css, '/*batch18-audits*/');
    css = stripMarker(css, '/*batch18b-audits*/');
    css = (css ? css + '\n' : '') + RULE;
    auditsSection.customCSS = css;
    log.push('audits-section customCSS replaced with batch18b rule');
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch18b-audits-icon-font applied:');
  for (const line of log) console.log(' -', line);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
