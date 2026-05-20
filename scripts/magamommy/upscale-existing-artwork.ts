/**
 * One-time backfill: pull every magamommy design's transparent artwork
 * (the 1024x1024 PNG the designer agent produced via gpt-image-1) through
 * Real-ESRGAN at 4x, upload the upscaled 4096x4096 PNG to S3, and stamp
 * the URL into the design's layersBySurface so the print-on-demand
 * integration can use it as the actual print file.
 *
 * Where the print-ready URL lives on a design row:
 *   designs.layersBySurface.<surface>[0].data.printReadyUrl
 *
 * The original .data.url (1024) is preserved — it's still what the
 * customer-facing canvas designer renders for preview. Only the POD
 * vendor uses .data.printReadyUrl when it exists.
 *
 * Idempotent: skips any design whose first image layer already has a
 * printReadyUrl. Pass --force to regenerate them all.
 *
 * Requires REPLICATE_API_TOKEN. See lib/printing/upscale.ts.
 *
 *   bun scripts/magamommy/upscale-existing-artwork.ts
 *   bun scripts/magamommy/upscale-existing-artwork.ts --product-id=66
 *   bun scripts/magamommy/upscale-existing-artwork.ts --force
 *   bun scripts/magamommy/upscale-existing-artwork.ts --dry-run
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

interface Args {
  productId?: number;
  force: boolean;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(`--${k}=`.length);
  const productIdRaw = get('product-id');
  return {
    productId: productIdRaw ? Number(productIdRaw) : undefined,
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
  };
}

interface ImageLayerData {
  url: string;
  printReadyUrl?: string;
  originalWidth?: number;
  originalHeight?: number;
  [k: string]: unknown;
}
interface Layer {
  id?: string;
  type?: string;
  data?: ImageLayerData;
  [k: string]: unknown;
}

async function main() {
  const args = parseArgs();
  console.log(
    `[upscale-artwork] starting${args.productId ? ` (product=${args.productId})` : ''}` +
      `${args.force ? ' --force' : ''}${args.dryRun ? ' --dry-run' : ''}`,
  );

  if (!process.env.REPLICATE_API_TOKEN && !args.dryRun) {
    console.error('[upscale-artwork] REPLICATE_API_TOKEN is not set.');
    console.error('  Add it to .env.local: REPLICATE_API_TOKEN=r8_...');
    console.error('  Get a token at https://replicate.com/account/api-tokens.');
    process.exit(1);
  }

  const { db } = await import('../../lib/db');
  const { clientWebsites, products, designs } = await import('../../lib/db/schema');
  const { and, eq, inArray } = await import('drizzle-orm');
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getS3Client, getBucketName } = await import('../../lib/s3/client');
  const { uploadToS3 } = await import('../../lib/s3/upload');
  const { upscaleArtwork } = await import('../../lib/printing/upscale');

  // Resolve Magamommy site.
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

  // Resolve target designs — all designs linked to active magamommy products,
  // or a specific product if --product-id was passed.
  const productRows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(args.productId
      ? and(eq(products.websiteId, site.id), eq(products.id, args.productId))
      : and(eq(products.websiteId, site.id), eq(products.status, 'active'))
    );
  const targetProductIds = productRows.filter((p) => p.id !== undefined).map((p) => p.id);
  if (targetProductIds.length === 0) {
    console.log('[upscale-artwork] no target products.');
    process.exit(0);
  }

  const designRows = await db
    .select()
    .from(designs)
    .where(inArray(designs.productId, targetProductIds));
  console.log(`[upscale-artwork] ${designRows.length} design(s) across ${targetProductIds.length} product(s)`);

  const s3 = getS3Client();
  const bucket = getBucketName();

  let upscaled = 0;
  let skipped = 0;
  for (const d of designRows) {
    const product = productRows.find((p) => p.id === d.productId);
    const layersBySurface = (d.layersBySurface ?? {}) as Record<string, Layer[]>;
    const surfaceSlugs = Object.keys(layersBySurface);
    if (surfaceSlugs.length === 0) {
      console.log(`  design ${d.id} (product=${d.productId}) — no surfaces, skipping`);
      continue;
    }

    let touched = false;
    for (const surface of surfaceSlugs) {
      const layers = layersBySurface[surface] ?? [];
      for (let i = 0; i < layers.length; i += 1) {
        const layer = layers[i];
        if (layer.type !== 'image' || !layer.data?.url) continue;
        const data = layer.data;
        if (data.printReadyUrl && !args.force) {
          skipped += 1;
          console.log(`  design ${d.id} surface=${surface} layer=${i} — already has printReadyUrl, skipping`);
          continue;
        }

        // The layer's .url is /api/media/proxy/<key>. We pull the actual
        // bytes from S3 via the bucket+key — works even if the dev server
        // isn't up to proxy.
        const url = data.url;
        const keyMatch = url.match(/\/api\/media\/proxy\/(.+)$/);
        if (!keyMatch) {
          console.warn(`  design ${d.id} surface=${surface} — unrecognized URL shape: ${url}, skipping`);
          continue;
        }
        const key = decodeURIComponent(keyMatch[1]);

        if (args.dryRun) {
          console.log(`  [dry-run] would upscale design ${d.id} surface=${surface} key=${key} (product=${product?.name ?? '?'})`);
          touched = true;
          continue;
        }

        console.log(`  design ${d.id} surface=${surface} — downloading ${key}...`);
        const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!obj.Body) throw new Error(`S3 GetObject returned no body for ${key}`);
        // @ts-expect-error — node Body has transformToByteArray()
        const bytes = await obj.Body.transformToByteArray();
        const sourceBuf = Buffer.from(bytes);
        console.log(`    downloaded ${sourceBuf.length} bytes, calling Real-ESRGAN x4...`);

        const upscaledBuf = await upscaleArtwork(sourceBuf, { scale: 4 });
        console.log(`    upscaled ${upscaledBuf.length} bytes (${(upscaledBuf.length / sourceBuf.length).toFixed(2)}x size)`);

        // Upload under media/magamommy/print-ready/<conceptId or designId>-<surface>-<ts>-4x.png
        const ts = Date.now();
        const outKey = `media/magamommy/print-ready/design-${d.id}-${surface}-${ts}-4x.png`;
        const upload = await uploadToS3(upscaledBuf, `print-${surface}-4x.png`, 'image/png', { key: outKey });
        console.log(`    uploaded → ${upload.url}`);

        // Stamp the URL into the layer's data.
        layer.data = { ...data, printReadyUrl: upload.url };
        touched = true;
        upscaled += 1;
      }
    }

    if (touched && !args.dryRun) {
      await db.update(designs).set({ layersBySurface, updatedAt: new Date() }).where(eq(designs.id, d.id));
      console.log(`  design ${d.id} — updated layersBySurface ✓`);
    }
  }

  console.log(`\n[upscale-artwork] done: upscaled=${upscaled} skipped=${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[upscale-artwork] FAILED:', err);
  process.exit(1);
});
