import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, designs } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { extractToken, validateSession } from '@/lib/storefront/customer-auth';
import { uploadToS3 } from '@/lib/s3/upload';

async function verifyStore(websiteId: number) {
  const [store] = await db.select().from(storeSettings)
    .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
    .limit(1);
  return store;
}

async function resolveDesign(
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

  const token = extractToken(req);
  if (token) {
    const customerSession = await validateSession(token);
    if (customerSession && customerSession.websiteId === websiteId && design.customerId === customerSession.customerId) {
      return { kind: 'ok', design };
    }
  }

  if (callerSessionId && design.sessionId && design.sessionId === callerSessionId) {
    return { kind: 'ok', design };
  }

  return { kind: 'error', status: 403, message: 'Forbidden' };
}

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

    const body = await req.json().catch(() => ({}));
    const { thumbnailDataUrl, sessionId } = body || {};

    const res = await resolveDesign(req, websiteId, designId, sessionId || null);
    if (res.kind === 'error') {
      return NextResponse.json({ success: false, message: res.message }, { status: res.status });
    }

    const updateData: Record<string, unknown> = {
      status: 'finalized',
      updatedAt: new Date(),
    };

    if (thumbnailDataUrl && typeof thumbnailDataUrl === 'string') {
      const match = thumbnailDataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
      if (!match) {
        return NextResponse.json({ success: false, message: 'Invalid thumbnailDataUrl' }, { status: 400 });
      }
      const mimeType = match[1];
      const b64 = match[2];
      const buffer = Buffer.from(b64, 'base64');
      const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
      const key = `media/designs/${res.design.id}/thumbnail.${ext}`;
      const uploadResult = await uploadToS3(buffer, `thumbnail.${ext}`, mimeType, { key });
      updateData.thumbnailUrl = uploadResult.url;
    }

    const [updated] = await db.update(designs)
      .set(updateData)
      .where(eq(designs.id, res.design.id))
      .returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('Storefront design finalize POST error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
