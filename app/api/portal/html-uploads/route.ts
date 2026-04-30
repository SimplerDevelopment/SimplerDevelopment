import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { uploadToS3 } from '@/lib/s3/upload';
import { getPortalClient, resolveClientSite } from '@/lib/portal-client';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';
import { importHtmlAssets } from '@/lib/html-asset-import';

const MAX_HTML_SIZE = 1_000_000; // 1 MB
const ALLOWED_MIME = new Set(['text/html', 'application/xhtml+xml']);
const ALLOWED_EXT = /\.(html?|xhtml)$/i;

// Asset import can hit dozens of external URLs sequentially before the
// upload finishes. Keep this aligned with the platform-level function limit.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userId = parseInt(session.user.id as string, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, error: 'No portal client found' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = (await request.formData()) as unknown as FormData;
  } catch {
    return NextResponse.json({ success: false, error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
  }

  const filename = (file as File).name || 'embed.html';
  const reportedType = file.type || '';

  if (!ALLOWED_EXT.test(filename)) {
    return NextResponse.json(
      { success: false, error: 'File must be .html, .htm, or .xhtml' },
      { status: 400 }
    );
  }
  if (reportedType && !ALLOWED_MIME.has(reportedType)) {
    return NextResponse.json(
      { success: false, error: `MIME type ${reportedType} is not allowed` },
      { status: 400 }
    );
  }
  if (file.size > MAX_HTML_SIZE) {
    return NextResponse.json(
      { success: false, error: `File exceeds ${MAX_HTML_SIZE} bytes` },
      { status: 400 }
    );
  }

  // Optional websiteId — when present we import external assets into the
  // site's media manager and rewrite refs. Without it we just clean the
  // wrapper tags and store the file as-is.
  const websiteIdRaw = formData.get('websiteId');
  const websiteIdNum = typeof websiteIdRaw === 'string' ? parseInt(websiteIdRaw, 10) : NaN;
  let websiteId: number | undefined;
  if (Number.isFinite(websiteIdNum)) {
    const site = await resolveClientSite(userId, websiteIdNum);
    if (site) websiteId = site.id;
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const cleaned = cleanEmbedHtml(rawBuffer.toString('utf8'));

  let processed = cleaned;
  if (websiteId !== undefined) {
    const baseUrl = (formData.get('sourceUrl') ?? '').toString() || undefined;
    const result = await importHtmlAssets(cleaned, {
      websiteId,
      clientId: client.id,
      uploadedBy: userId,
      baseUrl,
    });
    processed = result.html;
  }
  const buffer = Buffer.from(processed, 'utf8');

  // Force Content-Type to text/html so the proxy serves it as a navigable
  // document. Sandboxing on the iframe is the security barrier — not the
  // Content-Type header.
  const uploadResult = await uploadToS3(buffer, filename, 'text/html');

  const [row] = await db
    .insert(media)
    .values({
      filename,
      storedFilename: uploadResult.storedFilename,
      mimeType: 'text/html',
      fileSize: uploadResult.fileSize,
      url: uploadResult.url,
      uploadedBy: userId,
      clientId: client.id,
      websiteId,
    })
    .returning();

  return NextResponse.json(
    {
      success: true,
      data: {
        id: row.id,
        url: row.url,
        filename: row.filename,
        fileSize: row.fileSize,
      },
    },
    { status: 201 }
  );
}
