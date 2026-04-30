import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks, media } from '@/lib/db/schema';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { uploadToS3 } from '@/lib/s3/upload';

const MAX_HTML_SIZE = 1_000_000; // 1 MB
const ALLOWED_MIME = new Set(['text/html', 'application/xhtml+xml']);
const ALLOWED_EXT = /\.(html?|xhtml)$/i;

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'deck';
}

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

  if (!ALLOWED_EXT.test(filename)) {
    return NextResponse.json({ success: false, message: 'File must be .html, .htm, or .xhtml' }, { status: 400 });
  }
  if (reportedType && !ALLOWED_MIME.has(reportedType)) {
    return NextResponse.json({ success: false, message: `MIME type ${reportedType} is not allowed` }, { status: 400 });
  }
  if (file.size > MAX_HTML_SIZE) {
    return NextResponse.json({ success: false, message: `File exceeds ${MAX_HTML_SIZE} bytes` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadResult = await uploadToS3(buffer, filename, 'text/html');

  await db.insert(media).values({
    filename,
    storedFilename: uploadResult.storedFilename,
    mimeType: 'text/html',
    fileSize: uploadResult.fileSize,
    url: uploadResult.url,
    uploadedBy: userId,
    clientId: client.id,
  });

  const filenameNoExt = filename.replace(/\.[^.]+$/, '');
  const title = filenameNoExt || 'Uploaded HTML Deck';
  const slug = `${slugify(filename)}-${Date.now().toString(36)}`;
  const ts = Date.now();

  const slide: PitchDeckSlideV2 = {
    id: `slide-${ts}`,
    label: filenameNoExt || 'HTML',
    blocks: [
      {
        id: `block-${ts}-html`,
        type: 'html-embed',
        order: 1,
        url: uploadResult.url,
        filename,
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
