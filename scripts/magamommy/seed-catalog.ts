/**
 * Seed the MagaMommy catalog with 10 hand-curated products spanning the
 * three core garment types: adult tees ($29), adult hoodies ($48), baby
 * onesies ($24). Each ships through the existing autonomous designer +
 * publisher (so the artwork is GPT-image-1 + sharp-composited, persisted
 * to S3, and the product is canvas-designer-schema-compatible).
 *
 * Each product is given a distinct `weekOf` date (one per product) — the
 * magamommy_drops table has UNIQUE(websiteId, weekOf) and the orchestrator
 * resumes per drop row. We deliberately spread them across future Mondays;
 * these dates are storefront-invisible now that the home page no longer
 * markets a weekly cadence — they're just internal anchors.
 *
 * Idempotent-ish: refuses to clobber an existing drop on a target weekOf.
 * To re-seed, delete the existing drops first.
 *
 *   bun scripts/magamommy/seed-catalog.ts
 *   bun scripts/magamommy/seed-catalog.ts --dry-run        # show plan without writing
 *   bun scripts/magamommy/seed-catalog.ts --only=hoodies   # subset
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

type Garment = 'tee' | 'hoodie' | 'onesie';

interface ProductSpec {
  slogan: string;
  tagline: string;
  visualPrompt: string;
  style: 'bold' | 'satire' | 'classic';
  placement: 'front' | 'back';
  garment: Garment;
}

const PRICES: Record<Garment, number> = {
  tee: 2900,
  hoodie: 4800,
  onesie: 2400,
};

const WEIGHTS: Record<Garment, string> = {
  tee: '200',
  hoodie: '450',
  onesie: '90',
};

const HOODIE_SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;
const ONESIE_SIZES = ['NB', '3M', '6M', '12M', '18M', '24M'] as const;

const CATALOG: ProductSpec[] = [
  // ── TEES (4) ──────────────────────────────────────────────────────────
  {
    slogan: 'Faith. Family. Freedom.',
    tagline: 'Three things a mama defends every day.',
    visualPrompt:
      'Vintage Americana folk-art heart-shaped shield with stars-and-stripes pattern inside, ' +
      'centered on the chest. Bold thick outlines, flat fill colors, no gradients, no fine detail. ' +
      'Print-ready style on a white shirt.',
    style: 'classic',
    placement: 'front',
    garment: 'tee',
  },
  {
    slogan: 'Make Dinner Great Again.',
    tagline: 'For the mamas who got dinner covered while America did the rest.',
    visualPrompt:
      'Cartoon vintage-style apron and spatula crossed in front of a red-white-and-blue banner ' +
      'ribbon that reads "MAGA". Stars surround them. Folk-art style with bold thick outlines and flat colors.',
    style: 'satire',
    placement: 'front',
    garment: 'tee',
  },
  {
    slogan: 'Class Mom. Voting Mom.',
    tagline: 'PTA on Tuesday, polls on Tuesday-next.',
    visualPrompt:
      'Bold block typography only, no other imagery. The slogan dominates the garment in a slab-serif ' +
      'all-caps face. Small five-pointed stars between the periods. Patriot red, white, and navy color palette.',
    style: 'bold',
    placement: 'front',
    garment: 'tee',
  },
  {
    slogan: 'Coffee. Faith. Carpool.',
    tagline: 'The triple shot that runs the mom side of America.',
    visualPrompt:
      'Three small icons in a row centered on the chest: a coffee mug, a simple cross, and a minivan ' +
      'silhouette. Above them a small folk-art banner ribbon reading "AMERICAN MAMA". Flat fills, no gradients.',
    style: 'classic',
    placement: 'front',
    garment: 'tee',
  },

  // ── HOODIES (3) ───────────────────────────────────────────────────────
  {
    slogan: 'Trust Mama. Trust America.',
    tagline: 'Heavyweight hoodie for the mama who knows.',
    visualPrompt:
      'Two crossed American flags behind a folk-art bald eagle shield. Banner ribbon underneath ' +
      'reading "TRUST MAMA". Bold thick outlines, no fine detail, print-ready Americana style.',
    style: 'classic',
    placement: 'front',
    garment: 'hoodie',
  },
  {
    slogan: 'Sundays Are For The Lord.',
    tagline: 'Faith first, fall jacket second.',
    visualPrompt:
      'Vintage Americana church silhouette with a cross on the steeple. Stars arranged around the ' +
      'church. A folk-art banner ribbon underneath reading "AMEN". Bold thick outlines, flat fills.',
    style: 'classic',
    placement: 'front',
    garment: 'hoodie',
  },
  {
    slogan: 'Carpool Patriot.',
    tagline: 'School drop-off in style.',
    visualPrompt:
      'Cartoon minivan silhouette driving with a small American flag flying out the driver-side window. ' +
      'Stars surround the van. Folk-art style with bold thick outlines and flat colors.',
    style: 'satire',
    placement: 'front',
    garment: 'hoodie',
  },

  // ── ONESIES (3) ───────────────────────────────────────────────────────
  {
    slogan: 'Future Voter.',
    tagline: 'Registering in 2044.',
    visualPrompt:
      'A small American flag centered on the onesie with a folk-art banner ribbon arched above it ' +
      'reading "FUTURE VOTER". Border of small five-pointed stars. Cute folk-art baby-friendly style.',
    style: 'classic',
    placement: 'front',
    garment: 'onesie',
  },
  {
    slogan: 'Born in the U.S.A.',
    tagline: 'The next generation of patriots.',
    visualPrompt:
      'A cartoon stork carrying a small bundle wrapped in an American flag print. Stars float around the ' +
      'stork. Folk-art baby-friendly style with bold thick outlines and flat colors.',
    style: 'classic',
    placement: 'front',
    garment: 'onesie',
  },
  {
    slogan: 'God Bless This Mess.',
    tagline: 'For the baby who is, statistically, a mess.',
    visualPrompt:
      'A simple star burst centered on the chest with a small cross at the top and a folk-art banner ' +
      'ribbon underneath reading "GOD BLESS". Surrounding small confetti stars. Cute baby-friendly style.',
    style: 'satire',
    placement: 'front',
    garment: 'onesie',
  },
];

function parseArgs() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry-run');
  const onlyMatch = argv.find((a) => a.startsWith('--only='));
  const only = onlyMatch?.slice('--only='.length) as 'tees' | 'hoodies' | 'onesies' | undefined;
  return { dry, only };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Next Monday strictly AFTER the given date (UTC).
 */
