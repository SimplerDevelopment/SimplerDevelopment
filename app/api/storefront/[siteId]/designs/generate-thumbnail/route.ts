import { NextRequest, NextResponse } from 'next/server';
import { uploadToS3 } from '@/lib/s3/upload';

// POST /api/storefront/[siteId]/designs/generate-thumbnail
// Body: { thumbnailDataUrl: "data:image/png;base64,...", layers?, styleOverrides?, productId?, styleId?, side? }
//
// Server-side rendering of a layer stack requires a headless browser
// (Puppeteer/Playwright) which we do not want on the storefront hot path.
// For v1 the editor renders the thumbnail client-side via html2canvas and
// posts the data URL here; we just upload it to S3 and hand back the URL.
//
// TODO(v2): accept layers + render server-side with @vercel/og or satori.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId, 10);
  if (Number.isNaN(websiteId)) {
    return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
  }

  const body = await req.json().catch(() => null) as { thumbnailDataUrl?: string } | null;
  if (!body?.thumbnailDataUrl || typeof body.thumbnailDataUrl !== 'string') {
    return NextResponse.json(
      { success: false, message: 'thumbnailDataUrl required (data: or https: URL)' },
      { status: 400 },
    );
  }

  // Already an https/relative URL? Just pass through.
  if (!body.thumbnailDataUrl.startsWith('data:')) {
    return NextResponse.json({ success: true, url: body.thumbnailDataUrl });
  }

  const match = body.thumbnailDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return NextResponse.json(
      { success: false, message: 'Invalid data URL — expected data:image/*;base64,...' },
      { status: 400 },
    );
  }

  const mimeType = match[1];
  const b64 = match[2];
  let buffer: Buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid base64 payload' }, { status: 400 });
  }

  const ext = mimeType.split('/')[1] || 'png';
  const filename = `design-thumb.${ext}`;

  try {
    const result = await uploadToS3(buffer, filename, mimeType);
    return NextResponse.json({ success: true, url: result.url });
  } catch (err) {
    console.error('[designs/generate-thumbnail] upload failed:', err);
    return NextResponse.json({ success: false, message: 'Upload failed' }, { status: 500 });
  }
}
