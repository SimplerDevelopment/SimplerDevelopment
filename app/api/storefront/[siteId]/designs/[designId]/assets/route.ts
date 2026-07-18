import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, designs, designAssets } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { extractToken, validateSession } from '@/lib/storefront/customer-auth';
import { isPortalStaffWithSiteAccess } from '@/lib/storefront/portal-staff-auth';
import { uploadToS3 } from '@/lib/s3/upload';
import sharp from 'sharp';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

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

  // Portal-staff path — header + auth() session + site access. Allows staff
  // to upload an image asset to any design on a site they have access to,
  // including the publisher-authored designs with NULL sessionId/customerId.
  if (await isPortalStaffWithSiteAccess(req, websiteId)) {
    return { kind: 'ok', design };
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

    const formData = await req.formData() as unknown as globalThis.FormData;
    const file = formData.get('file') as File | null;
    const sessionId = (formData.get('sessionId') as string | null) || null;

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ success: false, message: `File type ${file.type} not allowed` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: `File exceeds ${MAX_FILE_SIZE / 1048576}MB limit` }, { status: 400 });
    }

    const res = await resolveDesign(req, websiteId, designId, sessionId);
    if (res.kind === 'error') {
      return NextResponse.json({ success: false, message: res.message }, { status: res.status });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width || null;
      height = meta.height || null;
    } catch {}

    const extension = (file.name.split('.').pop() || 'png').toLowerCase();
    const key = `media/designs/${res.design.id}/assets/${crypto.randomUUID()}.${extension}`;
    const uploadResult = await uploadToS3(buffer, file.name, file.type, { key });

    const [asset] = await db.insert(designAssets).values({
      designId: res.design.id,
      url: uploadResult.url,
      storedFilename: uploadResult.storedFilename,
      originalFilename: file.name,
      mimeType: uploadResult.mimeType,
      width,
      height,
      fileSize: uploadResult.fileSize,
    }).returning();

    return NextResponse.json({
      success: true,
      data: {
        id: asset.id,
        url: asset.url,
        width: asset.width,
        height: asset.height,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('Storefront design assets POST error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
