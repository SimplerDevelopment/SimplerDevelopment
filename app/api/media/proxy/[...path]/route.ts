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

// ITM-027 (mobile LCP): whitelist of `?w=` resize widths. Fixed to these four
// so the param can't mint unbounded cached variants of every asset — values
// line up with common device/DPR breakpoints. Values must also exist in the
// optimizer's allowed widths (Next's default deviceSizes covers all four).
const ALLOWED_WIDTHS = [480, 828, 1200, 1600];

// Content types the resize path handles. SVG is vector (resizing would
// rasterize it, silently changing the format) and GIF is excluded so an
// animated GIF is never flattened — both fall through and serve full-size.
const RESIZABLE_CONTENT_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/avif',
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const key = path.join('/');

    // ---- optional `?w=` resize ----
    // Width must be whitelisted — anything else is a 400, not a silent
    // passthrough. Validated BEFORE the S3 fetch so probing costs nothing.
    // (Plain URL parse, not request.nextUrl: equivalent for a query param and
    // callable with a plain Request, as the batch-27d tests construct it.)
    const widthParam = new URL(request.url).searchParams.get('w');
    if (widthParam !== null && !ALLOWED_WIDTHS.includes(Number(widthParam))) {
      return NextResponse.json(
        { success: false, error: `Invalid width. Allowed values: ${ALLOWED_WIDTHS.join(', ')}` },
        { status: 400 }
      );
    }

    const cached = await fetchProxyAsset(key);
    if (!cached) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    // Resize by delegating to the BUILT-IN image optimizer (/_next/image,
    // allowed for this path via next.config.ts images.localPatterns) — the
    // optimizer fetches this same route WITHOUT ?w= (no recursion) and
    // resizes on Vercel's own infra. Deliberately NOT sharp in this function:
    // a module-level sharp import once failed to load in the deployed bundle
    // and 500'd EVERY proxied image (2026-08-19 outage, reverted #64). Any
    // failure here logs and falls through to the full-size original — a
    // bigger image beats a broken one.
    if (widthParam !== null) {
      const baseCt = (cached.contentType || '').toLowerCase().split(';')[0].trim();
      if (RESIZABLE_CONTENT_TYPES.has(baseCt)) {
        try {
          const optimizerUrl = new URL(
            `/_next/image?url=${encodeURIComponent(`/api/media/proxy/${key}`)}&w=${widthParam}&q=75`,
            request.url
          );
          const optimized = await fetch(optimizerUrl, {
            // Forward Accept so the optimizer's webp/avif content negotiation
            // matches what the browser asked this route for.
            headers: { accept: request.headers.get('accept') || 'image/*' },
          });
          if (optimized.ok && optimized.body) {
            const respHeaders: Record<string, string> = {
              'Content-Type': optimized.headers.get('content-type') || cached.contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
              'X-Content-Type-Options': 'nosniff',
            };
            const len = optimized.headers.get('content-length');
            if (len) respHeaders['Content-Length'] = len;
            return new NextResponse(optimized.body, { headers: respHeaders });
          }
          console.error(`media-proxy resize: optimizer returned ${optimized.status} for ${key} w=${widthParam}; serving full-size`);
        } catch (resizeError) {
          console.error('media-proxy resize failed; serving full-size:', resizeError);
        }
      }
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
    // SVGs render inline as `<img>` thumbnails in the media manager + as block
    // icons across the editor — but unrestricted SVG also enables stored XSS
    // (SVGs can embed <script> and on*= handlers). Serve them with a
    // restrictive CSP that lets the browser paint the vector but blocks
    // script execution and outbound subresource fetches. The browser still
    // renders <img src=".svg"> tags normally; only navigating to the URL or
    // inlining via <object>/<iframe> hits the CSP wall.
    const SVG_INLINE = new Set(['image/svg+xml']);
    const storedCt = cached.contentType || 'application/octet-stream';
    const ct = storedCt.toLowerCase().split(';')[0].trim();
    const sandboxed = IFRAME_SANDBOXED.has(ct);
    const cspSvg = SVG_INLINE.has(ct);
    const inline = SAFE_INLINE.has(ct) || sandboxed || cspSvg;
    // Tenant-uploaded HTML rarely declares <meta charset>. Without an explicit
    // charset in the response header, browsers fall back to Windows-1252 and
    // mangle UTF-8 (em-dash, smart quotes, etc.) into mojibake. Force utf-8
    // for HTML/XHTML unless the stored CT already specifies a charset.
    const inlineCt = sandboxed && !/charset=/i.test(storedCt)
      ? `${ct}; charset=utf-8`
      : storedCt;
    const headers: Record<string, string> = {
      'Content-Type': inline ? inlineCt : 'application/octet-stream',
      'Content-Length': cached.contentLength.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    };
    if (sandboxed) {
      headers['Content-Security-Policy'] =
        "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms";
    } else if (cspSvg) {
      // Block <script>, foreignObject scripts, and outbound fetches from the
      // SVG. <img src=".svg"> ignores CSP (browsers paint the vector
      // regardless), but if someone embeds the file via <object>/<iframe>
      // or navigates to the URL directly, this stops it from running JS.
      headers['Content-Security-Policy'] =
        "default-src 'none'; style-src 'unsafe-inline'; sandbox";
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
