// Magamommy publisher agent.
//
// Final stage of the autonomous-shop pipeline. Takes a finalized design + concept
// and produces a real `products` row (plus options, option values, variants, and
// a hero image) so the weekly drop is sellable on the storefront the moment this
// function returns.
//
// Pipeline position:
//   researcher → concept-writer → designer → [publisher] → live drop
//
// Reads:
//   - magamommyConcepts (slogan, tagline, palette, etc.)
//   - designs (rendered composite URL for the hero image)
//   - products (template — to copy weight/weight units / surfaces, though most
//     fields are overridden by the drop's own metadata)
//   - productDesignSurfaces (template — present in input contract for parity
//     with future per-surface print rendering; not currently mutated downstream)
//   - productOptions + productOptionValues (template — Size + Color set)
//   - productCategories (find-or-create the "weekly-drops" bucket)
//   - clientWebsites (resolve the public URL)
//
// Writes:
//   - products             (1 row — the drop)
//   - productImages        (1 row — the composite mockup)
//   - productOptions       (2 rows — Size, Color, FK'd to NEW product)
//   - productOptionValues  (copies of the template's values, FK'd to the NEW options)
//   - productVariants      (Cartesian product of sizes × colors)
//
// Public route: storefront product detail lives at `/shop/<slug>` (matches the
// pattern emitted by `scripts/create-palizzi-product.ts` and used by the
// wishlist/cart UI). We compose against `clientWebsites.vercelDomain`.

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  clientWebsites,
  designs,
  magamommyConcepts,
  productCategories,
  productDesignSurfaces,
  productImages,
  productOptions,
  productOptionValues,
  productVariants,
  products,
} from '@/lib/db/schema';

export interface PublisherInput {
  websiteId: number;
  /** magamommy_concepts PK */
  conceptId: number;
  /** designs PK (uuid) */
  designId: string;
  /** Bootstrap-seeded base template product (carries Size/Color options + surfaces) */
  templateProductId: number;
  /** Monday of the drop week (UTC). Used in slug/SKU disambiguation. */
  weekOf: Date;
}

export interface PublisherOutput {
  productId: number;
  /** products.slug — unique within the website */
  slug: string;
  /** Fully-qualified public URL of the product detail page */
  publicUrl: string;
}

// ───────────────────────── helpers ─────────────────────────

/**
 * Convert an arbitrary string into a URL-safe kebab-case slug. Mirrors the
 * informal convention used elsewhere in the repo (e.g. seed scripts), since
 * there is no shared `slugify` utility on lib/. Conservative: ASCII only,
 * collapses runs of non-alphanum into single dashes, trims leading/trailing.
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')        // strip combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);                          // leave headroom for collision suffixes
}

/**
 * Format a Monday Date as `YYYY-wNN` (ISO-ish week index used purely for
 * human-readable slugs/SKUs — not strict ISO 8601). Stable in UTC.
 */
function formatWeek(d: Date): string {
  // Approximate ISO week: start-of-year + days/7. Good enough for slug
  // uniqueness; we are not driving date math off this.
  const year = d.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const diffDays = Math.floor((d.getTime() - start) / (1000 * 60 * 60 * 24));
  // +1 so week 1 corresponds to the first Monday of the year (close enough).
  const week = Math.floor(diffDays / 7) + 1;
  return `${year}-w${String(week).padStart(2, '0')}`;
}

/**
 * Compact SKU-friendly code for an option value: uppercase + drop non-alphanum.
 * "Heather Grey" → "HEATHERGREY", "XXL" → "XXL".
 */
function skuCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Find a non-colliding slug within the given website. Tries the base slug
 * first, then `-2`, `-3`, ... up to `maxAttempts`. Throws if exhausted —
 * exhaustion would indicate either a logic bug or a wildly noisy week.
 */
async function findUniqueSlug(
  websiteId: number,
  baseSlug: string,
  maxAttempts = 5,
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
    const [hit] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.websiteId, websiteId), eq(products.slug, candidate)))
      .limit(1);
    if (!hit) return candidate;
  }
  throw new Error(
    `[publisher] could not find unique slug for baseSlug=${baseSlug} websiteId=${websiteId} after ${maxAttempts} attempts`,
  );
}

