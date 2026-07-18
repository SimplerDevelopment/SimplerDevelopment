import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3 } from '@/lib/s3/upload';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB

// POST /api/storefront/[siteId]/designs/upload-image  (multipart/form-data, `file`)
// Customer-supplied image for use as a designer layer. Returns { url }.
// Open to anonymous sessions — abuse mitigation is left to upstream rate
// limiting + CAPTCHA on the editor side.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId, 10);
  if (Number.isNaN(websiteId)) {
    return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
  }

  try {
    const formData = await request.formData() as unknown as globalThis.FormData;
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ success: false, message: 'Only image uploads are allowed' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, message: `File exceeds ${MAX_FILE_SIZE} bytes` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await uploadToS3(buffer, file.name, file.type);

    return NextResponse.json({ success: true, url: result.url });
  } catch (err) {
    console.error('[designs/upload-image] upload failed:', err);
    return NextResponse.json({ success: false, message: 'Upload failed' }, { status: 500 });
  }
}
