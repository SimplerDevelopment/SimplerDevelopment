import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts, media } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite, getPortalClient } from '@/lib/portal-client';
import { uploadToS3 } from '@/lib/s3/upload';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';
import { importHtmlAssets } from '@/lib/html-asset-import';

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

  if (!ALLOWED_EXT.test(filename)) {
    return NextResponse.json({ success: false, message: 'File must be .html, .htm, or .xhtml' }, { status: 400 });
  }
  if (reportedType && !ALLOWED_MIME.has(reportedType)) {
    return NextResponse.json({ success: false, message: `MIME type ${reportedType} is not allowed` }, { status: 400 });
  }
  if (file.size > MAX_HTML_SIZE) {
    return NextResponse.json({ success: false, message: `File exceeds ${MAX_HTML_SIZE} bytes` }, { status: 400 });
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());
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
        url: uploadResult.url,
        filename,
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
