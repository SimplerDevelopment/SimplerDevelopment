import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

/**
 * Idempotent print-on-demand product seed.
 *
 * Stands up ONE fully-configured designable product — product → style → sides
 * with printable-area bounds — on an existing store site. This is the setup a
 * merchant would otherwise have to do by hand, because **there is no portal UI
 * for product styles or sides**: the API routes exist
 * (`/api/portal/websites/[siteId]/store/products/[id]/styles[/[styleId]/sides]`)
 * but nothing under `app/portal` or `components/portal` calls them, which is why
 * even `tests/e2e/storefront-pod-designed-order.spec.ts` falls back to raw
 * INSERTs. Until that UI exists, this script is the supported path.
 *
 * What it does NOT do — deliberately:
 *   • It never writes Stripe or Printful credentials. Those are yours, they are
 *     encrypted at rest (`lib/crypto/api-key.ts`), and a seed script is the
 *     wrong place for them. It prints exactly what is still missing instead.
 *   • It does not enable the store or flip `fulfillment_provider` to 'printful'.
 *     Enabling fulfilment before the Printful key exists would let an order be
 *     placed that can never be fulfilled.
 *
 * Usage:
 *   SITE_ID=145 bun scripts/seed-pod-product.ts
 *   SITE_ID=145 MOCKUP_URL=https://…/tee-front.png bun scripts/seed-pod-product.ts
 *
 * Re-running is safe: the product is upserted by (websiteId, slug), and the
 * style/sides by name/side within it.
 */
import { db } from '@/lib/db';
import { products, storeSettings, clientWebsites } from '@/lib/db/schema';
import { productStyles, productSides } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const SITE_ID = Number(process.env.SITE_ID ?? '');
const SLUG = process.env.SLUG ?? 'classic-tee';
// A mockup image the designer renders the canvas on top of. Any public URL works;
// the printable-* bounds below are in the pixel space of THIS image.
const MOCKUP_URL = process.env.MOCKUP_URL ?? 'https://placehold.co/1200x1600/png?text=Tee+Front';

if (!Number.isFinite(SITE_ID) || SITE_ID <= 0) {
  console.error('SITE_ID is required, e.g.  SITE_ID=145 bun scripts/seed-pod-product.ts');
  process.exit(1);
}

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, SITE_ID)).limit(1);
  if (!site) {
    console.error(`No client_websites row with id=${SITE_ID}.`);
    process.exit(1);
  }

  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.websiteId, SITE_ID)).limit(1);
  if (!settings) {
    console.error(`Site ${SITE_ID} (${site.domain}) has no store_settings row — enable the store in the portal first.`);
    process.exit(1);
  }

  // ── product ────────────────────────────────────────────────────────────────
  const [existing] = await db.select().from(products)
    .where(and(eq(products.websiteId, SITE_ID), eq(products.slug, SLUG))).limit(1);

  const product = existing
    ? (await db.update(products).set({ designable: true, status: 'active', updatedAt: new Date() })
        .where(eq(products.id, existing.id)).returning())[0]
    : (await db.insert(products).values({
        websiteId: SITE_ID,
        name: 'Classic Tee',
        slug: SLUG,
        description: 'Soft cotton tee. Design the front however you like.',
        price: 2800, // cents
        status: 'active',
        designable: true,
        // printfulVariantId is intentionally left NULL — it is Printful-catalogue
        // specific and PrintfulFulfillmentPanel surfaces the gap in the portal.
      }).returning())[0];

  console.log(`${existing ? 'updated' : 'created'} product #${product.id} (${product.slug}) designable=true`);

  // ── style ──────────────────────────────────────────────────────────────────
  const [existingStyle] = await db.select().from(productStyles)
    .where(and(eq(productStyles.productId, product.id), eq(productStyles.name, 'Black'))).limit(1);

  const style = existingStyle ?? (await db.insert(productStyles).values({
    productId: product.id, name: 'Black', colorHex: '#000000', order: 0, active: true,
  }).returning())[0];

  console.log(`${existingStyle ? 'reused' : 'created'} style #${style.id} (${style.name})`);

  // ── side + printable bounds ────────────────────────────────────────────────
  // printable_* are in the MOCKUP IMAGE's pixel space, not the product's. The
  // renderer maps the canvas out of mockup space before cropping — see
  // lib/printing/renderPrintFile.ts. Getting these wrong yields a print file
  // that looks right in the designer and is misaligned on the garment.
  const [existingSide] = await db.select().from(productSides)
    .where(and(eq(productSides.styleId, style.id), eq(productSides.side, 'front'))).limit(1);

  if (existingSide) {
    console.log(`reused side #${existingSide.id} (front)`);
  } else {
    const [side] = await db.insert(productSides).values({
      styleId: style.id,
      side: 'front',
      label: 'Front',
      imageUrl: MOCKUP_URL,
      printableX: 350,
      printableY: 420,
      printableWidth: 500,
      printableHeight: 650,
      order: 0,
    }).returning();
    console.log(`created side #${side.id} (front) printable=500x650 @ (350,420)`);
  }

  // ── what is still missing before this can actually sell ────────────────────
  const gaps: string[] = [];
  if (!settings.enabled) gaps.push('store_settings.enabled is false — the storefront is not serving');
  if (settings.stripeMode === 'connect' && !settings.stripeAccountId)
    gaps.push('no Stripe Connect account linked — checkout cannot take payment');
  if (settings.stripeMode === 'byok' && !settings.stripeSecretKeyEncrypted)
    gaps.push('stripe_mode=byok but no secret key stored — checkout cannot take payment');
  if (settings.fulfillmentProvider !== 'printful')
    gaps.push(`fulfillment_provider is '${settings.fulfillmentProvider}' — set it to 'printful' for POD`);
  if (!settings.printfulApiKeyEncrypted) gaps.push('no Printful API key — orders cannot be submitted for fulfilment');
  if (!settings.printfulStoreId) gaps.push('no Printful store ID');
  if (product.printfulVariantId == null)
    gaps.push(`product #${product.id} has no printfulVariantId — set it in the portal's Printful panel`);

  console.log('\nProduct is configured. Still required before a real order can ship:');
  if (gaps.length === 0) console.log('  nothing — this store is fully configured.');
  for (const g of gaps) console.log(`  ✗ ${g}`);
  console.log('\nCredentials are deliberately not seeded — add them in the portal so they are encrypted at rest.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
