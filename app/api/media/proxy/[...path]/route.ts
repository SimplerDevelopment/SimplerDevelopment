import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { unstable_cache } from 'next/cache';
import { getS3Client, getBucketName } from '@/lib/s3/client';

// Cache the S3 round-trip in Next's data cache so the second hit on a hot
// asset (and every subsequent hit until revalidation) skips the network.
// Stored as base64 so unstable_cache's serializer can round-trip it.
const fetchProxyAsset = unstable_cache(
  async (key: string): Promise<{ body: string; contentType: string; contentLength: number } | null> => {
    const s3Client = getS3Client();
    const bucketName = getBucketName();
    const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
    const response = await s3Client.send(command);
    if (!response.Body) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return {
      body: buffer.toString('base64'),
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: buffer.length,
    };
  },
  ['media-proxy-asset'],
  // 1h server-side TTL. Files in this bucket are content-addressed (UUID
  // filenames), so the only invalidation case is a media row pointing at a
  // brand-new key — which is naturally a cache miss.
  { revalidate: 3600, tags: ['media-proxy-asset'] }
);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const key = path.join('/');

    const cached = await fetchProxyAsset(key);
    if (!cached) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }
    const buffer = Buffer.from(cached.body, 'base64');
    // Only allow inline rendering for known-safe content types. Stored S3
    // Content-Type is attacker-controllable on tenant-uploaded objects, and
    // serving HTML/SVG inline on the app origin would enable stored XSS.
    const SAFE_INLINE = new Set([
      'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/avif',
      'application/pdf',
      'video/mp4', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/ogg', 'audio/wav',
      'font/woff', 'font/woff2', 'application/font-woff',
    ]);
    // HTML uploads (html-embed block) must render inline so the iframe in
    // HtmlEmbedBlockRender doesn't get a `Content-Disposition: attachment`
    // download. The CSP `sandbox` directive forces the response into an
    // opaque origin even on top-level navigation, so a victim opening the URL
    // directly can't read the app's cookies/localStorage — same protection
    // that the iframe sandbox already gave us, now applied unconditionally.
    const IFRAME_SANDBOXED = new Set(['text/html', 'application/xhtml+xml']);
    const ct = (cached.contentType || 'application/octet-stream').toLowerCase().split(';')[0].trim();
    const sandboxed = IFRAME_SANDBOXED.has(ct);
    const inline = SAFE_INLINE.has(ct) || sandboxed;
    const headers: Record<string, string> = {
      'Content-Type': inline ? cached.contentType || ct : 'application/octet-stream',
      'Content-Length': cached.contentLength.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    };
    if (sandboxed) {
      headers['Content-Security-Policy'] =
        "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms";
    } else if (!inline) {
      const filename = key.split('/').pop() || 'download';
      headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`;
    }
    return new NextResponse(buffer, { headers });
  } catch (error) {
    console.error('Error proxying media:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load media' },
      { status: 500 }
    );
  }
}