// ───────────────────────── main ─────────────────────────

export async function runPublisher(input: PublisherInput): Promise<PublisherOutput> {
  const { websiteId, conceptId, designId, templateProductId, weekOf } = input;
  const weekTag = formatWeek(weekOf);
  console.log(
    `[publisher] starting websiteId=${websiteId} conceptId=${conceptId} designId=${designId} templateProductId=${templateProductId} weekOf=${weekTag}`,
  );

  // ── 1. Load source rows ──────────────────────────────────────────────
  const [concept] = await db
    .select()
    .from(magamommyConcepts)
    .where(eq(magamommyConcepts.id, conceptId))
    .limit(1);
  if (!concept) {
    throw new Error(`[publisher] concept not found id=${conceptId}`);
  }
  if (concept.websiteId !== websiteId) {
    throw new Error(
      `[publisher] concept websiteId mismatch concept=${concept.websiteId} input=${websiteId}`,
    );
  }

  const [design] = await db
    .select()
    .from(designs)
    .where(eq(designs.id, designId))
    .limit(1);
  if (!design) {
    throw new Error(`[publisher] design not found id=${designId}`);
  }
  if (!design.renderedUrl) {
    throw new Error(`[publisher] design ${designId} has no renderedUrl — designer must complete before publish`);
  }

  // Narrow projection — avoids hitting columns added by later migrations
  // (shipping's length_in/width_in/height_in) that may not exist on every DB.
  const [templateProduct] = await db
    .select({
      id: products.id,
      websiteId: products.websiteId,
      weight: products.weight,
      weightUnit: products.weightUnit,
    })
    .from(products)
    .where(eq(products.id, templateProductId))
    .limit(1);
  if (!templateProduct) {
    throw new Error(`[publisher] template product not found id=${templateProductId}`);
  }
  if (templateProduct.websiteId !== websiteId) {
    throw new Error(
      `[publisher] template product websiteId mismatch template=${templateProduct.websiteId} input=${websiteId}`,
    );
  }

  // Surfaces — loaded for parity with the spec / future per-surface workflows.
  // Not mutated; informational only at this stage.
  const templateSurfaces = await db
    .select()
    .from(productDesignSurfaces)
    .where(eq(productDesignSurfaces.productId, templateProductId));
  console.log(`[publisher] template has ${templateSurfaces.length} design surface(s)`);

  // Template options (Size, Color) + their values.
  const templateOptions = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.productId, templateProductId))
    .orderBy(productOptions.order);
  if (templateOptions.length === 0) {
    throw new Error(
      `[publisher] template product ${templateProductId} has no productOptions — bootstrap must seed Size + Color`,
    );
  }

  // Map old optionId → values, so we can reproduce values under new option ids.
  const valuesByTemplateOptionId = new Map<
    number,
    Array<typeof productOptionValues.$inferSelect>
  >();
  for (const opt of templateOptions) {
    const vals = await db
      .select()
      .from(productOptionValues)
      .where(eq(productOptionValues.optionId, opt.id))
      .orderBy(productOptionValues.order);
    valuesByTemplateOptionId.set(opt.id, vals);
  }

  // ── 2. Find-or-create the "weekly-drops" category ────────────────────
  let [category] = await db
    .select()
    .from(productCategories)
    .where(
      and(
        eq(productCategories.websiteId, websiteId),
        eq(productCategories.slug, 'weekly-drops'),
      ),
    )
    .limit(1);

  if (!category) {
    console.log(`[publisher] creating weekly-drops category for websiteId=${websiteId}`);
    [category] = await db
      .insert(productCategories)
      .values({
        websiteId,
        name: 'Weekly Drops',
        slug: 'weekly-drops',
        description: 'Limited-run weekly shirt drops. Each design is available for one week only.',
        active: true,
        order: 0,
      })
      .returning();
  }

  // ── 3. Build a unique slug ───────────────────────────────────────────
  const baseSlug = `${slugify(concept.slogan)}-${weekTag}`;
  const slug = await findUniqueSlug(websiteId, baseSlug, 5);
  console.log(`[publisher] resolved slug=${slug}`);

  // ── 4. Insert the product ────────────────────────────────────────────
  // Note: `products` has no `publishedAt` column (verified against
  // lib/db/schema/store.ts as of this writing) — `status: 'active'` + the
  // implicit `createdAt` are how the storefront determines visibility.
  const [product] = await db
    .insert(products)
    .values({
      websiteId,
      categoryId: category.id,
      name: concept.slogan,
      slug,
      description: `${concept.tagline}\n\nLimited weekly drop. Available until next Monday.`,
      shortDescription: concept.tagline.slice(0, 200),
      price: 2900,           // $29.00
      compareAtPrice: 3500,  // $35.00 — shown as a discount on the storefront
      status: 'active',
      featured: true,
      // isDesignable=true so the product carries the same canvas-designer
      // data shape as a real customer-designable product (productDesignSurfaces
      // + designs.layersBySurface). metadata.productDesignMode='store' below
      // is the signal that gates customer access — the storefront designer
      // route (app/sites/[domain]/designer/[productSlug]) redirects to the
      // shop page for store-mode products instead of rendering the editor.
      isDesignable: true,
      trackInventory: true,
      quantity: 100,
      weight: '200',         // numeric column → string-encoded by Drizzle
      weightUnit: 'g',
      seoTitle: `${concept.slogan} | Magamommy`,
      seoDescription: concept.tagline,
      tags: ['weekly-drop', weekTag, concept.style, concept.topicSlug].filter(Boolean),
      metadata: {
        productDesignMode: 'store',
        storeDesignId: design.id,
        magamommyConceptId: String(concept.id),
        magamommyBriefId: String(concept.briefId),
        magamommyDesignId: design.id,
        magamommyWeekOf: weekTag,
      },
    })
    .returning({ id: products.id });

  const productId = product.id;
  console.log(`[publisher] inserted product id=${productId} slug=${slug}`);

  // ── 5. Insert the hero image (the composite mockup) ──────────────────
  await db.insert(productImages).values({
    productId,
    url: design.renderedUrl,
    alt: concept.slogan,
    order: 0,
  });
  console.log(`[publisher] inserted hero image url=${design.renderedUrl}`);

  // ── 5b. Clone the template's productDesignSurfaces onto the new product.
  // The storefront designer (app/sites/[domain]/designer/[productSlug]) and
  // the portal staff designer both load surfaces by productId. We mirror the
  // template's surfaces (front + back, same canvas + print-area dimensions)
  // onto the published product so the designer data shape is consistent with
  // a real customer-designable product. Customer access is gated separately
  // by metadata.productDesignMode='store' (see the designer route).
  const templateSurfaceRows = await db
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
    .where(eq(productDesignSurfaces.productId, templateProductId));
  if (templateSurfaceRows.length > 0) {
    await db.insert(productDesignSurfaces).values(
      templateSurfaceRows.map((s) => ({ ...s, productId })),
    );
    console.log(`[publisher] cloned ${templateSurfaceRows.length} design surface(s) onto product ${productId}`);
  }

  // ── 5c. Reassign the design row from the template to the new product so
  // the storefront/portal designer's `SELECT * FROM designs WHERE productId=N`
  // returns this design when loading the published product. The design was
  // initially created against the template because the publisher hadn't
  // minted the per-week product yet.
  await db
    .update(designs)
    .set({ productId, updatedAt: new Date() })
    .where(eq(designs.id, design.id));
  console.log(`[publisher] reassigned design ${design.id} → product ${productId}`);

  // ── 6. Clone the template's options + values onto the new product ────
  // Build a map from (oldOptionId, oldValueId) → newValueId so we can build
  // variants with the correct fresh ids.
  const newOptionByName: Array<{
    templateOptionId: number;
    newOptionId: number;
    name: string;
    valueIds: Array<{ value: string; newValueId: number }>;
  }> = [];

  for (const tmplOpt of templateOptions) {
    const [newOpt] = await db
      .insert(productOptions)
      .values({
        productId,
        name: tmplOpt.name,
        order: tmplOpt.order,
      })
      .returning();

    const tmplVals = valuesByTemplateOptionId.get(tmplOpt.id) ?? [];
    const newValueRows: Array<{ value: string; newValueId: number }> = [];

    for (const tv of tmplVals) {
      const [newVal] = await db
        .insert(productOptionValues)
        .values({
          optionId: newOpt.id,
          value: tv.value,
          label: tv.label ?? null,
          order: tv.order,
        })
        .returning();
      newValueRows.push({ value: tv.value, newValueId: newVal.id });
    }

    newOptionByName.push({
      templateOptionId: tmplOpt.id,
      newOptionId: newOpt.id,
      name: tmplOpt.name,
      valueIds: newValueRows,
    });
  }

  // Identify the Size and Color options by name (case-insensitive). Defensive:
  // the bootstrap spec promises exactly these two, but we don't want a typo
  // upstream to silently produce a malformed variant matrix.
  const sizeOpt = newOptionByName.find((o) => /^size$/i.test(o.name));
  const colorOpt = newOptionByName.find((o) => /^colou?r$/i.test(o.name));
  if (!sizeOpt || !colorOpt) {
    throw new Error(
      `[publisher] template product ${templateProductId} missing Size or Color option — got [${newOptionByName.map((o) => o.name).join(', ')}]`,
    );
  }

  // ── 7. Insert variants — Cartesian product of sizes × colors ─────────
  const totalVariants = sizeOpt.valueIds.length * colorOpt.valueIds.length;
  const perVariantQty = totalVariants > 0 ? Math.floor(100 / totalVariants) : 0;
  console.log(
    `[publisher] generating ${totalVariants} variants (${sizeOpt.valueIds.length} sizes × ${colorOpt.valueIds.length} colors), ~${perVariantQty} each`,
  );

  const variantRows: Array<typeof productVariants.$inferInsert> = [];
  for (const size of sizeOpt.valueIds) {
    for (const color of colorOpt.valueIds) {
      variantRows.push({
        productId,
        name: `${size.value} / ${color.value}`,
        sku: `MAGM-${weekTag}-${skuCode(size.value)}-${skuCode(color.value)}`,
        price: 2900,
        compareAtPrice: 3500,
        quantity: perVariantQty,
        weight: '200',
        // The schema stores option memberships in a JSON array — no join table.
        optionValues: [
          { optionId: sizeOpt.newOptionId, valueId: size.newValueId },
          { optionId: colorOpt.newOptionId, valueId: color.newValueId },
        ],
        active: true,
      });
    }
  }
  if (variantRows.length > 0) {
    await db.insert(productVariants).values(variantRows);
  }

  // ── 8. Resolve the public URL ────────────────────────────────────────
  const [site] = await db
    .select({
      subdomain: clientWebsites.subdomain,
      vercelDomain: clientWebsites.vercelDomain,
      domain: clientWebsites.domain,
    })
    .from(clientWebsites)
    .where(eq(clientWebsites.id, websiteId))
    .limit(1);
  if (!site) {
    throw new Error(`[publisher] clientWebsites row not found for websiteId=${websiteId}`);
  }

  // Preference order for the public host:
  //   1. vercelDomain  (canonical deploy URL — always available post-provision)
  //   2. domain        (custom domain, if configured)
  //   3. subdomain.simplerdevelopment.com (fallback)
  const host =
    site.vercelDomain ||
    site.domain ||
    (site.subdomain ? `${site.subdomain}.simplerdevelopment.com` : null);
  if (!host) {
    throw new Error(
      `[publisher] websiteId=${websiteId} has no vercelDomain, domain, or subdomain — cannot resolve publicUrl`,
    );
  }

  // Storefront product detail route — matches the convention used in
  // scripts/create-palizzi-product.ts and the wishlist/cart UI.
  const publicUrl = `https://${host}/shop/${slug}`;
  console.log(`[publisher] done productId=${productId} publicUrl=${publicUrl}`);

  return { productId, slug, publicUrl };
}
