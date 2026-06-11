import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  storeSettings,
  designs,
  productDesigns,
  productDesignSurfaces,
  productImages,
} from '@/lib/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { extractToken, validateSession } from '@/lib/storefront/customer-auth';
import { isPortalStaffWithSiteAccess } from '@/lib/storefront/portal-staff-auth';
import { resolveDesignerCaller } from '@/lib/storefront/designer-auth';

// This path is shared by two designer subsystems that the product-designer
// consolidation merged onto the same URL:
//   • Legacy storefront designer — `designs` table, 36-char UUID ids.
//   • New product designer        — `productDesigns` table, integer ids.
// Next.js forbids sibling dynamic segments with different param names
// (`[designId]` vs `[id]`), so both now live under `[designId]` and the
// exported handlers dispatch by id format: numeric → product-designs handlers
// at the bottom of this file; UUID → the legacy handlers below.
const LEGACY_DESIGN_ID = /^[0-9a-fA-F-]{36}$/;

async function verifyStore(websiteId: number) {
  const [store] = await db.select().from(storeSettings)
    .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
    .limit(1);
  return store;
}

/**
 * Resolves the design and verifies the caller owns it via:
 *   - Authorization: Bearer <customerToken> matching design.customerId, OR
 *   - sessionId (query string for GET/DELETE; body for PUT) matching design.sessionId
 */
async function resolveDesignWithAuthz(
  req: Request,
  websiteId: number,
  designId: string,
  callerSessionId: string | null,
): Promise<
  | { kind: 'ok'; design: typeof designs.$inferSelect }
  | { kind: 'error'; status: number; message: string }
