import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, designs } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { extractToken, validateSession } from '@/lib/storefront/customer-auth';

async function verifyStore(websiteId: number) {
  const [store] = await db.select().from(storeSettings)
    .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
    .limit(1);
  return store;
}

/**
 * Clones an existing design row into a new row flagged `is_template = true`.
 * The clone has no owner (customer_id / session_id are null) so it surfaces
 * for every visitor of the storefront.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; designId: string }> }
) {
  try {
    const { siteId, designId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    if (!/^[0-9a-fA-F-]{36}$/.test(designId)) {
      return NextResponse.json({ success: false, message: 'Invalid design ID' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: string;
      name?: string;
    };
    const callerSessionId = body.sessionId || null;

    // Authorise the caller against the source design (same logic as the main
    // single-design route).
    const [source] = await db.select().from(designs)
      .where(and(eq(designs.id, designId), eq(designs.websiteId, websiteId)))
      .limit(1);
    if (!source) {
      return NextResponse.json({ success: false, message: 'Design not found' }, { status: 404 });
    }

    let authorised = false;
    const token = extractToken(req);
    if (token) {
      const customerSession = await validateSession(token);
      if (
        customerSession &&
        customerSession.websiteId === websiteId &&
        source.customerId === customerSession.customerId
      ) {
        authorised = true;
      }
    }
    if (!authorised && callerSessionId && source.sessionId === callerSessionId) {
      authorised = true;
    }
    if (!authorised) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const templateName =
      (typeof body.name === 'string' && body.name.trim()) ||
      `(template) ${source.name}`;

    const [template] = await db.insert(designs).values({
      websiteId,
      productId: source.productId,
      customerId: null,
      sessionId: null,
      name: templateName.slice(0, 255),
      layersBySurface: source.layersBySurface,
      canvasSize: source.canvasSize,
      isTemplate: true,
      status: 'draft',
    }).returning();

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (err) {
    console.error('Storefront save-as-template POST error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
