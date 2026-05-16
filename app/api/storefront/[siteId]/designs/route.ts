import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productDesigns, products } from '@/lib/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  resolveDesignerCaller,
  newDesignSessionId,
  DESIGN_SESSION_COOKIE,
  designSessionCookieOptions,
} from '@/lib/storefront/designer-auth';

function parseSiteId(siteId: string): number | null {
  const n = parseInt(siteId, 10);
  return Number.isNaN(n) ? null : n;
}

// GET /api/storefront/[siteId]/designs?productId=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const websiteId = parseSiteId(siteId);
  if (websiteId === null) {
    return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
  }

  const caller = await resolveDesignerCaller(req, websiteId);
  if (!caller.customerId && !caller.sessionId) {
    return NextResponse.json({ success: true, data: [] });
  }

  const url = new URL(req.url);
  const productIdParam = url.searchParams.get('productId');
  const productId = productIdParam ? parseInt(productIdParam, 10) : null;

  const conditions = [
    eq(productDesigns.websiteId, websiteId),
    isNull(productDesigns.deletedAt),
  ];
  if (caller.customerId) {
    conditions.push(eq(productDesigns.customerId, caller.customerId));
  } else if (caller.sessionId) {
    conditions.push(eq(productDesigns.sessionId, caller.sessionId));
  }
  if (productId && !Number.isNaN(productId)) {
    conditions.push(eq(productDesigns.productId, productId));
  }

  const rows = await db
    .select()
    .from(productDesigns)
    .where(and(...conditions))
    .orderBy(desc(productDesigns.lastAccessedAt));

  return NextResponse.json({ success: true, data: rows });
}

// POST /api/storefront/[siteId]/designs
// Body: { productId, styleId?, side?, layers?, styleOverrides?, name?, description? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const websiteId = parseSiteId(siteId);
  if (websiteId === null) {
    return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
  }

  const body = await req.json().catch(() => null) as
    | {
        productId?: number;
        styleId?: number | null;
        side?: string | null;
        layers?: unknown[];
        styleOverrides?: Record<string, unknown>;
        name?: string;
        description?: string;
      }
    | null;

  if (!body || typeof body.productId !== 'number') {
    return NextResponse.json({ success: false, message: 'productId is required' }, { status: 400 });
  }

  // Verify product belongs to this site
  const [product] = await db
    .select({ id: products.id, websiteId: products.websiteId })
    .from(products)
    .where(eq(products.id, body.productId))
    .limit(1);
  if (!product || product.websiteId !== websiteId) {
    return NextResponse.json({ success: false, message: 'Product not found' }, { status: 404 });
  }

  const caller = await resolveDesignerCaller(req, websiteId);
  let mintedSessionId: string | null = null;
  let sessionId = caller.sessionId;
  if (!caller.customerId && !sessionId) {
    mintedSessionId = newDesignSessionId();
    sessionId = mintedSessionId;
  }

  const uuid = crypto.randomUUID();
  const now = new Date();

  const [row] = await db
    .insert(productDesigns)
    .values({
      uuid,
      websiteId,
      productId: body.productId,
      styleId: body.styleId ?? null,
      customerId: caller.customerId ?? null,
      sessionId: caller.customerId ? null : sessionId,
      name: body.name?.trim() || 'Untitled Design',
      description: body.description ?? null,
      layers: body.layers ?? [],
      styleOverrides: body.styleOverrides ?? {},
      lastAccessedAt: now,
    })
    .returning();

  const res = NextResponse.json({ success: true, data: row }, { status: 201 });
  if (mintedSessionId) {
    res.cookies.set(DESIGN_SESSION_COOKIE, mintedSessionId, designSessionCookieOptions());
  }
  return res;
}
