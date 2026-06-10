// Snapshot a shared catalog product into a tenant website's store as a
// DESIGNABLE product (legacy per-color designer at /sites/[domain]/design/[slug]).
//
// Writes, in one transaction:
//   - products            (one; designable=true, with retail/cost pricing)
//   - productStyles        (one per catalog colorway; mockup thumbnail + colorHex)
//   - productSides         (one per catalog side; mockup imageUrl + preset print area)
//   - productOptions       ("Size", "Color")
//   - productOptionValues  (distinct sizes; one per colorway)
//   - productVariants      (one per catalog_size row — the color×size SKU matrix)
//   - catalogOptins        (the idempotency ledger)
//
// TENANCY: callers (API route / MCP tool) MUST resolve websiteId from the
// session, never from a client-supplied param. This function trusts websiteId.

import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  catalogProducts,
  catalogStyles,
  catalogSides,
  catalogSizes,
  catalogOptins,
  products,
  productStyles,
  productSides,
  productOptions,
  productOptionValues,
  productVariants,
} from '@/lib/db/schema';

export interface OptInOptions {
  websiteId: number;
  catalogProductId: number;
  /** retail price = round(cost * markup). Default 2.5×. Store owner edits later. */
  markup?: number;
  status?: 'draft' | 'active';
}

export interface OptInResult {
  productId: number;
  created: boolean;
  styles: number;
  sides: number;
  variants: number;
  slug?: string;
}

const SIDE_LABELS: Record<string, string> = {
  front: 'Front',
  back: 'Back',
  sleeveleft: 'Left Sleeve',
  sleeveright: 'Right Sleeve',
};

// Preset printable area (px, relative to mockup) keyed by side type, derived
// from the side's actual pixel dimensions. Editable per-product in the portal.
function presetPrintArea(side: string, w: number | null, h: number | null) {
  const W = w ?? 800;
  const H = h ?? 600;
  if (/sleeve/i.test(side)) {
    const pw = Math.round(W * 0.3);
    const ph = Math.round(H * 0.16);
    return { x: Math.round((W - pw) / 2), y: Math.round(H * 0.42), width: pw, height: ph };
  }
  // front / back / default — centered chest box, biased to the upper torso.
  const pw = Math.round(W * 0.52);
  const ph = Math.round(H * 0.62);
  return { x: Math.round((W - pw) / 2), y: Math.round(H * 0.16), width: pw, height: ph };
}

const SIZE_RANK: Record<string, number> = {
  XXS: 0, XS: 1, S: 2, SM: 2, M: 3, MD: 3, L: 4, LG: 4, XL: 5,
  '2XL': 6, XXL: 6, '3XL': 7, XXXL: 7, '4XL': 8, '5XL': 9, '6XL': 10,
};
function orderSizes(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ra = SIZE_RANK[a.toUpperCase().replace(/\s+/g, '')];
    const rb = SIZE_RANK[b.toUpperCase().replace(/\s+/g, '')];
    if (ra != null && rb != null) return ra - rb;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.localeCompare(b);
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200) || 'product';
}

async function uniqueSlug(websiteId: number, base: string): Promise<string> {
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hit = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.websiteId, websiteId), eq(products.slug, slug)))
      .limit(1);
    if (!hit.length) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

