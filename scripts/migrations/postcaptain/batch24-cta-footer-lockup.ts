/**
 * Batch 24 — cta-footer brand lockup polish.
 *
 * Vision-review feedback:
 *   - Footer logo is small and the wordmark "POST CAPTAIN CONSULTING" is
 *     compressed below it; live shows a larger logo with the wordmark
 *     inline-right of it as a horizontal lockup.
 *
 * The renderer (SiteFooterBlockRender) already wraps logo+wordmark in a
 * `<a class="flex items-center gap-3 flex-wrap">` so they CAN sit inline —
 * but the Tailwind classes `h-10` (logo) and `text-[10px]` (wordmark) make
 * them too small relative to live. We override via post-level CSS, scoped
 * to the existing site-footer block (data-block-id="footer-1"), so the
 * change is non-destructive on other tenants.
 *
 * Universal? Yes — keyed off the data-block-id of THIS post's footer; no
 * other site is affected. If we want the larger lockup as the platform
 * default later, promote into the renderer.
 *
 * Idempotent — strips a prior batch24 block before writing.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch24-cta-footer-lockup.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH24_CSS = `/* batch24 — cta-footer lockup (logo+wordmark sizing+row alignment) */

/* Disable wrap on the brand link so the wordmark cannot drop below the logo. */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type {
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 14px !important;
}

/* Logo: bump from h-10 (40px) to ~56px to match live's lockup scale. */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type img {
  height: 56px !important;
  max-height: 56px !important;
  width: auto !important;
}

/* Wordmark: lift from 10px ALL CAPS to 13px / heavier weight. The wordmark
   span emits its lines as inline-block <span style="display:block">; we keep
   that vertical stack (POST CAPTAIN / CONSULTING) but enlarge it. */
.block-content [data-block-id="footer-1"] footer .grid > div:first-child a:first-of-type > span {
  font-size: 13px !important;
  letter-spacing: 0.08em !important;
  font-weight: 700 !important;
  line-height: 1.15 !important;
}

/* /batch24 */`;

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  let css = post.customCss ?? '';
  const startMarker = '/* batch24 — cta-footer lockup (logo+wordmark sizing+row alignment) */';
  const endMarker = '/* /batch24 */';
  const startIdx = css.indexOf(startMarker);
  if (startIdx >= 0) {
    const endIdx = css.indexOf(endMarker, startIdx);
    if (endIdx >= 0) {
      css = (css.slice(0, startIdx) + css.slice(endIdx + endMarker.length)).trim();
    }
  }
  css = (css ? css + '\n\n' : '') + BATCH24_CSS;

  await db
    .update(posts)
    .set({ customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch24-cta-footer-lockup applied. customCss length:', css.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