function nextMonday(after: Date): Date {
  const d = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate()));
  // Advance at least one day so we can't return `after` itself.
  d.setUTCDate(d.getUTCDate() + 1);
  const dow = d.getUTCDay(); // 0 = Sun, 1 = Mon
  const offset = ((1 - dow) + 7) % 7; // days until next Monday
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function skuCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function main() {
  const args = parseArgs();
  console.log('[seed-catalog] starting' + (args.dry ? ' (dry-run)' : '') + (args.only ? ` (only=${args.only})` : ''));

  const { db } = await import('../../lib/db');
  const {
    clientWebsites,
    products,
    productOptions,
    productOptionValues,
    productVariants,
    magamommyBriefs,
    magamommyConcepts,
    magamommyDrops,
  } = await import('../../lib/db/schema');
  const { and, eq, desc, asc, max } = await import('drizzle-orm');
  const { runWeeklyDrop } = await import('../../lib/magamommy/orchestrator');

  // Resolve Magamommy + template.
  let [site] = await db
    .select({ id: clientWebsites.id, clientId: clientWebsites.clientId })
    .from(clientWebsites)
    .where(eq(clientWebsites.domain, 'magamommy.com'))
    .limit(1);
  if (!site) {
    [site] = await db
      .select({ id: clientWebsites.id, clientId: clientWebsites.clientId })
      .from(clientWebsites)
      .where(eq(clientWebsites.subdomain, 'magamommy'))
      .limit(1);
  }
  if (!site) throw new Error('Magamommy site not found.');

  const [template] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.websiteId, site.id), eq(products.slug, 'heavyweight-tee-template')))
    .limit(1);
  if (!template) throw new Error('Template product missing.');

  // Compute starting weekOf — strictly AFTER the latest existing drop's weekOf
  const [latest] = await db
    .select({ weekOf: magamommyDrops.weekOf })
    .from(magamommyDrops)
    .where(eq(magamommyDrops.websiteId, site.id))
    .orderBy(desc(magamommyDrops.weekOf))
    .limit(1);
  const startAfter = latest?.weekOf ? new Date((latest.weekOf as unknown as string) + 'T00:00:00Z') : new Date();

  const filteredCatalog = CATALOG.filter((p) => {
    if (!args.only) return true;
    if (args.only === 'tees') return p.garment === 'tee';
    if (args.only === 'hoodies') return p.garment === 'hoodie';
    if (args.only === 'onesies') return p.garment === 'onesie';
    return true;
  });

  // Plan weekOf for each.
  const weekOfPlan: Date[] = [];
  let cursor = startAfter;
  for (let i = 0; i < filteredCatalog.length; i += 1) {
    cursor = nextMonday(cursor);
    weekOfPlan.push(cursor);
  }

  console.log(`[seed-catalog] plan (${filteredCatalog.length} product${filteredCatalog.length === 1 ? '' : 's'}):`);
  for (let i = 0; i < filteredCatalog.length; i += 1) {
    const p = filteredCatalog[i];
    const w = weekOfPlan[i];
    console.log(`  ${String(i + 1).padStart(2)}. [${p.garment.padEnd(6)}] ${p.slogan.padEnd(36)} → ${ymd(w)}`);
  }
  if (args.dry) {
    console.log('\n[seed-catalog] DRY RUN — no writes.');
    process.exit(0);
  }

  for (let i = 0; i < filteredCatalog.length; i += 1) {
    const spec = filteredCatalog[i];
    const weekOf = weekOfPlan[i];
    const weekStr = ymd(weekOf);
    console.log(`\n──── (${i + 1}/${filteredCatalog.length}) [${spec.garment}] ${spec.slogan} ────`);

    // Refuse to clobber an existing drop.
    const [existing] = await db
      .select({ id: magamommyDrops.id, status: magamommyDrops.status })
      .from(magamommyDrops)
      .where(and(eq(magamommyDrops.websiteId, site.id), eq(magamommyDrops.weekOf, weekStr)))
      .limit(1);
    if (existing) {
      console.log(`  skipping — drop already exists for ${weekStr} (id=${existing.id}, status=${existing.status})`);
      continue;
    }

    // Insert brief + concept.
    const [brief] = await db
      .insert(magamommyBriefs)
      .values({
        websiteId: site.id,
        weekOf: weekStr,
        topics: [
          {
            slug: 'catalog-seed',
            headline: `Catalog seed: ${spec.slogan}`,
            context: 'Hand-curated MagaMommy catalog product.',
            sourceUrls: [],
          },
        ],
        rawModelResponse: '[seed-catalog] hand-curated',
      })
      .returning({ id: magamommyBriefs.id });

    const [concept] = await db
      .insert(magamommyConcepts)
      .values({
        websiteId: site.id,
        briefId: brief.id,
        topicSlug: 'catalog-seed',
        slogan: spec.slogan,
        tagline: spec.tagline,
        visualPrompt: spec.visualPrompt,
        palette: [
          { name: 'flag-red', hex: '#BF0A30' },
          { name: 'navy', hex: '#002868' },
          { name: 'white', hex: '#FFFFFF' },
        ],
        placement: spec.placement,
        style: spec.style,
        alternatives: [],
      })
      .returning({ id: magamommyConcepts.id });

    await db
      .insert(magamommyDrops)
      .values({
        websiteId: site.id,
        weekOf: weekStr,
        status: 'pending',
        briefId: brief.id,
        conceptId: concept.id,
      });

    // Run the orchestrator — skips research/concept stages because they're pre-set,
    // executes designer + publisher.
    const result = await runWeeklyDrop({ websiteId: site.id, weekOf });
    if (result.status !== 'live' || !result.productId) {
      console.error(`  FAILED at ${result.errorStage}: ${result.error}`);
      continue;
    }
    const productId = result.productId;
    console.log(`  → product #${productId} (${result.publicUrl}) ✓`);

    // ── Post-process by garment type ─────────────────────────────────────
    if (spec.garment === 'hoodie') {
      await transformToHoodie(productId, db, products, productVariants);
    } else if (spec.garment === 'onesie') {
      await transformToOnesie(productId, db, products, productOptions, productOptionValues, productVariants);
    }
  }

  console.log('\n[seed-catalog] all products processed.');
  console.log('Run `bun scripts/magamommy/compose-storefront.ts --force` to refresh the home page.');
  console.log('Then `bun scripts/magamommy/regenerate-lifestyle-hero.ts --product-id=<N>` per product');
  console.log('to swap the default adult-tee photo for the correct garment-type photo.');
  process.exit(0);
}

