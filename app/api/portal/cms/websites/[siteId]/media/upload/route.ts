import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { resolveClientSite } from '@/lib/portal-client';
import { uploadToS3 } from '@/lib/s3/upload';
import sharp from 'sharp';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB
const ALLOWED_TYPES = process.env.ALLOWED_FILE_TYPES?.split(',') || [];

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const userId = parseInt(session.user.id, 10);
  const site = await resolveClientSite(userId, parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const alt = formData.get('alt') as string | null;
  const caption = formData.get('caption') as string | null;

  if (!file) return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
  if (ALLOWED_TYPES.length > 0 && !ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ success: false, message: `File type ${file.type} not allowed` }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, message: `File exceeds ${MAX_FILE_SIZE / 1048576}MB limit` }, { status: 400 });
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
    websiteId: site.id,
  }).returning();

  return NextResponse.json({ success: true, data: newMedia }, { status: 201 });
}
