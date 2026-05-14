import type { NextConfig } from "next";

// Baseline security headers — defense-in-depth alongside auth/CSRF/etc.
// CSP ships in Report-Only mode first; promote to enforcing once reports are
// reviewed. The visual editor uses an iframe preview, so frame-ancestors must
// allow same-origin. Tenant-uploaded media is served through /api/media/proxy
// which already forces Content-Disposition: attachment for non-image MIMEs
// (W1.10), so script-src can stay strict.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data: https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline' https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.youtube.com https://player.vimeo.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(self), interest-cohort=()' },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Limit static generation workers to avoid exhausting Postgres connections
  experimental: {
    workerThreads: false,
    cpus: 4,
  },
  // `isomorphic-dompurify` (used by lib/security/sanitize-html, which several
  // block renderers import) transitively pulls in jsdom → html-encoding-sniffer
  // → @exodus/bytes — and @exodus/bytes is ESM-only. Turbopack's CJS bundle
  // emits a `require()` against it and crashes every tenant SSR page with
  // ERR_REQUIRE_ESM. Marking these external punts the resolution to Node's
  // native module system, which handles the ESM/CJS interop correctly.
  serverExternalPackages: ['isomorphic-dompurify', 'jsdom'],

  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'localhost',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Turbopack configuration (Next.js 16+)
  turbopack: {
    // Empty config to acknowledge we're using Turbopack
    // GLTF/GLB files will be handled by default asset handling
  },

  // Static redirects — keep these in config, not as redirect-only page.tsx files.
  // Rendering a component that calls redirect() in Next.js 16 triggers a
  // performance.measure() warning because the RSC render aborts before the
  // end-mark is placed. Handling at the edge avoids the render entirely.
  async redirects() {
    return [
      { source: '/portal', destination: '/portal/dashboard', permanent: false },
      { source: '/portal/ai-activity', destination: '/portal/settings/ai', permanent: false },
      { source: '/portal/billing', destination: '/portal/settings/billing', permanent: false },
      { source: '/portal/invoices', destination: '/portal/settings/billing', permanent: false },
      { source: '/portal/settings', destination: '/portal/settings/profile', permanent: false },
      { source: '/portal/team', destination: '/portal/settings/team', permanent: false },
      { source: '/portal/tickets', destination: '/portal/settings/support', permanent: false },
      { source: '/portal/tools/pitch-decks', destination: '/portal/crm/proposals?tab=decks', permanent: false },
      // Public pitch-deck route renamed to /slides/. Keeps already-shared
      // /pitch-deck/<slug> URLs working on apex + every tenant host (this
      // runs before middleware, so the tenant rewrite never sees the old
      // path).
      { source: '/pitch-deck/:slug', destination: '/slides/:slug', permanent: true },
    ];
  },

  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
    ];
  },
};

export default nextConfig;
