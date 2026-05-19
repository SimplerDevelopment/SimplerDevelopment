/**
 * Regenerate the customer-facing Magamommy lifestyle hero image for an
 * already-published drop. Useful after prompt/art-direction changes without
 * creating a new weekly product.
 *
 * Usage:
 *   bun scripts/magamommy/regenerate-lifestyle-hero.ts
 *   bun scripts/magamommy/regenerate-lifestyle-hero.ts --product-id=64
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

function parseProductId(): number | undefined {
  const arg = process.argv.find((a) => a.startsWith('--product-id='));
  if (!arg) return undefined;
  const value = Number(arg.split('=')[1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid --product-id value: ${arg}`);
  }
  return value;
}

async function main(): Promise<void> {
  const productIdArg = parseProductId();

  const { db } = await import('../../lib/db');
  const {
    clientWebsites,
    designs,
    magamommyConcepts,
    magamommyDrops,
    productImages,
    products,
  } = await import('../../lib/db/schema');
  const { resolveClientApiKey } = await import('../../lib/ai/resolve-client-key');
  const { uploadToS3 } = await import('../../lib/s3/upload');
  const {
    buildLifestyleMockupPrompt,
    generateOpenAIImage,
  } = await import('../../lib/magamommy/agents/designer');
  const { and, desc, eq } = await import('drizzle-orm');

  const [site] = await db
    .select({ id: clientWebsites.id, clientId: clientWebsites.clientId })
    .from(clientWebsites)
    .where(eq(clientWebsites.domain, 'magamommy.com'))
    .limit(1);
  if (!site) {
    throw new Error('Magamommy website not found');
  }

  let productId = productIdArg;
  let conceptId: number | null = null;
  let designId: string | null = null;

  if (!productId) {
    const [drop] = await db
      .select({
        productId: magamommyDrops.productId,
        conceptId: magamommyDrops.conceptId,
        designId: magamommyDrops.designId,
      })
      .from(magamommyDrops)
      .where(eq(magamommyDrops.websiteId, site.id))
      .orderBy(desc(magamommyDrops.weekOf), desc(magamommyDrops.id))
      .limit(1);
    if (!drop?.productId || !drop.conceptId || !drop.designId) {
      throw new Error('No completed Magamommy drop found to refresh');
    }
    productId = drop.productId;
    conceptId = drop.conceptId;
    designId = drop.designId;
  }

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.websiteId, site.id)))
    .limit(1);
  if (!product) {
    throw new Error(`Product ${productId} not found for Magamommy website`);
  }

  if (!conceptId || !designId) {
    const metadata = product.metadata ?? {};
    conceptId = Number(metadata.magamommyConceptId);
    designId = metadata.magamommyDesignId;
  }
  if (!conceptId || !designId) {
    throw new Error(`Product ${productId} is missing Magamommy concept/design metadata`);
  }

  const [concept] = await db
    .select()
    .from(magamommyConcepts)
    .where(and(eq(magamommyConcepts.id, conceptId), eq(magamommyConcepts.websiteId, site.id)))
    .limit(1);
  if (!concept) {
    throw new Error(`Concept ${conceptId} not found`);
  }

  const resolved = await resolveClientApiKey({ clientId: site.clientId, provider: 'openai' });
  const prompt = buildLifestyleMockupPrompt({
    visualPrompt: concept.visualPrompt,
    palette: concept.palette,
    slogan: concept.slogan,
    tagline: concept.tagline,
    placement: concept.placement,
  });

  console.log(`[lifestyle-hero] generating productId=${productId} conceptId=${conceptId}`);
  const lifestylePng = await generateOpenAIImage({
    openaiKey: resolved.key,
    prompt,
    size: '1024x1536',
  });

  const ts = Date.now();
  const upload = await uploadToS3(
    lifestylePng,
    'lifestyle-hero.png',
    'image/png',
    { key: `media/magamommy/lifestyle/${conceptId}-hero-${ts}.png` },
  );

  await db
    .update(designs)
    .set({
      thumbnailUrl: upload.url,
      renderedUrl: upload.url,
      updatedAt: new Date(),
    })
    .where(eq(designs.id, designId));

  const [existingImage] = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(and(eq(productImages.productId, productId), eq(productImages.order, 0)))
    .limit(1);

  if (existingImage) {
    await db
      .update(productImages)
      .set({
        url: upload.url,
        alt: `${concept.slogan} shirt worn by model`,
      })
      .where(eq(productImages.id, existingImage.id));
  } else {
    await db.insert(productImages).values({
      productId,
      url: upload.url,
      alt: `${concept.slogan} shirt worn by model`,
      order: 0,
    });
  }

  await db
    .update(products)
    .set({
      metadata: {
        ...(product.metadata ?? {}),
        magamommyLifestyleHeroUrl: upload.url,
      },
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  console.log('[lifestyle-hero] updated product hero image');
  console.log(`  productId: ${productId}`);
  console.log(`  designId:  ${designId}`);
  console.log(`  imageUrl:  ${upload.url}`);
}

main().catch((err) => {
  console.error('[lifestyle-hero] failed:', err);
  process.exit(1);
});
