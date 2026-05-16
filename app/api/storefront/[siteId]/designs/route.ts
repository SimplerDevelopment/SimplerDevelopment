import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, products, designs } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { validateSession } from '@/lib/storefront/customer-auth';

async function verifyStore(websiteId: number) {
  const [store] = await db.select().from(storeSettings)
    .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
    .limit(1);
  return store;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const body = await req.json();
    const { productId, name, sessionId, customerToken } = body || {};

    if (!productId || typeof productId !== 'number') {
      return NextResponse.json({ success: false, message: 'productId is required' }, { status: 400 });
    }

    // Verify product belongs to this site and is designable
    const [product] = await db.select().from(products)
      .where(and(
        eq(products.id, productId),
        eq(products.websiteId, websiteId),
      ))
      .limit(1);
    if (!product) {
      return NextResponse.json({ success: false, message: 'Product not found' }, { status: 404 });
    }
    if (!product.isDesignable) {
      return NextResponse.json({ success: false, message: 'Product is not designable' }, { status: 400 });
    }

    // Resolve ownership: prefer customerToken, fall back to sessionId
    let customerId: number | null = null;
    let resolvedSessionId: string | null = null;

    if (customerToken && typeof customerToken === 'string') {
      const customerSession = await validateSession(customerToken);
      if (!customerSession || customerSession.websiteId !== websiteId) {
        return NextResponse.json({ success: false, message: 'Invalid customer token' }, { status: 401 });
      }
      customerId = customerSession.customerId;
    } else if (sessionId && typeof sessionId === 'string') {
      resolvedSessionId = sessionId;
    } else {
      return NextResponse.json(
        { success: false, message: 'sessionId or customerToken is required' },
        { status: 400 },
      );
    }

    const [design] = await db.insert(designs).values({
      websiteId,
      productId,
      customerId,
      sessionId: resolvedSessionId,
      name: (typeof name === 'string' && name.trim()) ? name.trim() : 'Untitled design',
      layersBySurface: {},
    }).returning({
      id: designs.id,
      name: designs.name,
      status: designs.status,
      createdAt: designs.createdAt,
    });

    return NextResponse.json({ success: true, data: design }, { status: 201 });
  } catch (err) {
    console.error('Storefront designs POST error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
