import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks, media } from '@/lib/db/schema';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { uploadToS3 } from '@/lib/s3/upload';
import { unpackAndUploadZip, isHttpError, MAX_ZIP_TOTAL_BYTES } from '@/lib/html-zip-upload';
import { slugify } from '@/lib/publishing/slug';

const MAX_HTML_SIZE = 1_000_000; // 1 MB
const ALLOWED_HTML_MIME = new Set(['text/html', 'application/xhtml+xml']);
const ALLOWED_HTML_EXT = /\.(html?|xhtml)$/i;
const ALLOWED_ZIP_MIME = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'multipart/x-zip',
]);
const ALLOWED_ZIP_EXT = /\.zip$/i;

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const authResult = await authorizePortal({ action: 'write', requireService: 'pitch-decks' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id as string, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = (await request.formData()) as unknown as FormData;
  } catch {
    return NextResponse.json({ success: false, message: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
  }

  const filename = (file as File).name || 'deck.html';
  const reportedType = file.type || '';

  const isZip = ALLOWED_ZIP_EXT.test(filename) || ALLOWED_ZIP_MIME.has(reportedType);
  const isHtml = ALLOWED_HTML_EXT.test(filename);

  if (!isZip && !isHtml) {
    return NextResponse.json(
      { success: false, message: 'File must be .html, .htm, .xhtml, or .zip' },
      { status: 400 }
    );
  }
  if (!isZip && reportedType && !ALLOWED_HTML_MIME.has(reportedType)) {
    return NextResponse.json(
      { success: false, message: `MIME type ${reportedType} is not allowed` },
      { status: 400 }
    );
  }
  if (isZip && file.size > MAX_ZIP_TOTAL_BYTES) {
    return NextResponse.json(
      { success: false, message: `Zip exceeds ${MAX_ZIP_TOTAL_BYTES} bytes` },
      { status: 400 }
    );
  }
  if (!isZip && file.size > MAX_HTML_SIZE) {
    return NextResponse.json(
      { success: false, message: `File exceeds ${MAX_HTML_SIZE} bytes` },
      { status: 400 }
    );
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  let embedUrl: string;
  let embedFilename: string;

  if (isZip) {
    let unpacked;
    try {
      unpacked = await unpackAndUploadZip(rawBuffer);
    } catch (err) {
      if (isHttpError(err)) {
        return NextResponse.json(
          { success: false, message: err.message },
          { status: err.statusCode }
        );
      }
      throw err;
    }
    // Insert one media row per uploaded file. The index is the entry point
    // shown in the html-embed block; siblings live at the same `media/<uuid>/`
    // S3 prefix and resolve through the path-based proxy.
    const rows = unpacked.entries.map((entry) => ({
      filename: entry.relativePath,
      storedFilename: entry.upload.storedFilename,
      mimeType: entry.mimeType,
      fileSize: entry.upload.fileSize,
      url: entry.upload.url,
      uploadedBy: userId,
      clientId: client.id,
    }));
    await db.insert(media).values(rows);
    embedUrl = unpacked.index.upload.url;
    embedFilename = unpacked.index.relativePath;
  } else {
    const uploadResult = await uploadToS3(rawBuffer, filename, 'text/html');
    await db.insert(media).values({
      filename,
      storedFilename: uploadResult.storedFilename,
      mimeType: 'text/html',
      fileSize: uploadResult.fileSize,
      url: uploadResult.url,
      uploadedBy: userId,
      clientId: client.id,
    });
    embedUrl = uploadResult.url;
    embedFilename = filename;
  }

  const filenameNoExt = filename.replace(/\.[^.]+$/, '');
  const title = filenameNoExt || 'Uploaded HTML Deck';
  const slug = `${slugify(filenameNoExt, 80) || 'deck'}-${Date.now().toString(36)}`;
  const ts = Date.now();

  const slide: PitchDeckSlideV2 = {
    id: `slide-${ts}`,
    label: filenameNoExt || 'HTML',
    blocks: [
      {
        id: `block-${ts}-html`,
        type: 'html-embed',
        order: 1,
        url: embedUrl,
        filename: embedFilename,
        height: '100vh',
        width: 'full',
        sandbox: 'scripts',
        iframeTitle: filenameNoExt || 'Embedded HTML slide',
      },
    ],
  };

  const [deck] = await db
    .insert(pitchDecks)
    .values({
      clientId: client.id,
      title,
      slug,
      description: null,
      slides: [slide],
      formatVersion: 2,
      // Single uploaded HTML deck — strip the slide-counter chrome so the
      // embedded HTML can present without overlay.
      theme: {
        primaryColor: '#2563eb',
        accentColor: '#60a5fa',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
        headingFont: 'Inter',
        bodyFont: 'Inter',
        showSlideNumber: false,
      },
      createdBy: userId,
    })
    .returning();

  return NextResponse.json({ success: true, data: { id: deck.id, slug: deck.slug } }, { status: 201 });
}
