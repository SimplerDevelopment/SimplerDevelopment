import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, products, designs } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { validateSession } from '@/lib/storefront/customer-auth';

async function verifyStore(websiteId: number) {
  const [store] = await db.select().from(storeSettings)
    .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
    .limit(1);
  return store;
}

// Look up existing designs for a session / customer + optional filters. Used
// by DesignerClient to restore an in-progress draft when a customer returns
// to the designer page. Returns [] (not 404) when no match — the client
// expects { success: true, data: [...] } and handles an empty list.
export async function GET(
  req: NextRequest,
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

    const url = new URL(req.url);
    const qSessionId = url.searchParams.get('sessionId');
    const qCustomerToken = url.searchParams.get('customerToken');
    const qProductId = url.searchParams.get('productId');
    const qStatus = url.searchParams.get('status'); // draft|finalized|rendered
    const qTemplates = url.searchParams.get('templates'); // "1" → site-wide templates

    // Templates are site-wide reusable designs — no session/customer scoping.
    if (qTemplates === '1') {
      const templateConditions = [
        eq(designs.websiteId, websiteId),
        eq(designs.isTemplate, true),
      ];
      if (qProductId) {
        const pid = parseInt(qProductId, 10);
        if (!isNaN(pid)) templateConditions.push(eq(designs.productId, pid));
      }
      const rows = await db.select()
        .from(designs)
        .where(and(...templateConditions))
        .orderBy(desc(designs.updatedAt))
        .limit(50);
      return NextResponse.json({ success: true, data: rows });
    }

    // Ownership filter: either sessionId or customerToken must scope the
    // query — we never return another visitor's designs.
    const conditions = [eq(designs.websiteId, websiteId)];
    if (qCustomerToken) {
      const customerSession = await validateSession(qCustomerToken);
      if (!customerSession || customerSession.websiteId !== websiteId) {
        return NextResponse.json({ success: false, message: 'Invalid customer token' }, { status: 401 });
      }
      conditions.push(eq(designs.customerId, customerSession.customerId));
    } else if (qSessionId) {
      conditions.push(eq(designs.sessionId, qSessionId));
    } else {
      return NextResponse.json(
        { success: false, message: 'sessionId or customerToken is required' },
        { status: 400 },
      );
    }
    if (qProductId) {
      const pid = parseInt(qProductId, 10);
      if (!isNaN(pid)) conditions.push(eq(designs.productId, pid));
    }
    if (qStatus && ['draft', 'finalized', 'rendered'].includes(qStatus)) {
      conditions.push(eq(designs.status, qStatus));
    }

    const rows = await db.select()
      .from(designs)
      .where(and(...conditions))
      .orderBy(desc(designs.updatedAt))
      .limit(20);

    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('Storefront designs GET error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
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
