import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { media, clientWebsites, brandingProfiles } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { uploadToS3 } from '@/lib/s3/upload';
import { eq, and } from 'drizzle-orm';
import sharp from 'sharp';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB
const ALLOWED_TYPES = process.env.ALLOWED_FILE_TYPES?.split(',') || [];

export async function POST(req: Request) {
  const authz = await authorizePortal({ action: 'write' });
  if (isAuthError(authz)) return authz.response;
  const { client, userId } = authz;

  const formData = await req.formData() as unknown as globalThis.FormData;
  const file = formData.get('file') as File | null;
  const alt = formData.get('alt') as string | null;
  const caption = formData.get('caption') as string | null;
  const brandingProfileIdParam = formData.get('brandingProfileId') as string | null;

  if (!file) return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
  if (ALLOWED_TYPES.length > 0 && !ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ success: false, message: `File type ${file.type} not allowed` }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, message: `File exceeds ${MAX_FILE_SIZE / 1048576}MB limit` }, { status: 400 });
  }

  // Resolve a websiteId for storage — use first client website
  const [firstSite] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(eq(clientWebsites.clientId, client.id))
    .limit(1);
  if (!firstSite) return NextResponse.json({ success: false, message: 'No websites found' }, { status: 400 });

  // Validate branding profile belongs to this client
  let brandingProfileId: number | null = null;
  if (brandingProfileIdParam) {
    const [profile] = await db
      .select({ id: brandingProfiles.id })
      .from(brandingProfiles)
      .where(and(eq(brandingProfiles.id, parseInt(brandingProfileIdParam)), eq(brandingProfiles.clientId, client.id)))
      .limit(1);
    if (profile) brandingProfileId = profile.id;
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let width: number | null = null;
  let height: number | null = null;
  if (file.type.startsWith('image/')) {
    try {
      const meta = await sharp(buffer).metadata();
      width = meta.width || null;
      height = meta.height || null;
    } catch {}
  }

  const uploadResult = await uploadToS3(buffer, file.name, file.type);

  const [newMedia] = await db.insert(media).values({
    filename: file.name,
    storedFilename: uploadResult.storedFilename,
    mimeType: uploadResult.mimeType,
    fileSize: uploadResult.fileSize,
    url: uploadResult.url,
    width,
    height,
    alt: alt || null,
    caption: caption || null,
    uploadedBy: userId,
    clientId: client.id,
    websiteId: firstSite.id,
    brandingProfileId,
  }).returning();

  return NextResponse.json({ success: true, data: newMedia }, { status: 201 });
}
