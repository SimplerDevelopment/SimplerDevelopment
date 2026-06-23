import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, products, designs, productDesigns } from '@/lib/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { isPortalStaffWithSiteAccess } from '@/lib/storefront/portal-staff-auth';
import {
  resolveDesignerCaller,
  newDesignSessionId,
  designSessionCookieOptions,
  DESIGN_SESSION_COOKIE,
} from '@/lib/storefront/designer-auth';

async function verifyStore(websiteId: number) {
  const [store] = await db.select().from(storeSettings)
    .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
    .limit(1);
  return store;
}

// Look up existing designs for a session / customer + optional filters. Uses
// the productDesigns table (new designer) keyed off the sd_design_session cookie
// or Bearer token. Returns [] (not 404) when no match — the client expects
// { success: true, data: [...] } and handles an empty list.
//
// Legacy path: ?templates=1 still reads from the `designs` table (site-wide
// reusable templates seeded by staff).
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
    const qProductId = url.searchParams.get('productId');
    const qTemplates = url.searchParams.get('templates'); // "1" → site-wide templates (legacy)

    // Templates are site-wide reusable designs — served from legacy `designs` table.
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

    // New designer path — resolve caller from cookie or Bearer token.
    const caller = await resolveDesignerCaller(req, websiteId);

    // Build ownership filter for productDesigns.
    const conditions = [
      eq(productDesigns.websiteId, websiteId),
      isNull(productDesigns.deletedAt),
    ];

    if (caller.customerId) {
      conditions.push(eq(productDesigns.customerId, caller.customerId));
    } else if (caller.sessionId) {
      conditions.push(eq(productDesigns.sessionId, caller.sessionId));
    } else {
      // No session or customer token — return empty list (anonymous, no cookie yet).
      return NextResponse.json({ success: true, data: [] });
    }

    if (qProductId) {
      const pid = parseInt(qProductId, 10);
      if (!isNaN(pid)) conditions.push(eq(productDesigns.productId, pid));
    }

    const rows = await db.select()
      .from(productDesigns)
      .where(and(...conditions))
      .orderBy(desc(productDesigns.updatedAt))
      .limit(20);

    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    console.error('Storefront designs GET error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
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

    const body = await req.json();
    const { productId, name, layers } = body || {};

    if (!productId || typeof productId !== 'number') {
      return NextResponse.json({ success: false, message: 'productId is required' }, { status: 400 });
    }

    // Verify product belongs to this site and is designable (either column).
    const [product] = await db.select().from(products)
      .where(and(
        eq(products.id, productId),
        eq(products.websiteId, websiteId),
      ))
      .limit(1);
    if (!product) {
      return NextResponse.json({ success: false, message: 'Product not found' }, { status: 404 });
    }
    if (!product.isDesignable && !product.designable) {
      return NextResponse.json({ success: false, message: 'Product is not designable' }, { status: 400 });
    }

    // Resolve caller. Three paths:
    //   - portal staff — no customer/session linkage; design is server-authored
    //   - Bearer token → customerId from customer session
    //   - sd_design_session cookie → anonymous sessionId (minted here if absent)
    const isStaff = await isPortalStaffWithSiteAccess(req, websiteId);
    let caller = { customerId: null as number | null, sessionId: null as string | null };
    let mintedSessionId: string | null = null;

    if (!isStaff) {
      caller = await resolveDesignerCaller(req, websiteId);
      if (!caller.customerId && !caller.sessionId) {
        // Anonymous first visit — mint a session id that we'll set as a cookie.
        mintedSessionId = newDesignSessionId();
        caller = { customerId: null, sessionId: mintedSessionId };
      }
    }

    const designUuid = crypto.randomUUID();

    const [design] = await db.insert(productDesigns).values({
      uuid: designUuid,
      websiteId,
      productId,
      customerId: caller.customerId,
      sessionId: caller.sessionId,
      name: (typeof name === 'string' && name.trim()) ? name.trim() : 'Untitled Design',
      layers: Array.isArray(layers) ? layers : [],
    }).returning({
      id: productDesigns.id,
      uuid: productDesigns.uuid,
      websiteId: productDesigns.websiteId,
      productId: productDesigns.productId,
      name: productDesigns.name,
      lastAccessedAt: productDesigns.lastAccessedAt,
      isPublic: productDesigns.isPublic,
      createdAt: productDesigns.createdAt,
      updatedAt: productDesigns.updatedAt,
    });

    const response = NextResponse.json({ success: true, data: design }, { status: 201 });

    // Set the design-session cookie when we minted a new anonymous session.
    if (mintedSessionId) {
      const opts = designSessionCookieOptions();
      response.cookies.set(DESIGN_SESSION_COOKIE, mintedSessionId, opts);
    }

    return response;
  } catch (err) {
    console.error('Storefront designs POST error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
