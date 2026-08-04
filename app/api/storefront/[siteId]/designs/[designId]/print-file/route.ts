// Print-file upload for a saved product design.
//
// The designer renders the canvas at print resolution client-side (same shape
// as generate-thumbnail) and POSTs it here. We validate it hard, upload to S3,
// and record it on productDesigns.printFiles keyed by side.
//
// Why the validation is strict: whatever lands here is eventually sent to
// Printful and physically printed on a garment the store owner pays for. A
// bad file is not a rendering glitch, it is scrap. Two failure modes are
// specifically guarded:
//
//   • a mockup instead of artwork — a composite of artwork over a product
//     photo is opaque, so we require an alpha channel.
//   • an under-resolution export — a canvas-sized PNG looks fine on screen
//     and prints visibly pixelated.
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { storeSettings, productDesigns } from '@/lib/db/schema';
import { uploadToS3 } from '@/lib/s3/upload';
import { resolveDesignerCaller } from '@/lib/storefront/designer-auth';

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

    const validation = await validatePrintFile(body?.printFileDataUrl);
    if (!validation.ok || !validation.buffer) {
      return NextResponse.json(
        { success: false, message: validation.message },
        { status: validation.status },
      );
    }

    const upload = await uploadToS3(
      validation.buffer,
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
