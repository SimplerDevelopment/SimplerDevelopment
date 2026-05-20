/**
 * Backfill existing Magamommy products to the canvas-designer schema:
 *
 *   - products.isDesignable = true
 *   - clone productDesignSurfaces from the template product
 *   - reassign designs.productId from the template to the published product
 *
 * Customer access to /designer/<slug> is gated separately via
 * metadata.productDesignMode='store' (the designer route redirects to
 * /shop/<slug> for store-mode products — see app/sites/[domain]/designer/
 * [productSlug]/page.tsx).
 *
 * Idempotent: re-runs are a no-op on already-converted products.
 *
 *   bun scripts/magamommy/backfill-designer-shape.ts
 *   bun scripts/magamommy/backfill-designer-shape.ts --dry-run
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

interface Args {
  dryRun: boolean;
}

function parseArgs(): Args {
  return { dryRun: process.argv.includes('--dry-run') };
}

async function main() {
  const args = parseArgs();
  console.log('[backfill-designer-shape] starting' + (args.dryRun ? ' (dry-run)' : ''));

  const { db } = await import('../../lib/db');
  const {
    clientWebsites,
    products,
    productDesignSurfaces,
    designs,
  } = await import('../../lib/db/schema');
  const { and, eq, inArray } = await import('drizzle-orm');

  // Resolve the Magamommy site + template product.
  let [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(eq(clientWebsites.domain, 'magamommy.com'))
    .limit(1);
  if (!site) {
    [site] = await db
      .select({ id: clientWebsites.id })
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
  if (!template) throw new Error('Template product "heavyweight-tee-template" missing.');

  // Find all published magamommy products that are NOT the template — i.e.
  // every weekly drop / custom drop ever shipped.
  const targets = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      isDesignable: products.isDesignable,
      metadata: products.metadata,
    })
    .from(products)
    .where(and(
      eq(products.websiteId, site.id),
      eq(products.status, 'active'),
    ));
  const drops = targets.filter((p) => p.id !== template.id);
  console.log(`[backfill] found ${drops.length} drop(s) to inspect`);

  // Cache template surfaces once.
  const templateSurfaces = await db
    .select({
      name: productDesignSurfaces.name,
      slug: productDesignSurfaces.slug,
      displayOrder: productDesignSurfaces.displayOrder,
      mockupImage: productDesignSurfaces.mockupImage,
      canvasWidth: productDesignSurfaces.canvasWidth,
      canvasHeight: productDesignSurfaces.canvasHeight,
      printAreaX: productDesignSurfaces.printAreaX,
      printAreaY: productDesignSurfaces.printAreaY,
      printAreaWidth: productDesignSurfaces.printAreaWidth,
      printAreaHeight: productDesignSurfaces.printAreaHeight,
      printDpi: productDesignSurfaces.printDpi,
      active: productDesignSurfaces.active,
    })
    .from(productDesignSurfaces)
    .where(eq(productDesignSurfaces.productId, template.id));

  let touchedIsDesignable = 0;
  let clonedSurfaces = 0;
  let reassignedDesigns = 0;

  for (const drop of drops) {
    const metadata = (drop.metadata ?? {}) as Record<string, unknown>;
    const isMagamommy = metadata.productDesignMode === 'store' || typeof metadata.magamommyDesignId === 'string';
    if (!isMagamommy) {
      console.log(`  product #${drop.id} (${drop.slug}) — skipping (not a magamommy store-drop)`);
      continue;
    }
    console.log(`  product #${drop.id} (${drop.slug}) — magamommy store-drop`);

    // 1. Flip isDesignable.
    if (!drop.isDesignable) {
      if (!args.dryRun) {
        await db.update(products).set({ isDesignable: true }).where(eq(products.id, drop.id));
      }
      touchedIsDesignable += 1;
      console.log(`     isDesignable false → true`);
    }

    // 2. Clone surfaces from template (skip slugs already present).
    const existingSlugs = new Set(
      (await db
        .select({ slug: productDesignSurfaces.slug })
        .from(productDesignSurfaces)
        .where(eq(productDesignSurfaces.productId, drop.id)))
        .map((s) => s.slug),
    );
    const missing = templateSurfaces.filter((s) => !existingSlugs.has(s.slug));
    if (missing.length > 0) {
      if (!args.dryRun) {
        await db.insert(productDesignSurfaces).values(missing.map((s) => ({ ...s, productId: drop.id })));
      }
      clonedSurfaces += missing.length;
      console.log(`     cloned ${missing.length} surface(s): ${missing.map((s) => s.slug).join(', ')}`);
    }

    // 3. Reassign the design row pointed to by metadata.magamommyDesignId
    //    from the template to this product.
    const designId = typeof metadata.magamommyDesignId === 'string' ? metadata.magamommyDesignId : null;
    if (designId) {
      const [design] = await db
        .select({ id: designs.id, productId: designs.productId })
        .from(designs)
        .where(eq(designs.id, designId))
        .limit(1);
      if (design && design.productId !== drop.id) {
        if (!args.dryRun) {
          await db.update(designs).set({ productId: drop.id, updatedAt: new Date() }).where(eq(designs.id, designId));
        }
        reassignedDesigns += 1;
        console.log(`     reassigned design ${designId} → product ${drop.id}`);
      }
    }
  }

  console.log('\n[backfill-designer-shape] summary:');
  console.log(`  isDesignable flipped:   ${touchedIsDesignable}`);
  console.log(`  surfaces cloned:        ${clonedSurfaces}`);
  console.log(`  designs reassigned:     ${reassignedDesigns}`);
  if (args.dryRun) console.log('\n  DRY RUN — no writes applied.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill-designer-shape] FAILED:', err);
  process.exit(1);
});
