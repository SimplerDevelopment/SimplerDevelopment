/**
 * CLI: opt a shared catalog product into a tenant website's store (Phase C).
 * Admin tool — websiteId is supplied explicitly. The eventual portal/MCP path
 * resolves websiteId from session instead (see lib/catalog/opt-in.ts).
 *
 *   bun scripts/catalog/opt-in.ts --website=1 --product=gildan-softstyle-t-shirt
 *   bun scripts/catalog/opt-in.ts --website=1 --product=442        # by catalog source_id
 *   bun scripts/catalog/opt-in.ts --website=1 --product=all        # every complete Gildan product
 *   bun scripts/catalog/opt-in.ts --website=1 --product=all --markup=3 --status=draft
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : undefined;
}

async function main() {
  // Allow targeting a non-default DB (e.g. staging) without disturbing the
  // local .env precedence: CATALOG_DEST_URL wins over the dotenv DATABASE_URL.
  // Set before the dynamic import of @/lib/db (which reads DATABASE_URL once).
  if (process.env.CATALOG_DEST_URL) process.env.DATABASE_URL = process.env.CATALOG_DEST_URL;

  const websiteId = Number(arg('website'));
  const product = arg('product');
  const markup = arg('markup') ? Number(arg('markup')) : undefined;
  const status = (arg('status') as 'draft' | 'active' | undefined) ?? undefined;
  if (!websiteId || !product) {
    throw new Error('Usage: --website=<id> --product=<slug|sourceId|all> [--markup=2.5] [--status=active|draft]');
  }

  const { db } = await import('../../lib/db');
  const { catalogProducts } = await import('../../lib/db/schema');
  const { optInCatalogProduct } = await import('../../lib/catalog/opt-in');
  const { eq, and } = await import('drizzle-orm');

  // Resolve the target catalog product(s).
  let targets: { id: number; name: string }[];
  if (product === 'all') {
    targets = await db
      .select({ id: catalogProducts.id, name: catalogProducts.name })
      .from(catalogProducts)
      .where(and(eq(catalogProducts.active, true), eq(catalogProducts.complete, true)));
  } else if (/^\d+$/.test(product)) {
    targets = await db
      .select({ id: catalogProducts.id, name: catalogProducts.name })
      .from(catalogProducts)
      .where(eq(catalogProducts.sourceId, Number(product)));
  } else {
    targets = await db
      .select({ id: catalogProducts.id, name: catalogProducts.name })
      .from(catalogProducts)
      .where(eq(catalogProducts.slug, product));
  }
  if (!targets.length) throw new Error(`No catalog product matched "${product}"`);

  console.log(`Opting ${targets.length} product(s) into website ${websiteId} (markup ${markup ?? 2.5}×, status ${status ?? 'active'})`);
  for (const t of targets) {
    try {
      const r = await optInCatalogProduct({ websiteId, catalogProductId: t.id, markup, status });
      console.log(
        `  ${r.created ? 'CREATED' : 'exists '} product #${r.productId} ${r.slug ? `(${r.slug}) ` : ''}— ${t.name}` +
          (r.created ? ` :: ${r.styles} styles / ${r.sides} sides / ${r.variants} variants` : '')
      );
    } catch (e) {
      console.error(`  FAILED — ${t.name}: ${(e as Error).message}`);
    }
  }

}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
