/**
 * port-industry-hero-images
 *
 * Backfill hero background photos for 16 cardiff-main pages whose hero
 * blocks were left as solid blue gradients during the initial port.
 *
 * Most heroes are `type: "section"` with `style.customCSS` carrying only a
 * radial+linear blue gradient — no photo. A few are `type: "html-render"`
 * whose template doesn't reference {{photoUrl}}. For both shapes this
 * script idempotently overlays a brand-blue darken layer on top of a
 * cardiff.co CDN photo so the headline + buttons stay readable while the
 * hero finally has photography.
 *
 * URL mappings were scraped from cardiff.co's wp-content/uploads on
 * 2026-05-28. All targets were validated to return `image/jpeg` (or webp).
 *
 * Idempotent: re-running rewrites the same fields/customCSS in place.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

/** Slug → cardiff.co CDN hero photo URL. */
const MAPPINGS: Array<{ id: number; slug: string; heroId: string; imageUrl: string }> = [
  { id: 1032, slug: 'agriculture',                heroId: 'hero-agriculture',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/09/cardiff-small-business-lending.jpg' },
  { id: 800,  slug: 'business-loans',             heroId: 'hero-business-loans-min',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/08/Small-Business-Loan-with-Low-Credit-Score.jpg' },
  { id: 1033, slug: 'equipment-financing',        heroId: 'hero-equipment-financing',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/08/business-equipment-financing.jpg' },
  { id: 1031, slug: 'industries-beauty-salon',    heroId: 'hero-industries-beauty-salon',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2026/02/grow-your-beauty-salon-team-with-flexible-financing-solutions.jpg' },
  { id: 806,  slug: 'industries-construction',    heroId: 'hero-industries-construction',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2026/03/how-to-avoid-mid-project-cash-crunches-on-big-construction-jobs.jpg' },
  { id: 807,  slug: 'industries-contracting',     heroId: 'hero-industries-contracting',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/10/Invoice-Financing-for-Contractors.jpg' },
  { id: 808,  slug: 'industries-dental-practice', heroId: 'hero-industries-dental-practice',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/09/Expanding-Medical-Practice.jpg' },
  { id: 809,  slug: 'industries-excavation',      heroId: 'hero-industries-excavation',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2026/03/how-to-avoid-mid-project-cash-crunches-on-big-construction-jobs.jpg' },
  { id: 810,  slug: 'industries-hospitality',     heroId: 'hero-industries-hospitality',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/07/Smart-Financial-Planning-for-Sustainable-Seasonal-Businesses.jpg' },
  { id: 811,  slug: 'industries-landscaping',     heroId: 'hero-industries-landscaping',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/12/Landscaping-Demand-in-Growing-Markets.jpg' },
  { id: 812,  slug: 'industries-masonry',         heroId: 'hero-industries-masonry',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2026/03/how-to-avoid-mid-project-cash-crunches-on-big-construction-jobs.jpg' },
  { id: 813,  slug: 'industries-medical',         heroId: 'hero-industries-medical',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/09/Financial-Paperwork-Every-Business-Owner-Should-Understand.jpg' },
  { id: 814,  slug: 'industries-plumbing',        heroId: 'hero-industries-plumbing',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/10/Invoice-Financing-for-Contractors.jpg' },
  { id: 815,  slug: 'industries-restaurants',     heroId: 'hero-industries-restaurants',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/12/Boost-Restaurant-Profits-This-Holiday-Season.jpg' },
  { id: 816,  slug: 'industries-retail',          heroId: 'hero-industries-retail',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/08/business-cash-advance-credit-cards.jpg' },
  { id: 836,  slug: 'working-capital-loans',      heroId: 'hero-working-capital-loans',
    imageUrl: 'https://cardiff.co/wp-content/uploads/2025/09/Loans-to-Power-Small-Business-Growth.jpg' },
];

/**
 * Brand blue darken overlay on top of the cardiff CDN photo.
 *
 * IMPORTANT: BlockStyleWrapper's customCSS parser splits on `:` to find
 * prop/value and CANNOT carry `https://` URLs — it truncates the value at
 * the first `:`. So for section heroes we must NOT put the URL in
 * customCSS. Instead use the renderer's first-class fields:
 *   style.backgroundImage   — bare URL (renderer wraps it in url(...))
 *   style.backgroundGradient — gradient layered ABOVE the image
 *   style.backgroundSize / Position / Repeat
 * The existing customCSS that pointed at a solid radial blue is cleared.
 */
const SECTION_BG_GRADIENT = 'linear-gradient(rgba(28,51,112,0.72), rgba(28,51,112,0.72))';

/** html-render variant of the business-loans hero. */
const BUSINESS_LOANS_HERO_HTML = `<style>
  .cd-bl-hero {
    position: relative;
    background-image: linear-gradient(rgba(28,51,112,0.78), rgba(28,51,112,0.78)),
      radial-gradient(ellipse at 60% 0%, rgba(56,92,192,0.45) 0%, transparent 65%),
      url('{{photoUrl}}');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    padding: 80px 24px;
    text-align: center;
  }
  .cd-bl-hero__h1 {
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 2.5rem;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: -0.01em;
    line-height: 1.15;
    margin: 0 auto;
    max-width: 1080px;
    text-shadow: 0 2px 16px rgba(0,0,0,0.42);
  }
  @media (max-width: 760px) {
    .cd-bl-hero { padding: 56px 20px; }
    .cd-bl-hero__h1 { font-size: 1.75rem; }
  }
</style>
<section class="cd-bl-hero">
  <h1 class="cd-bl-hero__h1" data-field="title">{{title}}</h1>
</section>`;

interface AnyObj { [k: string]: unknown }
interface BlockLike extends AnyObj {
  id?: string;
  type?: string;
  style?: AnyObj & {
    customCSS?: string;
    backgroundImage?: string;
    backgroundGradient?: string;
    backgroundSize?: string;
    backgroundPosition?: string;
    backgroundRepeat?: string;
    color?: string;
  };
  html?: string;
  fields?: Array<AnyObj & { name?: string }>;
  values?: Record<string, unknown>;
}

function patchSectionHero(hero: BlockLike, imageUrl: string): boolean {
  const style = (hero.style ||= {});
  let changed = false;
  if (style.backgroundImage !== imageUrl) { style.backgroundImage = imageUrl; changed = true; }
  if (style.backgroundGradient !== SECTION_BG_GRADIENT) { style.backgroundGradient = SECTION_BG_GRADIENT; changed = true; }
  if (style.backgroundSize !== 'cover') { style.backgroundSize = 'cover'; changed = true; }
  if (style.backgroundPosition !== 'center') { style.backgroundPosition = 'center'; changed = true; }
  if (style.backgroundRepeat !== 'no-repeat') { style.backgroundRepeat = 'no-repeat'; changed = true; }
  // The pre-existing customCSS encoded a solid radial+linear blue with no
  // image. Now that the image is the actual background, drop it so the
  // photo isn't obscured. (Renderer's customCSS parser can't carry urls
  // anyway — see SECTION_BG_GRADIENT note.)
  if (style.customCSS) { delete style.customCSS; changed = true; }
  if (style.color === undefined) { style.color = '#ffffff'; changed = true; }
  return changed;
}

function patchHtmlRenderHero(hero: BlockLike, imageUrl: string): boolean {
  let changed = false;
  if (hero.html !== BUSINESS_LOANS_HERO_HTML) {
    hero.html = BUSINESS_LOANS_HERO_HTML;
    changed = true;
  }
  const fields = (hero.fields ||= []);
  const hasPhotoField = fields.some((f) => f && (f as AnyObj).name === 'photoUrl');
  if (!hasPhotoField) {
    fields.push({ name: 'photoUrl', label: 'Hero background photo', type: 'image', default: imageUrl });
    changed = true;
  }
  const values = (hero.values ||= {});
  if (values.photoUrl !== imageUrl) {
    values.photoUrl = imageUrl;
    changed = true;
  }
  return changed;
}

async function main() {
  const summary: Array<{ id: number; slug: string; action: string }> = [];

  for (const m of MAPPINGS) {
    const [row] = await db.select().from(posts).where(eq(posts.id, m.id)).limit(1);
    if (!row) {
      console.error(`! Post ${m.id} /${m.slug} not found`);
      summary.push({ id: m.id, slug: m.slug, action: 'NOT_FOUND' });
      continue;
    }
    if (!row.content) {
      console.error(`! Post ${m.id} /${m.slug} has no content`);
      summary.push({ id: m.id, slug: m.slug, action: 'NO_CONTENT' });
      continue;
    }

    let parsed: { blocks?: BlockLike[] };
    try {
      parsed = JSON.parse(row.content);
    } catch {
      console.error(`! Post ${m.id} /${m.slug}: bad json`);
      summary.push({ id: m.id, slug: m.slug, action: 'BAD_JSON' });
      continue;
    }

    const blocks = parsed.blocks || [];
    const heroIdx = blocks.findIndex((b) => b && b.id === m.heroId);
    if (heroIdx < 0) {
      console.error(`! Post ${m.id} /${m.slug}: hero id "${m.heroId}" not found (block[0].id="${blocks[0]?.id}")`);
      summary.push({ id: m.id, slug: m.slug, action: 'HERO_NOT_FOUND' });
      continue;
    }
    const hero = blocks[heroIdx];

    let changed = false;
    if (hero.type === 'section') {
      changed = patchSectionHero(hero, m.imageUrl);
    } else if (hero.type === 'html-render') {
      changed = patchHtmlRenderHero(hero, m.imageUrl);
    } else {
      console.error(`! Post ${m.id} /${m.slug}: unexpected hero type "${hero.type}"`);
      summary.push({ id: m.id, slug: m.slug, action: `UNSUPPORTED_TYPE_${hero.type}` });
      continue;
    }

    if (!changed) {
      console.log(`= ${m.slug.padEnd(34)} already has correct hero photo (no-op)`);
      summary.push({ id: m.id, slug: m.slug, action: 'NOOP' });
      continue;
    }

    await db
      .update(posts)
      .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
      .where(eq(posts.id, m.id));
    console.log(`+ ${m.slug.padEnd(34)} patched (${hero.type}) → ${m.imageUrl.slice(-60)}`);
    summary.push({ id: m.id, slug: m.slug, action: 'PATCHED' });
  }

  console.log('\nSummary:');
  for (const s of summary) console.log(`  ${s.action.padEnd(16)} ${s.id}  /${s.slug}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