> {
  if (!/^[0-9a-fA-F-]{36}$/.test(designId)) {
    return { kind: 'error', status: 400, message: 'Invalid design ID' };
  }

  const [design] = await db.select().from(designs)
    .where(and(eq(designs.id, designId), eq(designs.websiteId, websiteId)))
    .limit(1);

  if (!design) {
    return { kind: 'error', status: 404, message: 'Design not found' };
  }

  // Portal-staff path — set by the x-portal-staff header on admin requests.
  // Staff with site access can read/write ANY design on the site, including
  // store-mode designs that have no sessionId/customerId.
  if (await isPortalStaffWithSiteAccess(req, websiteId)) {
    return { kind: 'ok', design };
  }

  // Try logged-in customer auth first
  const token = extractToken(req);
  if (token) {
    const customerSession = await validateSession(token);
    if (customerSession && customerSession.websiteId === websiteId && design.customerId === customerSession.customerId) {
      return { kind: 'ok', design };
    }
  }

  // Fall back to guest sessionId
  if (callerSessionId && design.sessionId && design.sessionId === callerSessionId) {
    return { kind: 'ok', design };
  }

  return { kind: 'error', status: 403, message: 'Forbidden' };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; designId: string }> }
) {
  try {
    const { siteId, designId } = await params;
    if (!LEGACY_DESIGN_ID.test(designId)) return productDesignGET(req, siteId, designId);
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    const res = await resolveDesignWithAuthz(req, websiteId, designId, sessionId);
    if (res.kind === 'error') {
      return NextResponse.json({ success: false, message: res.message }, { status: res.status });
    }

    return NextResponse.json({ success: true, data: res.design });
  } catch (err) {
    console.error('Storefront design GET error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; designId: string }> }
) {
  try {
    const { siteId, designId } = await params;
    if (!LEGACY_DESIGN_ID.test(designId)) return productDesignPUT(req, siteId, designId);
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const body = await req.json();
    const { name, layersBySurface, canvasSize, status, sessionId } = body || {};

    const res = await resolveDesignWithAuthz(req, websiteId, designId, sessionId || null);
    if (res.kind === 'error') {
      return NextResponse.json({ success: false, message: res.message }, { status: res.status });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ success: false, message: 'name must be a non-empty string' }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (layersBySurface !== undefined) {
      if (typeof layersBySurface !== 'object' || layersBySurface === null || Array.isArray(layersBySurface)) {
        return NextResponse.json({ success: false, message: 'layersBySurface must be an object' }, { status: 400 });
      }
      updateData.layersBySurface = layersBySurface;
    }
    if (canvasSize !== undefined) {
      if (typeof canvasSize !== 'object' || canvasSize === null) {
        return NextResponse.json({ success: false, message: 'canvasSize must be an object' }, { status: 400 });
      }
      updateData.canvasSize = canvasSize;
    }
    if (status !== undefined) {
      if (!['draft', 'finalized', 'rendered'].includes(status)) {
        return NextResponse.json({ success: false, message: 'invalid status' }, { status: 400 });
      }
      updateData.status = status;
    }

    const [updated] = await db.update(designs)
      .set(updateData)
      .where(eq(designs.id, res.design.id))
      .returning();

    // Post-save mockup regen — fire-and-forget, fail-soft. When portal staff
    // edits a store-mode template design (isTemplate=true, productId set,
    // layersBySurface changed), re-run the sharp composite so the product
    // detail page's hero image reflects the edit immediately. Without this,
    // designs.renderedUrl + productImages.url stay pointed at the OLD render
    // and customers see stale artwork after staff tweaks.
    //
    // Skip the regen if: it's not the staff path, the layers weren't touched,
    // the design isn't template-flagged, or there's no productId to update.
    // Errors are logged but never bubbled to the PUT response — the design
    // save itself succeeded.
    const isStaff = req.headers.get('x-portal-staff') === '1';
    if (
      isStaff &&
      layersBySurface !== undefined &&
      updated &&
      updated.isTemplate &&
      updated.productId !== null
    ) {
      void regenerateMockupForStaffSave(updated).catch((err) => {
        console.error('[design-PUT] regen failed (non-fatal):', err);
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('Storefront design PUT error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Re-render the flat composite mockup (artwork over blank shirt) for the
 * just-saved design and roll the new URL into designs.renderedUrl +
 * the product's order=0 productImages row.
 *
 * Best-effort: any failure here is logged and swallowed by the caller. The
 * design data is already saved; this just refreshes the cosmetic artifacts.
 *
 * Why only the flat composite (no lifestyle photo): re-running gpt-image-1
 * for the woman/baby model shot is expensive (~$0.08) and slow (~30s). The
 * flat composite is cheap and instant. Staff can manually trigger a lifestyle
 * regen via scripts/magamommy/regenerate-lifestyle-hero.ts when needed.
 */
async function regenerateMockupForStaffSave(
  design: typeof designs.$inferSelect,
): Promise<void> {
  const productId = design.productId;
  if (productId === null) return;

  // Lazy-load the heavy deps so we don't pull sharp + S3 into every PUT
  // request that doesn't need a regen.
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getS3Client, getBucketName } = await import('@/lib/s3/client');
  const { uploadToS3 } = await import('@/lib/s3/upload');
  const { compositeArtworkOnShirt } = await import('@/lib/magamommy/composite');

  type Layer = {
    type?: string;
    data?: {
      url?: string;
      printReadyUrl?: string;
    };
  };
  const layersBySurface = (design.layersBySurface ?? {}) as Record<string, Layer[]>;

  // Pick the first surface that has an image layer to composite. Most
  // magamommy products are front-only; back-only is rare. The publisher
  // creates a front-surface design row.
  let surfaceSlug: string | null = null;
  let artworkUrl: string | null = null;
  for (const slug of Object.keys(layersBySurface)) {
    const imageLayer = (layersBySurface[slug] ?? []).find((l) => l.type === 'image' && l.data?.url);
    if (imageLayer?.data) {
      surfaceSlug = slug;
      // Prefer the 4x print-ready URL if it exists (better quality on the
      // composite); fall back to the 1024 base URL.
      artworkUrl = imageLayer.data.printReadyUrl ?? imageLayer.data.url ?? null;
      break;
    }
  }
  if (!surfaceSlug || !artworkUrl) {
    console.log('[design-PUT] regen skipped — no image layer found');
    return;
  }

  // Resolve the surface's print-area bounds + the blank mockup image.
  const [surface] = await db
    .select()
    .from(productDesignSurfaces)
    .where(
      and(
        eq(productDesignSurfaces.productId, productId),
        eq(productDesignSurfaces.slug, surfaceSlug),
      ),
    )
    .limit(1);
  if (!surface) {
    console.log(`[design-PUT] regen skipped — no surface ${surfaceSlug} on product ${productId}`);
    return;
  }

  const s3 = getS3Client();
  const bucket = getBucketName();

  // Fetch the artwork. URLs are /api/media/proxy/<key> — we go direct to S3.
  const artworkKeyMatch = artworkUrl.match(/\/api\/media\/proxy\/(.+)$/);
  if (!artworkKeyMatch) {
    console.log(`[design-PUT] regen skipped — unrecognized artwork URL: ${artworkUrl}`);
    return;
  }
  const artworkObj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: decodeURIComponent(artworkKeyMatch[1]) }));
  if (!artworkObj.Body) return;
  const artworkBytes = await artworkObj.Body.transformToByteArray();
  const artworkBuf = Buffer.from(artworkBytes);

  // Fetch the base mockup. Same /api/media/proxy/<key> shape, OR a relative
  // /assets/... path (the magamommy seed uses /assets/magamommy/blank-tee-...)
  // OR an absolute external URL. Handle each.
  let baseMockupBuf: Buffer;
  const mockupUrl = surface.mockupImage;
  const mockupS3Match = mockupUrl.match(/\/api\/media\/proxy\/(.+)$/);
  if (mockupS3Match) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: decodeURIComponent(mockupS3Match[1]) }));
    if (!obj.Body) return;
    const bytes = await obj.Body.transformToByteArray();
    baseMockupBuf = Buffer.from(bytes);
  } else if (mockupUrl.startsWith('/')) {
    // Relative file path served by public/ — read from disk.
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');
    const filePath = path.join(process.cwd(), 'public', mockupUrl);
    baseMockupBuf = await fs.readFile(filePath);
  } else {
    const fetched = await fetch(mockupUrl);
    if (!fetched.ok) {
      console.log(`[design-PUT] regen skipped — failed to fetch mockup ${mockupUrl}: ${fetched.status}`);
      return;
    }
    baseMockupBuf = Buffer.from(await fetched.arrayBuffer());
  }

  // Run the composite.
  const compositePng = await compositeArtworkOnShirt({
    artworkPng: artworkBuf,
    baseMockupPng: baseMockupBuf,
    printArea: {
      x: surface.printAreaX,
      y: surface.printAreaY,
      width: surface.printAreaWidth,
      height: surface.printAreaHeight,
    },
  });

  // Upload the new composite.
  const ts = Date.now();
  const outKey = `media/magamommy/mockups/regen-${design.id}-${surfaceSlug}-${ts}.png`;
  const upload = await uploadToS3(compositePng, `mockup-${surfaceSlug}.png`, 'image/png', { key: outKey });

  // Update designs.renderedUrl + thumbnailUrl so the next read sees the fresh
  // composite. Also update the product's order=0 product_images row so the
  // storefront product card / detail page swaps to the new render.
  await db
    .update(designs)
    .set({ renderedUrl: upload.url, thumbnailUrl: upload.url, updatedAt: new Date() })
    .where(eq(designs.id, design.id));

  const [primaryImage] = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.order))
    .limit(1);
  if (primaryImage) {
    await db
      .update(productImages)
      .set({ url: upload.url })
      .where(eq(productImages.id, primaryImage.id));
  }

  console.log(`[design-PUT] regen ✓ design=${design.id} product=${productId} → ${upload.url}`);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; designId: string }> }
) {
  try {
    const { siteId, designId } = await params;
    if (!LEGACY_DESIGN_ID.test(designId)) return productDesignDELETE(req, siteId, designId);
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    const res = await resolveDesignWithAuthz(req, websiteId, designId, sessionId);
    if (res.kind === 'error') {
      return NextResponse.json({ success: false, message: res.message }, { status: res.status });
    }

    await db.delete(designs).where(eq(designs.id, res.design.id));

    return NextResponse.json({ success: true, message: 'Design deleted' });
  } catch (err) {
    console.error('Storefront design DELETE error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// ───────────────────────────────────────────────────────────────────────────
// New product-designer handlers (productDesigns table, integer ids).
// Dispatched to from the exported GET/PUT/DELETE above when the id is numeric.
// Logic is preserved verbatim from the former `/designs/[id]/route.ts` (auth,
// ownership, soft-delete, lastAccessedAt) — only the param name differs.

function parseProductDesignId(value: string): number | null {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

// Loads a design only if it belongs to the caller AND the site.
async function loadOwnedProductDesign(req: NextRequest, websiteId: number, designId: number) {
  const caller = await resolveDesignerCaller(req, websiteId);
  const [row] = await db
    .select()
    .from(productDesigns)
    .where(and(
      eq(productDesigns.id, designId),
      eq(productDesigns.websiteId, websiteId),
      isNull(productDesigns.deletedAt),
    ))
    .limit(1);
  if (!row) return { row: null, caller };

  // Ownership: either matching customerId or matching sessionId
  if (caller.customerId && row.customerId === caller.customerId) return { row, caller };
  if (caller.sessionId && row.sessionId === caller.sessionId) return { row, caller };

  // Public designs are accessible via /designs/public/[uuid] only.
  return { row: null, caller };
}

async function productDesignGET(req: NextRequest, siteIdStr: string, idStr: string) {
  const websiteId = parseProductDesignId(siteIdStr);
  const designId = parseProductDesignId(idStr);
  if (websiteId === null || designId === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const { row } = await loadOwnedProductDesign(req, websiteId, designId);
  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Touch lastAccessedAt on read so picker ordering reflects recency.
  await db.update(productDesigns)
    .set({ lastAccessedAt: new Date() })
    .where(eq(productDesigns.id, designId));

  return NextResponse.json({ success: true, data: row });
}

async function productDesignPUT(req: NextRequest, siteIdStr: string, idStr: string) {
  const websiteId = parseProductDesignId(siteIdStr);
  const designId = parseProductDesignId(idStr);
  if (websiteId === null || designId === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const { row } = await loadOwnedProductDesign(req, websiteId, designId);
  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => null) as
    | {
        layers?: unknown[];
        styleOverrides?: Record<string, unknown>;
        name?: string;
        description?: string | null;
        thumbnailUrl?: string | null;
        styleId?: number | null;
      }
    | null;
  if (!body) return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });

  const updates: Record<string, unknown> = { lastAccessedAt: new Date(), updatedAt: new Date() };
  if (Array.isArray(body.layers)) updates.layers = body.layers;
  if (body.styleOverrides !== undefined) updates.styleOverrides = body.styleOverrides;
  if (typeof body.name === 'string') updates.name = body.name.trim() || 'Untitled Design';
  if (body.description !== undefined) updates.description = body.description;
  if (body.thumbnailUrl !== undefined) updates.thumbnailUrl = body.thumbnailUrl;
  if (body.styleId !== undefined) updates.styleId = body.styleId;

  const [updated] = await db.update(productDesigns)
    .set(updates)
    .where(eq(productDesigns.id, designId))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

async function productDesignDELETE(req: NextRequest, siteIdStr: string, idStr: string) {
  const websiteId = parseProductDesignId(siteIdStr);
  const designId = parseProductDesignId(idStr);
  if (websiteId === null || designId === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const { row } = await loadOwnedProductDesign(req, websiteId, designId);
  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.update(productDesigns)
    .set({ deletedAt: new Date() })
    .where(eq(productDesigns.id, designId));

  return NextResponse.json({ success: true });
}