export async function optInCatalogProduct(opts: OptInOptions): Promise<OptInResult> {
  const markup = opts.markup ?? 2.5;
  const status = opts.status ?? 'active';

  // Idempotent: already opted in?
  const existing = await db
    .select({ productId: catalogOptins.productId })
    .from(catalogOptins)
    .where(
      and(
        eq(catalogOptins.websiteId, opts.websiteId),
        eq(catalogOptins.catalogProductId, opts.catalogProductId)
      )
    )
    .limit(1);
  if (existing.length) {
    return { productId: existing[0].productId, created: false, styles: 0, sides: 0, variants: 0 };
  }

  const [cp] = await db
    .select()
    .from(catalogProducts)
    .where(eq(catalogProducts.id, opts.catalogProductId))
    .limit(1);
  if (!cp) throw new Error(`catalog product ${opts.catalogProductId} not found`);

  const styles = await db
    .select()
    .from(catalogStyles)
    .where(eq(catalogStyles.catalogProductId, cp.id));
  if (!styles.length) throw new Error(`catalog product ${cp.id} (${cp.name}) has no styles`);
  const styleIds = styles.map((s) => s.id);

  const sides = await db.select().from(catalogSides).where(inArray(catalogSides.catalogStyleId, styleIds));
  const sizes = await db.select().from(catalogSizes).where(inArray(catalogSizes.catalogStyleId, styleIds));

  const sizeCosts = sizes.map((s) => s.unitPriceCents ?? 0).filter((c) => c > 0);
  const baseCost = sizeCosts.length ? Math.min(...sizeCosts) : 0;
  const retail = baseCost ? Math.round(baseCost * markup) : 0;

  const slug = await uniqueSlug(opts.websiteId, cp.slug || slugify(cp.name));

  return db.transaction(async (tx) => {
    const [prod] = await tx
      .insert(products)
      .values({
        websiteId: opts.websiteId,
        name: cp.name,
        slug,
        description: cp.longDescription ?? null,
        price: retail,
        costPrice: baseCost || null,
        status,
        designable: true,
        isDesignable: false,
        trackInventory: false,
        quantity: 0,
      })
      .returning({ id: products.id });
    const productId = prod.id;

    // Styles + their sides (per-color mockups for the designer canvas).
    let nSides = 0;
    for (const [i, st] of styles.entries()) {
      const [ps] = await tx
        .insert(productStyles)
        .values({
          productId,
          name: st.name,
          colorHex: st.colorHex1 ?? null,
          thumbnailUrl: st.frontImageUrl ?? null,
          priceCents: null,
          order: i,
          active: true,
        })
        .returning({ id: productStyles.id });

      const styleSides = sides.filter((sd) => sd.catalogStyleId === st.id);
      for (const [j, sd] of styleSides.entries()) {
        const pa = presetPrintArea(sd.side, sd.width, sd.height);
        await tx.insert(productSides).values({
          styleId: ps.id,
          side: sd.side,
          label: SIDE_LABELS[sd.side] ?? sd.side,
          imageUrl: sd.imageUrl ?? '',
          printableX: pa.x,
          printableY: pa.y,
          printableWidth: pa.width,
          printableHeight: pa.height,
          order: j,
        });
        nSides += 1;
      }
    }

    // Purchasable SKU matrix: Size × Color options + variants.
    const [sizeOpt] = await tx
      .insert(productOptions)
      .values({ productId, name: 'Size', order: 0 })
      .returning({ id: productOptions.id });
    const [colorOpt] = await tx
      .insert(productOptions)
      .values({ productId, name: 'Color', order: 1 })
      .returning({ id: productOptions.id });

    const sizeNames = orderSizes(Array.from(new Set(sizes.map((s) => s.name).filter((n): n is string => !!n))));
    const sizeValId = new Map<string, number>();
    for (const [i, name] of sizeNames.entries()) {
      const [v] = await tx
        .insert(productOptionValues)
        .values({ optionId: sizeOpt.id, value: name, label: name, order: i })
        .returning({ id: productOptionValues.id });
      sizeValId.set(name, v.id);
    }

    const colorValId = new Map<number, number>(); // catalogStyleId -> colour value id
    for (const [i, st] of styles.entries()) {
      const [v] = await tx
        .insert(productOptionValues)
        .values({ optionId: colorOpt.id, value: st.name, label: st.name, order: i })
        .returning({ id: productOptionValues.id });
      colorValId.set(st.id, v.id);
    }

    let nVar = 0;
    for (const sz of sizes) {
      if (!sz.name) continue;
      const sizeVid = sizeValId.get(sz.name);
      const colorVid = colorValId.get(sz.catalogStyleId);
      if (!sizeVid || !colorVid) continue;
      const st = styles.find((s) => s.id === sz.catalogStyleId);
      const cost = sz.unitPriceCents ?? baseCost;
      await tx.insert(productVariants).values({
        productId,
        name: `${sz.name} / ${st?.name ?? ''}`.trim(),
        price: cost ? Math.round(cost * markup) : retail,
        costPrice: cost || null,
        quantity: 0,
        optionValues: [
          { optionId: sizeOpt.id, valueId: sizeVid },
          { optionId: colorOpt.id, valueId: colorVid },
        ],
        active: sz.inStock ?? true,
      });
      nVar += 1;
    }

    await tx.insert(catalogOptins).values({
      websiteId: opts.websiteId,
      catalogProductId: cp.id,
      productId,
    });

    return { productId, created: true, styles: styles.length, sides: nSides, variants: nVar, slug };
  });
}
