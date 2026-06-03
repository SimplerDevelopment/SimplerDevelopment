import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productDesigns } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { resolveDesignerCaller } from '@/lib/storefront/designer-auth';

function parseSiteId(siteId: string): number | null {
  const n = parseInt(siteId, 10);
  return Number.isNaN(n) ? null : n;
}

function parseDesignId(id: string): number | null {
  const n = parseInt(id, 10);
  return Number.isNaN(n) ? null : n;
}

// Loads a design only if it belongs to the caller AND the site.
async function loadOwnedDesign(req: NextRequest, websiteId: number, designId: number) {
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

// GET /api/storefront/[siteId]/designs/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; id: string }> },
) {
  const { siteId, id } = await params;
  const websiteId = parseSiteId(siteId);
  const designId = parseDesignId(id);
  if (websiteId === null || designId === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const { row } = await loadOwnedDesign(req, websiteId, designId);
  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Touch lastAccessedAt on read so picker ordering reflects recency.
  await db.update(productDesigns)
    .set({ lastAccessedAt: new Date() })
    .where(eq(productDesigns.id, designId));

  return NextResponse.json({ success: true, data: row });
}

// PUT /api/storefront/[siteId]/designs/[id]
// Body: { layers?, styleOverrides?, name?, description?, thumbnailUrl?, styleId? }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; id: string }> },
) {
  const { siteId, id } = await params;
  const websiteId = parseSiteId(siteId);
  const designId = parseDesignId(id);
  if (websiteId === null || designId === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const { row } = await loadOwnedDesign(req, websiteId, designId);
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

// DELETE /api/storefront/[siteId]/designs/[id]  (soft-delete)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; id: string }> },
) {
  const { siteId, id } = await params;
  const websiteId = parseSiteId(siteId);
  const designId = parseDesignId(id);
  if (websiteId === null || designId === null) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const { row } = await loadOwnedDesign(req, websiteId, designId);
  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.update(productDesigns)
    .set({ deletedAt: new Date() })
    .where(eq(productDesigns.id, designId));

  return NextResponse.json({ success: true });
}
