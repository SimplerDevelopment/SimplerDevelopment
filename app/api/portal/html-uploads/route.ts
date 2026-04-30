import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { uploadToS3 } from '@/lib/s3/upload';
import { getPortalClient } from '@/lib/portal-client';

const MAX_HTML_SIZE = 1_000_000; // 1 MB
const ALLOWED_MIME = new Set(['text/html', 'application/xhtml+xml']);
const ALLOWED_EXT = /\.(html?|xhtml)$/i;

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

  const buffer = Buffer.from(await file.arrayBuffer());

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
