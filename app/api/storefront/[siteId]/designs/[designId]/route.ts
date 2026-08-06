import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productDesigns } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { isPortalStaffWithSiteAccess } from '@/lib/storefront/portal-staff-auth';
import { resolveDesignerCaller } from '@/lib/storefront/designer-auth';

// Single design CRUD for the Print Designer (`product_designs`, integer ids).
//
// This path used to be shared with the legacy storefront designer (`designs`,
// 36-char uuid ids) and dispatched on id shape. The legacy subsystem was retired
// once the cart moved onto product_designs — see vault ADR
// consolidate-on-product-designs-via-uuid.

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

  // Portal-staff path — mirrors the legacy `designs` table gate above.
  // Staff with site access can read/write ANY design on the site, including
  // rows with no customerId/sessionId owner (staff-created via B2).
  if (await isPortalStaffWithSiteAccess(req, websiteId)) return { row, caller };

  // Ownership: either matching customerId or matching sessionId
  if (caller.customerId && row.customerId === caller.customerId) return { row, caller };
  if (caller.sessionId && row.sessionId === caller.sessionId) return { row, caller };

  // Public designs are accessible via /designs/public/[uuid] only.
  return { row: null, caller };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; designId: string }> },
) {
  const { siteId, designId: designIdStr } = await params;
  const websiteId = parseProductDesignId(siteId);
  const designId = parseProductDesignId(designIdStr);
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; designId: string }> },
) {
  const { siteId, designId: designIdStr } = await params;
  const websiteId = parseProductDesignId(siteId);
  const designId = parseProductDesignId(designIdStr);
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; designId: string }> },
) {
  const { siteId, designId: designIdStr } = await params;
  const websiteId = parseProductDesignId(siteId);
  const designId = parseProductDesignId(designIdStr);
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
