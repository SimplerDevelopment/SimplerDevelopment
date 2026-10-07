import { NextResponse } from 'next/server';

export interface ProxyAsset {
  body: string;
  contentType: string;
  contentLength: number;
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

function contentPolicy(storedContentType: string) {
  const storedCt = storedContentType || 'application/octet-stream';
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
  return { inline, sandboxed, cspSvg, contentType: inline ? inlineCt : 'application/octet-stream' };
}

function contentSecurityHeaders(policy: ReturnType<typeof contentPolicy>, key: string): Record<string, string> {
  if (policy.sandboxed) return {
    'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms',
  };
  if (policy.cspSvg) return {
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
  if (policy.inline) return {};
  const filename = key.split('/').pop() || 'download';
  return { 'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"` };
}

/** Preserve rendering policy while keeping protected bytes out of public caches. */
export function proxyAssetResponse(asset: ProxyAsset, key: string, privateAccess: boolean): NextResponse {
  const policy = contentPolicy(asset.contentType);
  const headers: Record<string, string> = {
    'Content-Type': policy.contentType,
    'Content-Length': asset.contentLength.toString(),
    'Cache-Control': privateAccess ? 'private, no-store' : 'public, max-age=31536000, immutable',
    ...(privateAccess && { Vary: 'Cookie, Authorization' }),
    'X-Content-Type-Options': 'nosniff',
    ...contentSecurityHeaders(policy, key),
  };
  return new NextResponse(Buffer.from(asset.body, 'base64'), { headers });
}
