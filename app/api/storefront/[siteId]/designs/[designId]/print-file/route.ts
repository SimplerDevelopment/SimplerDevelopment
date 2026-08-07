// Print-file generation for a saved product design.
//
// The caller POSTs only `{ side }`. The file is rendered SERVER-SIDE from the
// design's stored layers (lib/printing/renderPrintFile), uploaded to S3, and
// recorded on productDesigns.printFiles keyed by side. The browser sends no
// image — see vault ADR print-file-is-artwork-not-mockup.
//
// `validatePrintFile` below predates that and once guarded a client upload. It
// is retained as defence in depth against a renderer regression: whatever lands
// here is eventually printed on a garment the store owner pays for, so a bad
// file is not a rendering glitch, it is scrap. Two failure modes are checked:
//
//   • a mockup instead of artwork — a composite of artwork over a product
//     photo is opaque, so we require an alpha channel.
//   • an under-resolution render — looks fine on screen, prints pixelated.
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { storeSettings, productDesigns, productSides, productStyles } from '@/lib/db/schema';
import { uploadToS3 } from '@/lib/s3/upload';
import { resolveDesignerCaller } from '@/lib/storefront/designer-auth';
import { renderPrintFile } from '@/lib/printing/renderPrintFile';

/**
 * Read a mockup's pixel dimensions. `product_sides` stores printable bounds
 * against this grid but not the grid itself, so it has to come from the image.
 */