// ── Garment transformers ──────────────────────────────────────────────────

async function transformToHoodie(
  productId: number,
  db: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  products: any,
  productVariants: any,
) {
  const { eq } = await import('drizzle-orm');
  await db
    .update(products)
    .set({
      price: PRICES.hoodie,
      compareAtPrice: Math.round(PRICES.hoodie * 1.2),
      weight: WEIGHTS.hoodie,
      shortDescription: 'Heavyweight pullover hoodie. 8 oz cotton-poly fleece, ribbed cuffs, kangaroo pocket. Printed in Pennsylvania.',
      tags: ['hoodie', 'sweatshirt', 'maga-mommy-classic'],
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));
  // Bump variant prices to match the hoodie price.
  await db
    .update(productVariants)
    .set({
      price: PRICES.hoodie,
      compareAtPrice: Math.round(PRICES.hoodie * 1.2),
      weight: WEIGHTS.hoodie,
    })
    .where(eq(productVariants.productId, productId));
  console.log(`  transformed product #${productId} → hoodie (price $${(PRICES.hoodie / 100).toFixed(2)})`);
}

async function transformToOnesie(
  productId: number,
  db: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  products: any,
  productOptions: any,
  productOptionValues: any,
  productVariants: any,
) {
  const { and, eq, asc } = await import('drizzle-orm');

  // Find Size + Color options.
  const opts = await db
    .select({ id: productOptions.id, name: productOptions.name })
    .from(productOptions)
    .where(eq(productOptions.productId, productId));
  const sizeOpt = opts.find((o: any) => /^size$/i.test(o.name));
  const colorOpt = opts.find((o: any) => /^colou?r$/i.test(o.name));
  if (!sizeOpt || !colorOpt) {
    console.error(`  cannot transform #${productId} → onesie: missing options`);
    return;
  }

  // Delete existing variants + size values.
  await db.delete(productVariants).where(eq(productVariants.productId, productId));
  await db.delete(productOptionValues).where(eq(productOptionValues.optionId, sizeOpt.id));

  // Insert onesie size values.
  const newSizeRows: Array<{ value: string; id: number }> = [];
  for (let i = 0; i < ONESIE_SIZES.length; i += 1) {
    const v = ONESIE_SIZES[i];
    const [row] = await db
      .insert(productOptionValues)
      .values({ optionId: sizeOpt.id, value: v, label: `${v} (Onesie)`, order: i })
      .returning({ id: productOptionValues.id });
    newSizeRows.push({ value: v, id: row.id });
  }

  // Load colors.
  const colors = await db
    .select({ id: productOptionValues.id, value: productOptionValues.value })
    .from(productOptionValues)
    .where(eq(productOptionValues.optionId, colorOpt.id))
    .orderBy(asc(productOptionValues.order));

  // Cartesian variants.
  for (const size of newSizeRows) {
    for (const color of colors) {
      await db.insert(productVariants).values({
        productId,
        name: `${size.value} / ${color.value}`,
        sku: `MAGM-ONESIE-${skuCode(size.value)}-${skuCode(color.value)}`,
        price: PRICES.onesie,
        compareAtPrice: Math.round(PRICES.onesie * 1.2),
        quantity: 10,
        weight: WEIGHTS.onesie,
        optionValues: [
          { optionId: sizeOpt.id, valueId: size.id },
          { optionId: colorOpt.id, valueId: color.id },
        ],
        active: true,
      });
    }
  }

  // Update product fields.
  await db
    .update(products)
    .set({
      price: PRICES.onesie,
      compareAtPrice: Math.round(PRICES.onesie * 1.2),
      weight: WEIGHTS.onesie,
      shortDescription: 'Soft cotton baby onesie. Side-snap closure for easy changes. Printed in Pennsylvania.',
      tags: ['baby', 'onesie', 'maga-mommy-classic'],
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));
  console.log(`  transformed product #${productId} → onesie (price $${(PRICES.onesie / 100).toFixed(2)}, 6 sizes × ${colors.length} colors)`);
}

main().catch((err) => {
  console.error('[seed-catalog] FAILED:', err);
  process.exit(1);
});
