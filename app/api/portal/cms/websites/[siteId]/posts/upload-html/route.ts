import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts, media } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite, getPortalClient } from '@/lib/portal-client';
import { uploadToS3 } from '@/lib/s3/upload';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';
import { importHtmlAssets } from '@/lib/html-asset-import';
import { unpackAndUploadZip, isHttpError, MAX_ZIP_TOTAL_BYTES } from '@/lib/html-zip-upload';

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

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'page';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id as string, 10);

  const { siteId } = await params;
  const site = await resolveClientSite(userId, parseInt(siteId));
  if (!site) {
    return NextResponse.json({ success: false, message: 'Site not found' }, { status: 404 });
  }
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

  const filename = (file as File).name || 'page.html';
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
    // One media row per uploaded file, all sharing the same `media/<uuid>/`
    // S3 prefix so relative refs in the HTML resolve through the path-based
    // proxy. Skip the cleanEmbedHtml/importHtmlAssets pass for zip uploads —
    // the user has packaged a self-contained bundle and we should not rewrite
    // their relative URLs. The single-html path keeps that pre-processing.
    const rows = unpacked.entries.map((entry) => ({
      filename: entry.relativePath,
      storedFilename: entry.upload.storedFilename,
      mimeType: entry.mimeType,
      fileSize: entry.upload.fileSize,
      url: entry.upload.url,
      uploadedBy: userId,
      clientId: client.id,
      websiteId: site.id,
    }));
    await db.insert(media).values(rows);
    embedUrl = unpacked.index.upload.url;
    embedFilename = unpacked.index.relativePath;
  } else {
    const cleaned = cleanEmbedHtml(rawBuffer.toString('utf8'));
    const baseUrl = (formData.get('sourceUrl') ?? '').toString() || undefined;
    const imported = await importHtmlAssets(cleaned, {
      websiteId: site.id,
      clientId: client.id,
      uploadedBy: userId,
      baseUrl,
    });
    const buffer = Buffer.from(imported.html, 'utf8');
    const uploadResult = await uploadToS3(buffer, filename, 'text/html');

    await db.insert(media).values({
      filename,
      storedFilename: uploadResult.storedFilename,
      mimeType: 'text/html',
      fileSize: uploadResult.fileSize,
      url: uploadResult.url,
      uploadedBy: userId,
      clientId: client.id,
      websiteId: site.id,
    });
    embedUrl = uploadResult.url;
    embedFilename = filename;
  }

  // Find a free slug — append numeric suffix on collision
  const baseSlug = slugify(filename);
  let slug = baseSlug;
  for (let i = 2; i < 100; i++) {
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.slug, slug), eq(posts.websiteId, site.id)))
      .limit(1);
    if (!existing) break;
    slug = `${baseSlug}-${i}`;
  }

  const filenameNoExt = filename.replace(/\.[^.]+$/, '');
  const ts = Date.now();
  const blockContent = JSON.stringify({
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
        iframeTitle: filenameNoExt,
      },
    ],
  });

  const [post] = await db
    .insert(posts)
    .values({
      title: filenameNoExt || 'Uploaded HTML',
      slug,
      postType: 'page',
      content: blockContent,
      published: false,
      websiteId: site.id,
    })
    .returning();

  return NextResponse.json(
    { success: true, data: { id: post.id, slug: post.slug, websiteId: site.id } },
    { status: 201 }
  );
}
