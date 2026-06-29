import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { media, mediaVersions } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { uploadToS3 } from '@/lib/s3/upload';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';
import { importHtmlAssets } from '@/lib/html-asset-import';
import { and, eq } from 'drizzle-orm';

const MAX_HTML_SIZE = 1_000_000;

export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return await handle(req, params);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[media/replace] failed:', err);
    return NextResponse.json(
      { success: false, message: `replace failed: ${message}` },
      { status: 500 }
    );
  }
}

async function handle(req: NextRequest, paramsPromise: Promise<{ id: string }>) {
  const authz = await authorizePortal({ action: 'write' });
  if (isAuthError(authz)) return authz.response;
  const { client, userId } = authz;

  const { id } = await paramsPromise;
  const mediaId = parseInt(id, 10);
  if (!Number.isFinite(mediaId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.clientId, client.id)))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Media not found' }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = (await req.formData()) as unknown as FormData;
  } catch {
    return NextResponse.json({ success: false, message: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
  }

  const filename = (file as File).name || existing.filename;
  const isHtml = /^text\/html|application\/xhtml\+xml/i.test(file.type) || /\.(html?|xhtml)$/i.test(filename);
  if (isHtml && file.size > MAX_HTML_SIZE) {
    return NextResponse.json({ success: false, message: `File exceeds ${MAX_HTML_SIZE} bytes` }, { status: 400 });
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  let buffer = rawBuffer;
  let mimeType = file.type || existing.mimeType;
  if (isHtml) {
    const cleaned = cleanEmbedHtml(rawBuffer.toString('utf8'));
    let processed = cleaned;
    if (existing.websiteId !== null && existing.websiteId !== undefined) {
      const baseUrl = (formData.get('sourceUrl') ?? '').toString() || undefined;
      const result = await importHtmlAssets(cleaned, {
        websiteId: existing.websiteId,
        clientId: client.id,
        uploadedBy: userId,
        baseUrl,
      });
      processed = result.html;
    }
    buffer = Buffer.from(processed, 'utf8');
    mimeType = 'text/html';
  }

  const uploadResult = await uploadToS3(buffer, filename, mimeType);

  // Snapshot the soon-to-be-replaced state before mutating the row.
  await db.insert(mediaVersions).values({
    mediaId: existing.id,
    version: existing.version,
    filename: existing.filename,
    storedFilename: existing.storedFilename,
    mimeType: existing.mimeType,
    fileSize: existing.fileSize,
    url: existing.url,
    uploadedBy: existing.uploadedBy,
  });

  const [updated] = await db
    .update(media)
    .set({
      filename,
      storedFilename: uploadResult.storedFilename,
      mimeType: uploadResult.mimeType,
      fileSize: uploadResult.fileSize,
      url: uploadResult.url,
      version: existing.version + 1,
      uploadedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(media.id, existing.id))
    .returning();

  return NextResponse.json({
    success: true,
    data: {
      id: updated.id,
      url: updated.url,
      filename: updated.filename,
      fileSize: updated.fileSize,
      version: updated.version,
    },
  });
}
