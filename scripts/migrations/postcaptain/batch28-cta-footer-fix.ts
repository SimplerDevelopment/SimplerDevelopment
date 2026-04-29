/**
 * Batch 28 — cta-footer regression fix from batch24.
 *
 * Batch 24 made the logo h-14 (~56px) AND forced flex-wrap:nowrap on the
 * brand link. The combined effect: at 13px / letter-spacing:0.08em the
 * wordmark span overflowed the brand column and crashed into the
 * "OUR SERVICES" links column, dropping the cta-footer score from 85 → 65.
 *
 * Fix:
 *   - Logo back to ~h-12 (48px), still bigger than the original h-10 (40px)
 *     but small enough to leave room for the wordmark in the same column.
 *   - Wordmark sized so the *first* line ("POST CAPTAIN") reads as the
 *     dominant element (~15px) and the *second* line ("CONSULTING") sits
 *     beneath it as a smaller subtext (~9.5px). Live's lockup matches
 *     this proportion.
 *   - Allow flex-wrap on the brand link so if a sub-tenant ever uses a
 *     wider wordmark we don't overflow — the wordmark stack simply drops
 *     beneath the logo. (Wordmark stays inline-right when it fits.)
 *
 * Idempotent — strips the prior batch28 marker AND the batch24 marker
 * before writing the new rule. The batch28 rule fully replaces batch24.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch28-cta-footer-fix.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH28_CSS = `/* batch28 — cta-footer lockup, regression fix */

.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type {
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 12px !important;
  max-width: 100% !important;
}

/* Logo: h-12 (~48px) — bigger than h-10 default but leaves wordmark room. */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type img {
  height: 48px !important;
  max-height: 48px !important;
  width: auto !important;
  flex-shrink: 0 !important;
}

/* Wordmark column container: shrink to content so it doesn't push past column. */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type > span {
  font-size: 15px !important;
  letter-spacing: 0.06em !important;
  font-weight: 700 !important;
  line-height: 1.1 !important;
  display: inline-flex !important;
  flex-direction: column !important;
}

/* Second line ("CONSULTING") is smaller subtext per live's lockup. */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type > span > span:nth-child(2) {
  font-size: 9.5px !important;
  letter-spacing: 0.18em !important;
  font-weight: 600 !important;
  margin-top: 1px !important;
  opacity: 0.85 !important;
}

/* /batch28 */`;

function stripBlock(css: string, startMarker: string, endMarker: string): string {
  const startIdx = css.indexOf(startMarker);
  if (startIdx < 0) return css;
  const endIdx = css.indexOf(endMarker, startIdx);
  if (endIdx < 0) return css;
  return (css.slice(0, startIdx) + css.slice(endIdx + endMarker.length)).trim();
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  let css = post.customCss ?? '';
  // Drop the broken batch24 entirely.
  css = stripBlock(
    css,
    '/* batch24 — cta-footer lockup (logo+wordmark sizing+row alignment) */',
    '/* /batch24 */',
  );
  // Drop a prior batch28 if present.
  css = stripBlock(css, '/* batch28 — cta-footer lockup, regression fix */', '/* /batch28 */');

  css = (css ? css + '\n\n' : '') + BATCH28_CSS;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch28-cta-footer-fix applied. customCss length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
