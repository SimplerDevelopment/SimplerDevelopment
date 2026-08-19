import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { unstable_cache } from 'next/cache';
import sharp from 'sharp';
import { getS3Client, getBucketName } from '@/lib/s3/client';

// ITM-027 (mobile LCP): whitelist of resize widths this route will produce
// on the fly. Fixed to these four so `?w=` can't be used to mint unbounded
// distinct cached variants of every asset (arbitrary-dimension abuse) — the
// values line up with common device/DPR breakpoints (mobile, mobile@2x /
// small tablet, desktop, desktop@2x).
const ALLOWED_WIDTHS = [480, 828, 1200, 1600] as const;
type AllowedWidth = (typeof ALLOWED_WIDTHS)[number];

function isAllowedWidth(n: number): n is AllowedWidth {
  return (ALLOWED_WIDTHS as readonly number[]).includes(n);
}

// Raster formats sharp can safely decode + re-encode while PRESERVING the
// stored format (we never transcode, only resize). SVG is vector (nothing to
// raster-resize — sharp would rasterize it, silently changing the format)
// and GIF is excluded so an animated GIF never gets flattened to a single
// frame by sharp; both are intentionally left OUT of this set so the `?w=`
// path below falls through and serves them full-size, untouched.
type SharpFormat = 'png' | 'jpeg' | 'webp' | 'avif';
const RESIZABLE_CONTENT_TYPES: Record<string, SharpFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

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

// Resize step, cached separately (and keyed on key+width+format by
// unstable_cache's own argument hashing) so a repeat request for the same
// width variant skips both the S3 round-trip (nested call reuses
// fetchProxyAsset's cache entry) AND the sharp CPU work. Shares the
// 'media-proxy-asset' tag with the full-size fetch so a future
// revalidateTag('media-proxy-asset') busts both together.
const resizeProxyAsset = unstable_cache(
  async (
    key: string,
    width: AllowedWidth,
    sharpFormat: SharpFormat
  ): Promise<{ body: string; contentLength: number } | null> => {
    const source = await fetchProxyAsset(key);
    if (!source) return null;
    const buffer = Buffer.from(source.body, 'base64');
    // withoutEnlargement: never upscale a source image smaller than the
    // requested width — sharp just returns it at its original size.
    const resized = await sharp(buffer)
      .resize({ width, withoutEnlargement: true })
      .toFormat(sharpFormat)
      .toBuffer();
    return { body: resized.toString('base64'), contentLength: resized.length };
  },
  ['media-proxy-asset-resized'],
  { revalidate: 3600, tags: ['media-proxy-asset'] }
);

export async function GET(
  request: NextRequest,
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

    const storedCt = cached.contentType || 'application/octet-stream';
    const ct = storedCt.toLowerCase().split(';')[0].trim();

    // ---- ITM-027: optional `?w=` resize-on-the-fly ----
    // Width must be one of the whitelisted breakpoints — anything else is a
    // 400, not a silent passthrough, so probing arbitrary widths can't turn
    // this route into an unbounded resize oracle.
    // Plain URL parse rather than request.nextUrl: equivalent for a query
    // param, and it keeps this route callable with a plain Request (as the
    // pre-existing api-misc-routes-batch-27d tests construct it).
    const widthParam = new URL(request.url).searchParams.get('w');
    let buffer = Buffer.from(cached.body, 'base64');
    let contentLength = cached.contentLength;
    if (widthParam !== null) {
      const width = Number(widthParam);
      if (!isAllowedWidth(width)) {
        return NextResponse.json(
          { success: false, error: `Invalid width. Allowed values: ${ALLOWED_WIDTHS.join(', ')}` },
          { status: 400 }
        );
      }
      const sharpFormat = RESIZABLE_CONTENT_TYPES[ct];
      if (sharpFormat) {
        const resized = await resizeProxyAsset(key, width, sharpFormat);
        if (resized) {
          buffer = Buffer.from(resized.body, 'base64');
          contentLength = resized.contentLength;
        }
      }
      // Non-resizable types (svg/gif/pdf/video/etc.) fall through here and
      // serve the untouched full-size buffer — `?w=` is simply a no-op for
      // them rather than an error, since a caller sweeping `?w=` across a
      // mixed-format media library shouldn't have to special-case format.
    }
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
      'Content-Length': contentLength.toString(),
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
