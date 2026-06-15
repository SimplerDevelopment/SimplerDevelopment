import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Crosscap — hero polish.
 *
 * The hero-slideshow sat a left-aligned headline over a busy background video of
 * people; the flat overlay (rgba(10,22,40,0.75)) let facial features show through
 * the headline and the secondary description line was very low-contrast.
 *
 * Fix: replace the flat scrim with a layered gradient (strong on the left where the
 * copy lives + a bottom darken for the stat bar, fading to a lighter accent on the
 * right) and lift the description contrast. Patches the LIVE block in place so it is
 * robust to prod/staging divergence.
 *
 * DRY:    DATABASE_URL=<metro> bun scripts/migrations/crosscap/polish-hero.ts
 * APPLY:  DATABASE_URL=<metro> APPLY=1 bun scripts/migrations/crosscap/polish-hero.ts
 */
const SCRIM =
  'linear-gradient(102deg, rgba(8,18,34,0.94) 0%, rgba(8,18,34,0.86) 34%, rgba(8,18,34,0.62) 72%, rgba(8,18,34,0.42) 100%), ' +
  'linear-gradient(to top, rgba(8,18,34,0.70) 0%, rgba(8,18,34,0.10) 26%, rgba(8,18,34,0) 50%)';

async function run() {
  const APPLY = process.env.APPLY === '1';
  const host = (process.env.DATABASE_URL || '').replace(/^.*@([^/]+)\/.*$/, '$1') || '(unknown)';
  console.log(`Target DB host: ${host}`);
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const WEBSITE_ID = 143;
  const [home] = await db.select().from(posts)
    .where(and(eq(posts.slug, 'home'), eq(posts.websiteId, WEBSITE_ID))).limit(1);
  if (!home) { console.error('No home post.'); process.exit(1); }

  type Slide = { overlayColor?: string; overlayOpacity?: number; description?: string };
  type DescStyle = { color?: string; customCSS?: string };
  type HeroBlock = {
    type?: string;
    slides?: Slide[];
    backgroundVideoOpacity?: number;
    elementStyles?: { description?: DescStyle };
  };
  const parsed = typeof home.content === 'string' ? JSON.parse(home.content) : home.content;
  const blocks = parsed.blocks as Array<{ type?: string }>;
  const hero = blocks.find(b => b?.type === 'hero-slideshow') as HeroBlock | undefined;
  if (!hero) { console.error('No hero-slideshow block.'); process.exit(1); }

  const slide = hero.slides?.[0];
  console.log('BEFORE:');
  console.log('  slide.overlayColor   =', JSON.stringify(slide?.overlayColor));
  console.log('  slide.overlayOpacity =', JSON.stringify(slide?.overlayOpacity));
  console.log('  desc color           =', JSON.stringify(hero.elementStyles?.description?.color));
  console.log('  backgroundVideoOpacity =', JSON.stringify(hero.backgroundVideoOpacity));

  // --- patch ---
  slide.overlayColor = SCRIM;
  slide.overlayOpacity = 1;
  // calmer video so the imagery reads as a textured accent, not a competing subject
  if (typeof hero.backgroundVideoOpacity === 'number') hero.backgroundVideoOpacity = 0.5;
  // lift description contrast + a hairline shadow for legibility over the lighter right edge
  hero.elementStyles = hero.elementStyles || {};
  hero.elementStyles.description = {
    ...(hero.elementStyles.description || {}),
    color: 'rgba(255,255,255,0.92)',
    customCSS: 'text-shadow: 0 1px 12px rgba(0,0,0,0.35)',
  };
  // bump the dimmer inline secondary line inside the slide description (0.6 -> 0.82)
  if (typeof slide.description === 'string') {
    slide.description = slide.description.replace(/rgba\(255,255,255,0\.6\)/g, 'rgba(255,255,255,0.82)');
  }

  console.log('\nAFTER:');
  console.log('  slide.overlayColor   =', JSON.stringify(slide.overlayColor));
  console.log('  desc color           =', JSON.stringify(hero.elementStyles.description.color));
  console.log('  backgroundVideoOpacity =', JSON.stringify(hero.backgroundVideoOpacity));

  if (!APPLY) { console.log('\n[DRY RUN] Re-run with APPLY=1 to persist.'); process.exit(0); }
  await db.update(posts).set({ content: JSON.stringify(parsed) }).where(eq(posts.id, home.id));
  console.log('\n✓ Hero polished.');
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
