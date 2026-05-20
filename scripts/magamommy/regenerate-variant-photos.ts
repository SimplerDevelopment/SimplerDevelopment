/**
 * Generate per-color lifestyle product photos for Magamommy products.
 *
 * Today, each product has ONE lifestyle photo (white colorway). The product
 * offers White / Black / Heather Grey but customers only see one image
 * regardless of which color they pick. This tool fills in the gap:
 *
 *   - for each color value on the product,
 *   - calls gpt-image-1 with that color baked into the lifestyle prompt
 *     (designer.ts's buildLifestyleMockupPrompt now accepts garmentColor),
 *   - uploads to S3 at media/magamommy/lifestyle-variants/<conceptId>-<color>-<ts>.png,
 *   - inserts an entry in product_images keyed by `alt` = "<color>". The
 *     storefront product detail can be wired in a follow-up to swap on
 *     the customer's color selection (querying productImages WHERE alt
 *     ILIKE the chosen color).
 *
 * Idempotent: skips colors that already have a product_images row whose
 * alt matches. --force overrides.
 *
 *   bun scripts/magamommy/regenerate-variant-photos.ts                # all magamommy products
 *   bun scripts/magamommy/regenerate-variant-photos.ts --product-id=66
 *   bun scripts/magamommy/regenerate-variant-photos.ts --product-id=66 --force
 *   bun scripts/magamommy/regenerate-variant-photos.ts --colors=Black,Heather\ Grey   # subset
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

interface Args {
  productId?: number;
  colors?: string[];
  force: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(`--${k}=`.length);
  const productIdRaw = get('product-id');
  const colorsRaw = get('colors');
  return {
    productId: productIdRaw ? Number(productIdRaw) : undefined,
    colors: colorsRaw ? colorsRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    force: argv.includes('--force'),
  };
}

async function main() {
  const args = parseArgs();
  console.log(
    `[variant-photos] starting${args.productId ? ` product=${args.productId}` : ' all magamommy products'}` +
      `${args.colors ? ` colors=${args.colors.join(',')}` : ''}${args.force ? ' (force)' : ''}`,
  );

  const { db } = await import('../../lib/db');
  const {
    clientWebsites,
    products,
    productImages,
    productOptions,
    productOptionValues,
    magamommyConcepts,
  } = await import('../../lib/db/schema');
  const { and, eq, asc, sql } = await import('drizzle-orm');
  const { resolveClientApiKey } = await import('../../lib/ai/resolve-client-key');
  const { uploadToS3 } = await import('../../lib/s3/upload');
  const {
    buildLifestyleMockupPrompt,
    generateOpenAIImage,
  } = await import('../../lib/magamommy/agents/designer');

  // Resolve Magamommy site.
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

  // Pick target products: one specific id, OR all active store-mode magamommy products.
  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      tags: products.tags,
      metadata: products.metadata,
    })
    .from(products)
    .where(args.productId
      ? and(eq(products.websiteId, site.id), eq(products.id, args.productId))
      : and(eq(products.websiteId, site.id), eq(products.status, 'active'))
    );
  const targets = productRows.filter((p) => {
    if (args.productId) return true;
    const md = (p.metadata ?? {}) as Record<string, unknown>;
    return md.productDesignMode === 'store' || typeof md.magamommyDesignId === 'string';
  });
  console.log(`[variant-photos] ${targets.length} product(s) to process`);

  const openaiKey = (await resolveClientApiKey({ clientId: site.clientId, provider: 'openai' })).key;

  for (const product of targets) {
    console.log(`\n──── product #${product.id} ${product.name} ────`);
    const metadata = (product.metadata ?? {}) as Record<string, unknown>;
    const conceptId = Number(metadata.magamommyConceptId);
    if (!Number.isFinite(conceptId)) {
      console.warn(`  skipping — no magamommyConceptId in metadata`);
      continue;
    }
    const [concept] = await db
      .select()
      .from(magamommyConcepts)
      .where(eq(magamommyConcepts.id, conceptId))
      .limit(1);
    if (!concept) {
      console.warn(`  skipping — concept ${conceptId} not found`);
      continue;
    }

    // Determine garmentType from product tags / name.
    const productTags = Array.isArray(product.tags) ? (product.tags as string[]) : [];
    const isOnesie = productTags.includes('onesie') || /onesie/i.test(product.name ?? '');
    const isHoodie = productTags.includes('hoodie') || /hoodie/i.test(product.name ?? '');
    const garmentType: 'tee' | 'onesie' | 'hoodie' =
      isOnesie ? 'onesie' : isHoodie ? 'hoodie' : 'tee';
    console.log(`  garmentType=${garmentType}`);

    // Resolve this product's color values.
    const [colorOpt] = await db
      .select({ id: productOptions.id })
      .from(productOptions)
      .where(and(eq(productOptions.productId, product.id), sql`lower(${productOptions.name}) = 'color' OR lower(${productOptions.name}) = 'colour'`))
      .limit(1);
    if (!colorOpt) {
      console.warn(`  skipping — no Color option`);
      continue;
    }
    const colorValues = await db
      .select({ value: productOptionValues.value })
      .from(productOptionValues)
      .where(eq(productOptionValues.optionId, colorOpt.id))
      .orderBy(asc(productOptionValues.order));
    const colorList = args.colors
      ? colorValues.filter((c) => args.colors!.some((req) => req.toLowerCase() === c.value.toLowerCase()))
      : colorValues;
    if (colorList.length === 0) {
      console.warn(`  no colors to process`);
      continue;
    }

    // Load existing product_images so we can skip colors that already have one.
    const existingImages = await db
      .select({ alt: productImages.alt })
      .from(productImages)
      .where(eq(productImages.productId, product.id));
    const existingByAlt = new Map(
      existingImages
        .filter((i) => i.alt)
        .map((i) => [i.alt!.toLowerCase().trim(), true]),
    );

    // Find the max order on existing rows so new images sort after them.
    const maxOrder = existingImages.length;
    let nextOrder = maxOrder;

    for (const cv of colorList) {
      const color = cv.value;
      const altKey = color.toLowerCase().trim();
      if (existingByAlt.has(altKey) && !args.force) {
        console.log(`  ${color.padEnd(14)} skipping (already exists; pass --force to regenerate)`);
        continue;
      }

      console.log(`  ${color.padEnd(14)} generating lifestyle photo...`);
      const prompt = buildLifestyleMockupPrompt({
        visualPrompt: concept.visualPrompt,
        palette: concept.palette,
        slogan: concept.slogan,
        tagline: concept.tagline,
        placement: concept.placement,
        garmentType,
        garmentColor: color,
      });

      const pngBuf = await generateOpenAIImage({
        openaiKey,
        prompt,
        size: '1024x1536',
      });
      const ts = Date.now();
      const upload = await uploadToS3(
        pngBuf,
        `lifestyle-${altKey.replace(/\s+/g, '-')}.png`,
        'image/png',
        { key: `media/magamommy/lifestyle-variants/${conceptId}-${altKey.replace(/\s+/g, '-')}-${ts}.png` },
      );

      if (existingByAlt.has(altKey) && args.force) {
        // Replace the existing row's URL rather than add a duplicate.
        await db
          .update(productImages)
          .set({ url: upload.url })
          .where(and(eq(productImages.productId, product.id), sql`lower(${productImages.alt}) = ${altKey}`));
        console.log(`    ${color.padEnd(14)} replaced existing → ${upload.url}`);
      } else {
        await db.insert(productImages).values({
          productId: product.id,
          url: upload.url,
          alt: color, // canonical alt = exact color name, so the renderer can pick by case-insensitive match
          order: nextOrder,
        });
        nextOrder += 1;
        console.log(`    ${color.padEnd(14)} added → ${upload.url}`);
      }
    }
  }

  console.log('\n[variant-photos] all products processed.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[variant-photos] FAILED:', err);
  process.exit(1);
});
