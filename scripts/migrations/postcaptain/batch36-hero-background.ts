/**
 * Batch 36 — hero background overlay (live-extracted webp).
 *
 * Vision-review repeatedly flags hero at 88-92, with the priority fix being
 * "deepen the hero background blue gradient to match the richer saturation
 * of the live site." The actual underlying difference is that live layers a
 * subtle wavy "topo-line" webp ON TOP of its blue gradient, giving the hero
 * an extra layer of texture and apparent depth.
 *
 * Live's home-bg.webp is already saved locally at
 *   public/sites/postcaptain/img/hero-bg.webp  (252 KB, near-white wavy)
 * after the batch in commit b7b4b095. The hero-1 block currently hot-links
 * to the live CDN URL — switch it to the local path and configure the
 * background composition so:
 *
 *   - The gradient renders BELOW.
 *   - The wave webp renders ON TOP at low opacity / overlay blend, so its
 *     near-white tonality lifts the gradient without washing it out.
 *
 * Also tighten the gradient stops so the dark navy at the top is more
 * saturated (#003E69 instead of #004F82, +0.2 saturation feel).
 *
 * Idempotent: re-applying overwrites the same fields. Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch36-hero-background.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BATCH36_CSS = `/* batch36 — hero background overlay (live-extracted webp) */

/* The hero-1 BlockStyleWrapper composes background-image as
   "gradient, url(image)" so the gradient draws on TOP, fully covering the
   webp underneath. Override that order at the post-css level by using a
   pseudo-element overlay that sits ABOVE the gradient and renders only the
   webp. Reduced opacity + lighten blend mode lifts the gradient subtly. */
.block-content [data-block-id="hero-1"] {
  position: relative !important;
}
.block-content [data-block-id="hero-1"]::after {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  background-image: url("/sites/postcaptain/img/hero-bg.webp") !important;
  background-size: cover !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;
  /* Live's overlay is near-white with subtle waves. Using 'screen' at low
     opacity lifts the highlights (the wavy line areas) without flattening
     the gradient — overlay/multiply both ate the gradient. */
  opacity: 0.32 !important;
  mix-blend-mode: screen !important;
  pointer-events: none !important;
  z-index: 1 !important;
}
/* Make sure the inner content layer (z-index: 10 inside the section)
   still sits above our overlay. */
.block-content [data-block-id="hero-1"] > section > div {
  position: relative !important;
}
.block-content [data-block-id="hero-1"] > section > div.relative.z-10,
.block-content [data-block-id="hero-1"] > section .relative.z-10 {
  z-index: 2 !important;
}

/* /batch36 */`;

function stripBlock(css: string, startMarker: string, endMarker: string): string {
  const startIdx = css.indexOf(startMarker);
  if (startIdx < 0) return css;
  const endIdx = css.indexOf(endMarker, startIdx);
  if (endIdx < 0) return css;
  return (css.slice(0, startIdx) + css.slice(endIdx + endMarker.length)).trim();
}

interface AnyBlock {
  id?: string;
  type?: string;
  style?: Record<string, unknown>;
  blocks?: AnyBlock[];
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');

  // 1. Update hero-1.style.backgroundImage to local path + tighten gradient.
  const content = JSON.parse(post.content as string);
  const hero = content.blocks.find((b: AnyBlock) => b.id === 'hero-1');
  if (!hero) throw new Error('hero-1 block not found');
  hero.style = hero.style || {};
  // Switch to local. (Was hot-linking to live's CDN.)
  hero.style.backgroundImage = '/sites/postcaptain/img/hero-bg.webp';
  // Slightly deeper saturation at the top to match live's richer feel, with
  // a soft transition to near-white at the bottom so the logo trust-band
  // sits on a light background. Live's gradient fades dark→whitish in a
  // gradual band roughly 50-80% down the hero.
  hero.style.backgroundGradient =
    'linear-gradient(180deg, #003E69 0%, #155082 25%, #3A7AA6 50%, #B8D2E5 70%, #F4F8FB 85%)';
  hero.style.backgroundSize = 'cover';
  hero.style.backgroundPosition = 'center center';
  hero.style.backgroundRepeat = 'no-repeat';
  // Drop wrapper-level blend mode — the actual texture overlay is handled
  // by the customCss ::after pseudo-element with mix-blend-mode: screen,
  // which reads cleaner than wrapper-level multi-layer blending.
  delete hero.style.backgroundBlendMode;
  console.log('hero-1: backgroundImage + gradient + blendMode updated');

  // 2. Apply customCss with batch36 marker.
  let css = (post.customCss as string | null) ?? '';
  css = stripBlock(css, '/* batch36 — hero background overlay (live-extracted webp) */', '/* /batch36 */');
  css = (css ? css + '\n\n' : '') + BATCH36_CSS;

  await db
    .update(posts)
    .set({
      content: JSON.stringify(content),
      customCss: css,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, 302));

  console.log(`post 302 batch36 applied. customCss length: ${css.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