async function readMockupSize(
  imageUrl: string | null | undefined,
): Promise<{ width: number; height: number } | null> {
  if (!imageUrl) return null;
  try {
    const abs = imageUrl.startsWith('http')
      ? imageUrl
      : `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}${imageUrl}`;
    const res = await fetch(abs);
    if (!res.ok) return null;
    const sharp = (await import('sharp')).default;
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

/**
 * Minimum long-edge pixels for an accepted print file.
 *
 * `product_sides` records the printable area in mockup-image pixels only —
 * nothing in the schema carries physical inches, so true DPI is not
 * computable here. 1500px is the calibration knob: it is roughly 150 DPI
 * across a 10in print, the low end of what Printful accepts for DTG. Raise it
 * if garments come back soft; it is deliberately one constant, not a formula
 * pretending to know the physical size.
 */
export const MIN_PRINT_EDGE_PX = 1500;

/** Reject payloads that would blow up memory before sharp ever sees them. */
export const MAX_PRINT_FILE_BYTES = 30 * 1024 * 1024;

const DATA_URL_RE = /^data:(image\/png);base64,(.+)$/;

export interface PrintFileValidationResult {
  ok: boolean;
  status: number;
  message?: string;
  buffer?: Buffer;
}

/**
 * Decode + validate a client-supplied print file.
 *
 * Exported so the guarantees can be unit-tested without standing up a request,
 * a database, or S3.
 */
export async function validatePrintFile(
  dataUrl: unknown,
): Promise<PrintFileValidationResult> {
  if (typeof dataUrl !== 'string' || !dataUrl) {
    return { ok: false, status: 400, message: 'printFileDataUrl is required' };
  }

  const match = dataUrl.match(DATA_URL_RE);
  if (!match) {
    return {
      ok: false,
      status: 400,
      message: 'Invalid data URL — expected data:image/png;base64,... (PNG is required for transparency)',
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    return { ok: false, status: 400, message: 'Invalid base64 payload' };
  }

  if (buffer.length === 0) {
    return { ok: false, status: 400, message: 'Empty print file' };
  }
  if (buffer.length > MAX_PRINT_FILE_BYTES) {
    return {
      ok: false,
      status: 413,
      message: `Print file exceeds ${MAX_PRINT_FILE_BYTES / (1024 * 1024)}MB`,
    };
  }

  // Lazy-load sharp — it is heavy and only needed on this path.
  const sharp = (await import('sharp')).default;

  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    return { ok: false, status: 400, message: 'Unreadable image data' };
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width === 0 || height === 0) {
    return { ok: false, status: 400, message: 'Image has no dimensions' };
  }

  // An artwork export is transparent. A mockup (artwork composited over a
  // product photo) is not — this is the cheapest reliable way to tell them
  // apart before the file reaches a printer.
  if (!meta.hasAlpha) {
    return {
      ok: false,
      status: 422,
      message:
        'Print file has no transparency. This looks like a mockup rather than artwork — ' +
        'a print file must be the artwork alone on a transparent background.',
    };
  }

  const longEdge = Math.max(width, height);
  if (longEdge < MIN_PRINT_EDGE_PX) {
    return {
      ok: false,
      status: 422,
      message: `Print file is too low-resolution (${width}x${height}). Long edge must be at least ${MIN_PRINT_EDGE_PX}px.`,
    };
  }

  return { ok: true, status: 200, buffer };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; designId: string }> },
) {
  try {
    const { siteId, designId: designIdRaw } = await params;
    const websiteId = Number(siteId);
    const designId = Number(designIdRaw);

    if (!Number.isInteger(websiteId) || !Number.isInteger(designId)) {
      return NextResponse.json({ success: false, message: 'Invalid identifiers' }, { status: 400 });
    }

    const [store] = await db.select().from(storeSettings)
      .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
      .limit(1);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const body = await req.json();
    const side = typeof body?.side === 'string' && body.side.trim() ? body.side.trim() : 'front';

    // Tenancy: the design must belong to THIS site. Never trust the route param
    // alone to establish ownership.
    const [design] = await db.select().from(productDesigns)
      .where(and(
        eq(productDesigns.id, designId),
        eq(productDesigns.websiteId, websiteId),
        isNull(productDesigns.deletedAt),
      ))
      .limit(1);
    if (!design) {
      return NextResponse.json({ success: false, message: 'Design not found' }, { status: 404 });
    }

    // Authorize: the logged-in customer who owns it, or the anonymous session
    // that created it.
    const caller = await resolveDesignerCaller(req, websiteId);
    const ownedByCustomer =
      caller.customerId !== null && design.customerId === caller.customerId;
    const ownedBySession =
      caller.sessionId !== null && !!design.sessionId && design.sessionId === caller.sessionId;
    if (!ownedByCustomer && !ownedBySession) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    // Resolve the side: its printable bounds and its mockup, which together
    // define the region to render and the coordinate space to render it in.
    // A design usually carries its styleId, but older/anonymous saves can leave
    // it null — fall back to the product's first style so those stay renderable
    // rather than failing with a confusing "no side configured".
    let styleId = design.styleId ?? null;
    if (styleId === null) {
      const [fallback] = await db.select({ id: productStyles.id })
        .from(productStyles)
        .where(eq(productStyles.productId, design.productId))
        .orderBy(asc(productStyles.order), asc(productStyles.id))
        .limit(1);
      styleId = fallback?.id ?? null;
    }

    const [sideRow] = styleId === null ? [] : await db.select().from(productSides)
      .where(and(
        eq(productSides.styleId, styleId),
        eq(productSides.side, side),
      ))
      .limit(1);
    if (!sideRow) {
      return NextResponse.json(
        { success: false, message: `No '${side}' side configured for this design's style` },
        { status: 400 },
      );
    }

    // product_sides records printable bounds in the mockup's own pixel grid but
    // does not store its dimensions, so read them off the image itself.
    const mockup = await readMockupSize(sideRow.imageUrl);
    if (!mockup) {
      return NextResponse.json(
        { success: false, message: 'Could not read the mockup image for this side' },
        { status: 422 },
      );
    }

    const layersForSide = (Array.isArray(design.layers) ? design.layers : []).filter(
      (l) => !(l as { side?: string })?.side || (l as { side?: string }).side === side,
    ) as Parameters<typeof renderPrintFile>[0]['layers'];

    const render = await renderPrintFile({ layers: layersForSide, side: sideRow, mockup });

    if (render.layersRendered === 0) {
      return NextResponse.json(
        {
          success: false,
          message: render.layersSkipped > 0
            ? `Nothing renderable on the '${side}' side (${render.layersSkipped} unsupported layer(s))`
            : `No artwork on the '${side}' side`,
        },
        { status: 422 },
      );
    }

    // Defence in depth. We control the renderer now, so this should never fire —
    // which is exactly why it is worth keeping: it turns a renderer regression
    // into a failed request instead of a blank garment.
    const validation = await validatePrintFile(
      `data:image/png;base64,${render.buffer.toString('base64')}`,
    );
    if (!validation.ok) {
      console.error('[print-file] server render failed its own validation:', validation.message);
      return NextResponse.json(
        { success: false, message: `Render failed validation: ${validation.message}` },
        { status: 500 },
      );
    }

    const upload = await uploadToS3(
      render.buffer,
      `print-${design.id}-${side}.png`,
      'image/png',
      { key: `media/print-files/design-${design.id}-${side}-${Date.now()}.png` },
    );

    const printFiles = { ...(design.printFiles ?? {}), [side]: upload.url };

    await db.update(productDesigns)
      .set({ printFiles, updatedAt: new Date() })
      .where(eq(productDesigns.id, design.id));

    return NextResponse.json({ success: true, data: { side, url: upload.url, printFiles } });
  } catch (err) {
    console.error('Storefront print-file POST error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
